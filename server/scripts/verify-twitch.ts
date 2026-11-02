// Controlled Twitch HTTP responses; no real credentials or outbound API calls.
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { Client } from 'colyseus.js';
process.env.WATCHWORLD_DATA_DIR=await mkdtemp(join(tmpdir(),'watchworld-test-'));
process.env.TWITCH_CLIENT_ID='test-client';process.env.TWITCH_CLIENT_SECRET='test-secret';process.env.SESSION_SECRET='test-session-secret';
const originalFetch=globalThis.fetch;
let liveViewers=5;
let sent:any, polls=0, subscriptions=0, sends=0, deleted=0;
const subscriptionRequests:any[]=[];
globalThis.fetch=async(input:any,init?:RequestInit)=>{
  const url=String(input);
  if(url.startsWith('http://localhost:2567'))return originalFetch(input,init);
  if(url==='https://id.twitch.tv/oauth2/validate')return Response.json({user_id:'test999',client_id:'test-client',scopes:['user:read:chat','user:write:chat']});
  if(url==='https://id.twitch.tv/oauth2/token')return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});
  if(url.includes('/helix/users'))return Response.json({data:[{id:'test999',login:'teststreamer',display_name:'TestStreamer',profile_image_url:'https://example.com/avatar.png'}]});
  if(url.includes('/helix/streams')){polls++;return Response.json({data:[{id:'stream999',user_id:'test999',user_login:'teststreamer',user_name:'TestStreamer',title:'Testing',game_name:'Test',viewer_count:liveViewers,language:'ja',thumbnail_url:'https://example.com/{width}x{height}'}]});}
  if(url.includes('/helix/eventsub/subscriptions') && init?.method==='DELETE'){deleted++;return new Response(null,{status:204});}
  if(url.includes('/helix/eventsub/subscriptions')){subscriptions++;subscriptionRequests.push(JSON.parse(init!.body as string));return Response.json({data:[{id:'sub'+subscriptions}]});}
  if(url.includes('/helix/chat/messages')){sends++;sent=JSON.parse(init!.body as string);return Response.json({data:[{is_sent:true}]});}
  throw new Error('Unexpected network request '+url);
};
await import('../src/index.js');
const {refreshStreams}=await import('../src/streams.js');await refreshStreams();
const {db}=await import('../src/db.js');
// Capture room relays here; the bridge itself is tested below with a mocked EventSub socket.
const {services}=await import('../src/theater.js');let roomRelay:(payload:unknown)=>void=()=>{};
services.subscribe=(_channel,_user,relay)=>{roomRelay=relay;return ()=>{};};
const base='http://localhost:2567';
const request=(path:string,init?:RequestInit)=>fetch(base+path,init);
let r=await request('/api/me');assert.equal(r.status,401);
r=await request('/api/streams');let streams=await r.json();assert.equal(streams.find((s:any)=>s.login==='teststreamer').location,null);assert.equal(streams.find((s:any)=>s.login==='teststreamer').planet.id,'odyssey');
r=await request('/auth/twitch',{redirect:'manual'});assert.equal(r.status,302);
let cookie=r.headers.get('set-cookie')!.split(';')[0];const oauth=new URL(r.headers.get('location')!);assert.equal(oauth.searchParams.get('scope'),'user:read:chat user:write:chat');
assert.equal((await request('/auth/twitch/callback?state=bad&code=test',{headers:{Cookie:cookie}})).status,400);
r=await request('/auth/twitch/callback?'+new URLSearchParams({state:oauth.searchParams.get('state')!,code:'test-code'}),{headers:{Cookie:cookie},redirect:'manual'});assert.equal(r.status,302);cookie=r.headers.get('set-cookie')!.split(';')[0];
const headers={Cookie:cookie,Origin:'http://localhost:5173','Content-Type':'application/json'};
assert.equal((await request('/api/me',{headers})).status,200);
assert.equal((await request('/api/me/location',{method:'POST',headers,body:JSON.stringify({city:'Madison',lat:43.073127,lng:-89.401234})})).status,204);
const stored=db.prepare('SELECT lat,lng FROM optins WHERE user_id=?').get('test999') as any;assert.equal(stored.lat,43.1);assert.equal(stored.lng,-89.4);
streams=await request('/api/streams').then(r=>r.json());assert.equal(streams.find((s:any)=>s.login==='teststreamer').location.source,'optin');assert.equal(streams.find((s:any)=>s.login==='teststreamer').location.city,'Madison');
assert.equal((await request('/api/me/location',{method:'POST',headers,body:JSON.stringify({city:'Bad',lat:999,lng:0})})).status,400);
assert.equal((await request('/api/me/location',{method:'DELETE',headers:{...headers,Origin:'https://evil.example'}})).status,403);
const client=new Client('ws://localhost:2567',{headers:{Cookie:cookie}});
const room=await client.joinOrCreate('theater',{channel:'teststreamer',name:'spoof'});room.onMessage('room_chat',()=>{});const phoneEvents:any[]=[];room.onMessage('twitch_update',event=>phoneEvents.push(event));await new Promise(r=>setTimeout(r,100));
assert.equal(room.state.players.get(room.sessionId).name,'TestStreamer');assert.equal(room.state.capacity,12);
roomRelay({type:'update',category:'channel',title:'Channel updated',detail:'Title: New title'});await new Promise(r=>setTimeout(r,30));assert.deepEqual(phoneEvents,[{category:'channel',title:'Channel updated',detail:'Title: New title'}]);
console.log('PASS authenticated theatre broadcasts Twitch updates to phone clients');
liveViewers=100000;await refreshStreams(true);
assert.equal(room.state.capacity,12);console.log('PASS room capacity stays fixed when audience history grows');room.send('chat',{text:'hello Twitch'});await new Promise(r=>setTimeout(r,100));assert.equal(sent.sender_id,'test999');assert.equal(sent.message,'hello Twitch');
assert.equal((await request('/api/me/location',{method:'DELETE',headers})).status,204);
streams=await request('/api/streams').then(r=>r.json());assert.equal(streams.find((s:any)=>s.login==='teststreamer').location,null);
const {subscribeChat}=await import('../src/bridge.js');
const sockets:EventEmitter[]=[];const relayed:any[]=[];
const stop=subscribeChat('teststreamer',{id:'test999',login:'teststreamer',displayName:'TestStreamer',avatar:''},payload=>relayed.push(payload),()=>{
  const ws=new EventEmitter() as EventEmitter & {close:()=>void;terminate:()=>void};
  ws.close=()=>{ws.emit('close');};ws.terminate=ws.close;sockets.push(ws);
  setTimeout(()=>ws.emit('message',Buffer.from(JSON.stringify({metadata:{message_type:'session_welcome'},payload:{session:{id:'session1',keepalive_timeout_seconds:10}}}))),0);
  return ws as unknown as WebSocket;
});
await new Promise(r=>setTimeout(r,100));assert.equal(subscriptions,5);
assert.deepEqual(subscriptionRequests.map(s=>s.type),['channel.chat.message','channel.chat.notification','channel.update','stream.online','stream.offline']);
const emitEvent=(subscription_type:string,message_id:string,event:any)=>sockets[0].emit('message',Buffer.from(JSON.stringify({metadata:{message_type:'notification',message_id,subscription_type},payload:{event:{broadcaster_user_id:'test999',...event}}})));
emitEvent('channel.chat.message','event-chat',{chatter_user_name:'Viewer',message:{text:'live chat'},color:'#ff0000'});
emitEvent('channel.chat.message','event-chat',{chatter_user_name:'Viewer',message:{text:'live chat'},color:'#ff0000'});
emitEvent('channel.chat.notification','event-sub',{notice_type:'sub',system_message:'Viewer subscribed at Tier 1!'});
emitEvent('channel.update','event-channel',{title:'New title',category_name:'Retro',language:'en'});
emitEvent('stream.online','event-online',{type:'live'});
emitEvent('stream.offline','event-offline',{});
emitEvent('channel.update','event-other',{broadcaster_user_id:'somebody-else',title:'Ignored'});
await new Promise(r=>setTimeout(r,30));assert.equal(relayed.length,5);
assert.deepEqual(relayed[0],{type:'chat',user:'Viewer',text:'live chat',color:'#ff0000'});
assert.deepEqual(relayed.slice(1).map((m:any)=>[m.category,m.title]),[['notification','New subscription'],['channel','Channel updated'],['stream','Stream started'],['stream','Stream ended']]);
assert.equal(relayed[1].detail,'Viewer subscribed at Tier 1!');
assert.match(relayed[2].detail,/Title: New title · Category: Retro · Language: en/);
// A Twitch reconnect transfers the existing subscription instead of creating another.
sockets[0].emit('message',Buffer.from(JSON.stringify({metadata:{message_type:'session_reconnect'},payload:{session:{reconnect_url:'wss://eventsub.wss.twitch.tv/reconnect'}}})));
await new Promise(r=>setTimeout(r,40));assert.equal(sockets.length,2);assert.equal(subscriptions,5);
stop();await new Promise(r=>setTimeout(r,80));assert.equal(deleted,5);
const {relayHype}=await import('../src/twitch.js');process.env.HYPE_TO_TWITCH='1';
const beforeSends=sends;const identity={id:'test999',login:'teststreamer',displayName:'TestStreamer',avatar:''};
await relayHype('teststreamer',[identity]);await relayHype('teststreamer',[identity]);assert.equal(sends-beforeSends,1);
console.log('PASS EventSub chat, channel and stream updates; reconnect transfer; subscription cleanup; hype relay throttle');
assert.equal((await request('/auth/logout',{method:'POST',headers})).status,204);assert.equal((await request('/api/me',{headers})).status,401);
await room.leave();assert.ok(polls>0);
console.log('PASS: simulated Helix, OAuth state/cookie, identity, city privacy/CRUD, CSRF, authenticated room identity, Twitch send, EventSub subscription/relay/deduplication, logout');
process.exit(0);
