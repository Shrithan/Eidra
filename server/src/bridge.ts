import WebSocket from 'ws';
import { broadcaster, configured, credentials, helix, userAccess } from './twitch.js';
import type { Identity } from './theater.js';
type Bridge={refs:Map<symbol,Identity>;stop:()=>void;relay:(payload:unknown)=>void};
const bridges=new Map<string,Bridge>();
type TwitchChatMessage={type:'chat';user:string;text:string;color?:string};
type TwitchPhoneUpdate={type:'update';category:'channel'|'stream';title:string;detail:string};

function phoneUpdate(category:TwitchPhoneUpdate['category'],title:string,detail:string):TwitchPhoneUpdate {
  return {type:'update',category,title,detail:detail.slice(0,400)};
}

export function mapEventSubNotification(type:string,event:any):TwitchChatMessage|TwitchPhoneUpdate|undefined {
  if(!event || typeof event.broadcaster_user_id!=='string')return;
  if(type==='channel.chat.message'){
    if(typeof event.chatter_user_name!=='string'||typeof event.message?.text!=='string')return;
    return {type:'chat',user:event.chatter_user_name.slice(0,100),text:event.message.text.slice(0,500),...(typeof event.color==='string'&&event.color?{color:event.color.slice(0,32)}:{})};
  }
  if(type==='channel.update'){
    const details=[typeof event.title==='string'&&event.title?`Title: ${event.title}`:'',typeof event.category_name==='string'&&event.category_name?`Category: ${event.category_name}`:'',typeof event.language==='string'&&event.language?`Language: ${event.language}`:''].filter(Boolean);
    return phoneUpdate('channel','Channel updated',details.join(' · ')||'The channel details changed.');
  }
  if(type==='stream.online')return phoneUpdate('stream','Stream started',event.type==='rerun'?'A rerun is live on Twitch.':'The channel is live on Twitch.');
  if(type==='stream.offline')return phoneUpdate('stream','Stream ended','The channel is now offline on Twitch.');
}

export function subscribeChat(channel:string,user:Identity,relay:(payload:unknown)=>void, createSocket:(url:string)=>WebSocket=url=>new WebSocket(url)) {
  if(!configured)return ()=>{};
  let bridge=bridges.get(channel);const key=Symbol();
  if(!bridge){bridge={refs:new Map(),stop:()=>{},relay};bridges.set(channel,bridge);}
  bridge.refs.set(key,user);
  if(bridge.refs.size===1)bridge.stop=connect(channel,bridge,createSocket);
  return ()=>{bridge!.refs.delete(key);if(!bridge!.refs.size){bridge!.stop();bridges.delete(channel);}};
}
function connect(channel:string,bridge:Bridge,createSocket:(url:string)=>WebSocket) {
  let stopped=false, socket:WebSocket|undefined, retry:NodeJS.Timeout|undefined;
  const seen=new Set<string>();
  const sockets=new Set<WebSocket>();
  const timers=new Map<WebSocket,NodeJS.Timeout>();
  const subscriptions:{id:string;user:string}[]=[];
  function schedule(){if(stopped)return;clearTimeout(retry);retry=setTimeout(()=>void open(),5000);retry.unref();}
  function arm(seconds:number,ws:WebSocket){clearTimeout(timers.get(ws));const timer=setTimeout(()=>ws.terminate(),(seconds+2)*1000);timer.unref();timers.set(ws,timer);}
  async function open(url='wss://eventsub.wss.twitch.tv/ws',migrating=false) {
    if(stopped)return;
    const user=[...bridge.refs.values()].find(u=>credentials.has(u.id));
    if(!user){schedule();return;}
    let access:string,id:string;
    try{access=await userAccess(user.id);id=await broadcaster(channel);}catch{schedule();return;}
    if(stopped)return;
    const previous=socket; const ws=createSocket(url); socket=ws;sockets.add(ws);arm(10,ws);
    let keepalive=10;
    ws.on('error',()=>{});
    ws.on('close',()=>{sockets.delete(ws);clearTimeout(timers.get(ws));timers.delete(ws);if(socket===ws)schedule();});
    ws.on('message',raw=>{void(async()=>{
      if(stopped)return;
      const message=JSON.parse(raw.toString());const type=message.metadata?.message_type;
      if(type==='session_welcome') {
        keepalive=message.payload.session.keepalive_timeout_seconds??10;arm(keepalive,ws);
        if(migrating){previous?.close();return;}
        const desired=[
          {type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:id,user_id:user.id}},
        ];
        for(const spec of desired){
          let result:any;
          try{result=await helix('eventsub/subscriptions',access,{...spec,transport:{method:'websocket',session_id:message.payload.session.id}});}
          catch(error){
            if(spec.type==='channel.chat.message')throw error;
            console.warn(`Twitch update subscription unavailable: ${spec.type}`);
            continue;
          }
          const subId=result.data?.[0]?.id;
          if(subId){
            if(stopped)void userAccess(user.id).then(token=>helix('eventsub/subscriptions?id='+encodeURIComponent(subId),token,undefined,'DELETE')).catch(()=>{});
            else subscriptions.push({id:subId,user:user.id});
          }
          if(stopped){ws.close();return;}
        }
      } else if(type==='session_reconnect') {
        const reconnect=message.payload.session.reconnect_url;
        // Only follow Twitch-owned secure reconnect endpoints.
        const parsed=new URL(reconnect);
        if(parsed.protocol==='wss:' && parsed.hostname.endsWith('.twitch.tv'))await open(reconnect,true);
      } else if(type==='revocation') {ws.close();}
      else if(type==='notification') {
        arm(keepalive,ws);
        const mid=message.metadata.message_id;if(seen.has(mid))return;seen.add(mid);if(seen.size>2000)seen.delete(seen.values().next().value!);
        const e=message.payload.event;
        if(e?.broadcaster_user_id!==id)return;
        const mapped=mapEventSubNotification(message.metadata.subscription_type,e);
        if(mapped)bridge.relay(mapped);
      } else if(type==='session_keepalive')arm(keepalive,ws);
    })().catch(()=>{console.warn('Twitch chat subscription failed; retrying');ws.close();});});
  }
  void open();
  return ()=>{
    stopped=true;clearTimeout(retry);
    for(const timer of timers.values())clearTimeout(timer);
    for(const ws of sockets)ws.close();sockets.clear();
    // Closing a WebSocket disables its subscriptions; also request explicit deletion.
    for(const sub of subscriptions)void userAccess(sub.user).then(access=>helix('eventsub/subscriptions?id='+encodeURIComponent(sub.id),access,undefined,'DELETE')).catch(()=>{});
  };
}
