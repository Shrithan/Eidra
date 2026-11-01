import WebSocket from 'ws';
import { broadcaster, configured, credentials, helix, userAccess } from './twitch.js';
import type { Identity } from './theater.js';
type Bridge={refs:Map<symbol,Identity>;stop:()=>void;relay:(payload:unknown)=>void};
const bridges=new Map<string,Bridge>();
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
  let subscription:{id:string;user:string}|undefined;
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
        const result=await helix('eventsub/subscriptions',access,{type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:id,user_id:user.id},transport:{method:'websocket',session_id:message.payload.session.id}});
        if(stopped){ws.close();return;}
        subscription={id:result.data?.[0]?.id,user:user.id};
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
        if(message.metadata.subscription_type==='channel.chat.message' && e.broadcaster_user_id===id)bridge.relay({user:e.chatter_user_name,text:e.message.text,...(e.color?{color:e.color}:{})});
      } else if(type==='session_keepalive')arm(keepalive,ws);
    })().catch(()=>{console.warn('Twitch chat subscription failed; retrying');ws.close();});});
  }
  void open();
  return ()=>{
    stopped=true;clearTimeout(retry);
    for(const timer of timers.values())clearTimeout(timer);
    for(const ws of sockets)ws.close();sockets.clear();
    // Closing a WebSocket disables its subscriptions; also request explicit deletion.
    if(subscription?.id){const sub=subscription;void userAccess(sub.user).then(access=>helix('eventsub/subscriptions?id='+encodeURIComponent(sub.id),access,undefined,'DELETE')).catch(()=>{});}
  };
}
