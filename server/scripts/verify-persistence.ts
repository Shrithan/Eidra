import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const data=await mkdtemp(join(tmpdir(),'watchworld-persistence-'));
let child:ChildProcess|undefined;
async function start(){
 child=spawn(process.execPath,['--import','tsx','scripts/fixtures/twitch-server.ts'],{cwd:new URL('../',import.meta.url),env:{...process.env,WATCHWORLD_DATA_DIR:data},stdio:['ignore','ignore','pipe','ipc']});
 const result=await Promise.race([new Promise(resolve=>child!.on('message',(message:any)=>{if(message?.ready===true)resolve(message);})),once(child,'exit').then(()=>{throw new Error('Fixture startup failed: port 2567 must be free');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Fixture startup timeout')),10000);timer.unref();})]);
 assert.ok(result);
}
async function stop(){if(child && child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}child=undefined;}
const base='http://localhost:2567';
try {
 await start();
 const login=await fetch(base+'/__test/login',{redirect:'manual'});const cookie=login.headers.get('set-cookie')!.split(';')[0];const headers={Cookie:cookie,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/me',{headers})).status,200);
 assert.equal((await fetch(base+'/api/me/location',{method:'POST',headers,body:JSON.stringify({city:'Madison',lat:43.0731,lng:-89.4012})})).status,204);
 await stop();
 const path=join(data,'sessions.json');const state=JSON.parse(await readFile(path,'utf8'));for(const [,c] of state.credentials)c.expires=0;
 await writeFile(path,JSON.stringify(state),{mode:0o600});
 await start();
 assert.equal((await fetch(base+'/api/me',{headers})).status,200);console.log('PASS REST session survives a full server restart');
 const status=await fetch(base+'/__test/status').then(r=>r.json());assert.equal(status.refreshes,1);console.log('PASS expired persisted token refreshes after restart');
 const streams=await fetch(base+'/api/streams').then(r=>r.json());assert.equal(streams.find((s:any)=>s.login==='watchworld_fixture').location.source,'optin');assert.ok(streams.some((s:any)=>s.location?.source==='seed'));console.log('PASS city opt-in survives restart; live streams merge with seeds');
 const database=new DatabaseSync(join(data,'world.sqlite'),{readOnly:true});const city=database.prepare('SELECT lat,lng FROM optins WHERE user_id=?').get('fixture999') as any;assert.equal(city.lat,43.1);assert.equal(city.lng,-89.4);database.close();console.log('PASS persisted location contains only coarse city coordinates');
 await fetch(base+'/auth/logout',{method:'POST',headers});await stop();await start();
 assert.equal((await fetch(base+'/api/me',{headers})).status,401);console.log('PASS logout remains effective after restart');
} finally {await stop();await rm(data,{recursive:true,force:true});}
