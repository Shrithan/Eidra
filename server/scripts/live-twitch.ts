// Explicit live smoke test: posts one message to the signed-in user's own channel
// unless LIVE_TWITCH_CHANNEL is set. Never prints cookies or tokens.
import '../src/env.js';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'colyseus.js';
import { dataDir } from '../src/storage.js';
const saved=JSON.parse(await readFile(join(dataDir,'sessions.json'),'utf8'));
const entry=saved.sessions.filter(([,s]:any)=>s.user && s.expires>Date.now()).sort((a:any,b:any)=>b[1].expires-a[1].expires)[0];
if(!entry || !process.env.SESSION_SECRET)throw new Error('Sign in through the browser first');
const [id]=entry;const cookie=`watchworld=${id}.${createHmac('sha256',process.env.SESSION_SECRET).update(id).digest('hex')}`;
const base=process.env.SERVER_URL || 'http://localhost:2567';
const meResponse=await fetch(base+'/api/me',{headers:{Cookie:cookie}});
if(!meResponse.ok)throw new Error('/api/me rejected persisted browser session');
const me=await meResponse.json();console.log('PASS authenticated /api/me');
const channel=process.env.LIVE_TWITCH_CHANNEL || me.login;
const room=await new Client(base.replace('http','ws'),{headers:{Cookie:cookie}}).joinOrCreate('theater',{channel,name:me.displayName});
const text='Watchworld integration test: chat bridge online.';
let roomSeen=false, twitchSeen=false, rejection='';
for(const type of ['emote','wave','hype'])room.onMessage(type,()=>{});
room.onMessage('room_chat',message=>{if(message.text===text)roomSeen=true;});
room.onMessage('twitch_chat',message=>{if(message.text===text && message.user.toLowerCase()===me.displayName.toLowerCase())twitchSeen=true;});
room.onMessage('system',message=>{rejection=message.text;});
try{
 await new Promise(r=>setTimeout(r,5000));
 room.send('chat',{text});
 for(let i=0;i<40 && (!roomSeen || !twitchSeen) && !rejection;i++)await new Promise(r=>setTimeout(r,500));
 console.log((roomSeen?'PASS':'FAIL')+' real Twitch send as signed-in viewer');
 console.log((twitchSeen?'PASS':'FAIL')+' real EventSub channel chat arrives as twitch_chat');
 if(rejection)console.log('FAIL '+rejection);
 process.exitCode=roomSeen && twitchSeen?0:1;
}finally{await room.leave();}
