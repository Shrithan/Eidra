import assert from 'node:assert/strict';
import { Client, type Room } from 'colyseus.js';
const base=process.env.SERVER_URL || 'http://localhost:2567';
const pause=(ms=180)=>new Promise(r=>setTimeout(r,ms));
const rooms:Room[]=[];let failures=0;
async function check(name:string,fn:()=>Promise<void>){try{await fn();console.log('PASS '+name);}catch(e){failures++;console.log('FAIL '+name+': '+(e as Error).message);}}
try {
 const client=new Client(base.replace('http','ws'));
 const channel=process.env.E2E_CHANNEL || 'watchworld_e2e';
 const a=await client.joinOrCreate('theater',{channel,name:'Integration A'});rooms.push(a);
 const b=await client.joinOrCreate('theater',{channel,name:'Integration B'});rooms.push(b);
 const messages:Record<string,any[]>={wave:[],emote:[],hype:[],room_chat:[],system:[]};
 for(const room of [a,b])for(const type of ['wave','emote','hype','room_chat','system','twitch_chat'])room.onMessage(type,p=>{if(room===b || type==='system')messages[type]?.push(p);});
 await pause();
 await check('two clients share one room',async()=>{assert.equal(a.roomId,b.roomId);assert.equal(b.state.viewerCount,2);});
 await check('move/yaw sync and 9 m/s clamp',async()=>{
   const p=b.state.players.get(a.sessionId);const before={x:p.x,y:p.y};
   const resetAt=performance.now();a.send('move',{...before,yaw:0});await pause(250);
   const maximumDistance=9*((performance.now()-resetAt)/1000+0.08);
   a.send('move',{x:1,y:0,yaw:Math.PI*5});await pause();
   const after=b.state.players.get(a.sessionId);assert.ok(Math.hypot((after.x-before.x)*120,(after.y-before.y)*120)<=maximumDistance);assert.ok(after.x>before.x);assert.ok(Math.abs(Math.abs(after.yaw)-Math.PI)<0.001);
 });
 await check('audience-sized capacity, seat above 23, exclusivity and bounds',async()=>{
   const streams=await fetch(base+'/api/streams').then(r=>r.json());
   const stream=streams.find((s:any)=>(s.avgViewers??s.viewers)>=300);
   assert.ok(stream,'Need a stream with a large audience');
   const large=await client.joinOrCreate('theater',{channel:stream.login,name:'Seat test A'});rooms.push(large);
   const neighbor=await client.joinOrCreate('theater',{channel:stream.login,name:'Seat test B'});rooms.push(neighbor);
   for(const room of [large,neighbor])for(const type of ['wave','emote','hype','room_chat','system','twitch_chat'])room.onMessage(type,()=>{});
   await pause();const capacity=large.state.capacity;
   const audience=stream.avgViewers??stream.viewers;
   assert.equal(capacity,audience<30?12:audience<300?24:audience<3000?60:audience<15000?128:240);
   assert.ok(capacity>24);const seat=capacity-1;
   large.send('sit',{seat});await pause();assert.equal(neighbor.state.players.get(large.sessionId).seat,seat);
   neighbor.send('sit',{seat});await pause();assert.equal(neighbor.state.players.get(neighbor.sessionId).seat,-1);
   for(const invalid of [capacity,capacity+50,-2,1.5]){large.send('sit',{seat:invalid});await pause();assert.equal(large.state.players.get(large.sessionId).seat,seat);}
   large.send('sit',{seat:-1});await pause();assert.equal(large.state.players.get(large.sessionId).seat,-1);
   assert.equal(large.state.capacity,capacity,'Capacity must stay fixed');
 });
 await check('wave targets and rate limit',async()=>{a.send('wave',{targetId:b.sessionId});a.send('wave',{});await pause();assert.equal(messages.wave.length,1);assert.equal(messages.wave[0].targetId,b.sessionId);});
 await check('emote allow-list',async()=>{a.send('emote',{emoji:'invalid'});a.send('emote',{emoji:'🔥'});await pause();assert.equal(messages.emote.length,1);});
 await check('chat or login system response',async()=>{a.send('chat',{text:'Watchworld integration test'});await pause();assert.ok(messages.room_chat.length===1 || messages.system.some(m=>/Log in with Twitch/.test(m.text)));});
 await check('hype requires three players and obeys cooldown',async()=>{
   const c=await client.joinOrCreate('theater',{channel,name:'Integration C'});rooms.push(c);for(const type of Object.keys(messages))c.onMessage(type,()=>{});c.onMessage('twitch_chat',()=>{});
   for(let i=0;i<3;i++){a.send('emote',{emoji:'👏'});b.send('emote',{emoji:'👏'});c.send('emote',{emoji:'👏'});}await pause();
   assert.equal(messages.hype.filter(m=>m.level===1).length,1);
 });
} catch(e){failures++;console.log('FAIL connection: '+(e as Error).message);}
finally{await Promise.all(rooms.map(r=>r.leave()));}
process.exitCode=failures?1:0;
