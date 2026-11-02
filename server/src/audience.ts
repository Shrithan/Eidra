import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './storage.js';
import { db, getMeta, setMeta, transaction } from './db.js';
if(!getMeta('averages_migrated')) {
  let saved:Record<string,number>={};try{saved=JSON.parse(readFileSync(join(dataDir,'audiences.json'),'utf8'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
  transaction(()=>{for(const [login,value] of Object.entries(saved))if(Number.isFinite(value)&&value>=0)db.prepare('INSERT OR IGNORE INTO averages VALUES(?,?)').run(login,value);setMeta('averages_migrated','1');});
}
export function getAvgViewers(channel:string):number|undefined{return (db.prepare('SELECT value FROM averages WHERE login=?').get(channel) as any)?.value;}
export function observeAudiences(samples:Iterable<{channel:string;viewers:number}>,insideTransaction=false) {
 const seen=new Set<string>();const update=()=>{for(const {channel,viewers}of samples){if(seen.has(channel)||!Number.isFinite(viewers)||viewers<0)continue;seen.add(channel);db.prepare('INSERT INTO averages VALUES(?,?) ON CONFLICT(login) DO UPDATE SET value=value*0.9+excluded.value*0.1').run(channel,viewers);}};if(insideTransaction)update();else transaction(update);
}
export function capacityForAudience(audience:number|undefined) {
  const n=typeof audience==='number' && Number.isFinite(audience)?Math.max(0,audience):0;
  return n<30?12:n<300?24:n<3000?60:n<15000?128:240;
}
