import { Room, Client, type AuthContext } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
export class Player extends Schema {
  id = ''; name = ''; seat = -1; x = 0.5; y = 0.84; color = '#a78bfa'; yaw = 0;
}
defineTypes(Player, { id:'string', name:'string', seat:'number', x:'number', y:'number', color:'string', yaw:'number' });
export class RoomState extends Schema {
  players = new MapSchema<Player>(); channel = ''; viewerCount = 0; capacity = 12;
}
defineTypes(RoomState, { players:{map:Player}, channel:'string', viewerCount:'number', capacity:'number' });
export type Identity = { id:string; login:string; displayName:string; avatar:string };
export const services: {
  capacity: (channel:string)=>number;
  sendingConfigured: boolean;
  hype: (channel:string, users:Identity[])=>Promise<void>;
  authenticate: (request:AuthContext)=>Promise<Identity | undefined>;
  chat: (channel:string, user:Identity | undefined, text:string)=>Promise<void>;
  subscribe: (channel:string, user:Identity, relay:(payload:unknown)=>void)=>()=>void;
} = { capacity:()=>12, sendingConfigured:false, hype:async()=>{}, authenticate:async()=>undefined, chat:async()=>{}, subscribe:()=>()=>{} };
export class Theater extends Room<RoomState> {
  private limits = new Map<string,{chat:number; emotes:number[]; moves:number[]; moved:number; wave:number}>();
  private reactions:{time:number;player:string}[]=[];
  private hypeCooldown=new Map<number,number>();
  private subscriptions = new Map<string,()=>void>();
  onCreate(options: {channel?:unknown}) {
    if (typeof options.channel !== 'string' || !/^[a-z0-9_]{1,25}$/.test(options.channel)) throw new Error('Invalid channel: use lowercase Twitch login');
    this.roomId = options.channel;
    this.maxClients = Infinity;
    this.setState(new RoomState()); this.state.channel = options.channel;
    this.state.capacity=services.capacity(options.channel);
    this.onMessage('move',(client, data)=>{
      const p=this.state.players.get(client.sessionId);
      if (!p || !data || typeof data.x!=='number' || typeof data.y!=='number' || !Number.isFinite(data.x) || !Number.isFinite(data.y) || !this.allowMove(client.sessionId)) return;
      if(data.yaw!==undefined && (typeof data.yaw!=='number' || !Number.isFinite(data.yaw))) return;
      const limit=this.limits.get(client.sessionId)!; const now=performance.now();
      const x=Math.max(0,Math.min(1,data.x)), y=Math.max(0,Math.min(1,data.y));
      const dx=(x-p.x)*120, dz=(y-p.y)*120, distance=Math.hypot(dx,dz);
      const allowed=9*Math.max(0,(now-limit.moved)/1000);
      const ratio=distance>0?Math.min(1,allowed/distance):1;
      p.x+=(x-p.x)*ratio; p.y+=(y-p.y)*ratio; p.seat=-1; limit.moved=now;
      if(data.yaw!==undefined) p.yaw=((data.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    });
    this.onMessage('wave',(client,data)=>{
      const limit=this.limits.get(client.sessionId)!; const now=Date.now();
      if(now-limit.wave<2000) return;
      if(data?.targetId!==undefined && (typeof data.targetId!=='string' || !this.state.players.has(data.targetId))) return;
      limit.wave=now;this.broadcast('wave',{playerId:client.sessionId,...(data?.targetId?{targetId:data.targetId}:{})});
    });
    this.onMessage('sit',(client,data)=>{
      const p=this.state.players.get(client.sessionId), seat=data?.seat;
      if (!p || !Number.isInteger(seat) || seat < -1 || seat >= this.state.capacity) return;
      if (seat!==-1 && [...this.state.players.values()].some(other=>other!==p && other.seat===seat)) return;
      p.seat=seat;
    });
    this.onMessage('emote',(client,data)=>{
      if (!['❤️','🔥','😂','👏','🎉','😮','👋','🫡'].includes(data?.emoji)) return;
      const limit=this.limits.get(client.sessionId)!; const now=Date.now();
      limit.emotes=limit.emotes.filter(t=>now-t<5000); if(limit.emotes.length>=5) return;
      limit.emotes.push(now); this.broadcast('emote',{playerId:client.sessionId,emoji:data.emoji});
      this.reactions=this.reactions.filter(e=>now-e.time<10000);
      this.reactions.push({time:now,player:client.sessionId});
      if(new Set(this.reactions.map(e=>e.player)).size>=3) {
        const level=Math.min(3,Math.floor(this.reactions.length/8));
        if(level>=1 && now-(this.hypeCooldown.get(level)??0)>=20000) {
          this.hypeCooldown.set(level,now);this.broadcast('hype',{level});
          void services.hype(this.state.channel,this.clients.map(c=>c.auth).filter(u=>u && typeof u==='object')).catch(()=>{});
        }
      }
    });
    this.onMessage('chat',async(client,data)=>{
      if(typeof data?.text!=='string') return;
      const text=data.text.replace(/[\u0000-\u001f\u007f]/g,'').trim();
      if(!text || text.length>500) return;
      const limit=this.limits.get(client.sessionId)!; const now=Date.now(); if(now-limit.chat<2000) return; limit.chat=now;
      if(services.sendingConfigured && (!client.auth || typeof client.auth!=='object')) {
        client.send('system',{text:'Log in with Twitch to talk to the streamer'});return;
      }
      try {
        await services.chat(this.state.channel,client.auth,text);
        const p=this.state.players.get(client.sessionId); if(p) this.broadcast('room_chat',{playerId:p.id,name:p.name,text});
      } catch { client.send('system',{text:'Twitch could not send your message. Please log in again or try later.'}); }
    });
  }
  private allowMove(id:string) {
    const l=this.limits.get(id)!; const now=Date.now(); l.moves=l.moves.filter(t=>now-t<1000);
    if(l.moves.length>=30) return false; l.moves.push(now); return true;
  }
  async onAuth(_client:Client,_options:unknown,request:AuthContext) { if(request.headers.origin && request.headers.origin!=='http://localhost:5173')throw new Error('Origin denied'); return (await services.authenticate(request)) ?? true; }
  onJoin(client:Client,options:{name?:unknown}) {
    const p=new Player(); p.id=client.sessionId;
    const identity=typeof client.auth==='object' ? client.auth as Identity : undefined;
    p.name=identity?.displayName ?? ((typeof options.name==='string' ? options.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40) : '') || 'Viewer');
    p.color=['#a78bfa','#38bdf8','#fb7185','#34d399'][this.state.players.size%4];
    this.state.players.set(client.sessionId,p); this.state.viewerCount=this.state.players.size;
    this.limits.set(client.sessionId,{chat:0,emotes:[],moves:[],moved:performance.now(),wave:0});
    if(identity) this.subscriptions.set(client.sessionId,services.subscribe(this.state.channel,identity,payload=>{
      const event=payload as {type?:string;user?:string;text?:string;color?:string;category?:string;title?:string;detail?:string};
      if(event?.type==='chat'&&typeof event.user==='string'&&typeof event.text==='string')this.broadcast('twitch_chat',{user:event.user,text:event.text,...(event.color?{color:event.color}:{})});
    }));
    if(identity) client.send('twitch_update',{category:'account',title:'Twitch account connected',detail:`Signed in as ${identity.displayName}. Your phone now controls this theatre's audio.`});
  }
  onLeave(client:Client) {
    this.state.players.delete(client.sessionId); this.state.viewerCount=this.state.players.size;
    this.limits.delete(client.sessionId); this.subscriptions.get(client.sessionId)?.(); this.subscriptions.delete(client.sessionId);
  }
  onDispose() { for(const stop of this.subscriptions.values()) stop(); }
}
