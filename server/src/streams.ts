import { db } from './db.js';
import { getAvgViewers, capacityForAudience } from './audience.js';
import { configured } from './twitch.js';
import { crawlAllStreams, crawlStatus, seedCatalog, type CatalogStream } from './catalog.js';
import { PLANETS, PLANET_IDS, type PlanetId } from './planets.js';
import type { Stream } from './seeds.js';
export { setCity, deleteCity } from './geo.js';
import './geo.js';
const exists=Number((db.prepare('SELECT COUNT(*) AS n FROM streams').get() as any).n);
if(!configured || !exists)seedCatalog();
const world="CASE WHEN o.login IS NOT NULL OR r.usable=1 OR (s.demo=1 AND json_extract(s.payload,'$.location') IS NOT NULL) THEN 'earth' ELSE COALESCE(r.genre,s.genre) END";
const lat="CASE WHEN o.login IS NOT NULL THEN o.display_lat WHEN r.usable=1 THEN r.lat WHEN s.demo=1 AND json_extract(s.payload,'$.location') IS NOT NULL THEN json_extract(s.payload,'$.location.lat') ELSE s.slot_lat END";
const lng="CASE WHEN o.login IS NOT NULL THEN o.display_lng WHEN r.usable=1 THEN r.lng WHEN s.demo=1 AND json_extract(s.payload,'$.location') IS NOT NULL THEN json_extract(s.payload,'$.location.lng') ELSE s.slot_lng END";
const join='FROM streams s LEFT JOIN optins o ON o.login=s.login LEFT JOIN research r ON r.login=s.login';
export type StreamQuery={limit?:number;offset?:number;planet?:string;language?:string;game?:string;q?:string;bbox?:number[]};
export function parseStreamQuery(raw:Record<string,unknown>):StreamQuery {
 const query:StreamQuery={};
 for(const key of ['limit','offset'] as const){if(raw[key]!==undefined){if(typeof raw[key]!=='string'||!/^\d+$/.test(raw[key] as string))throw new Error(`Invalid ${key}`);query[key]=Number(raw[key]);if(!Number.isSafeInteger(query[key])||(key==='limit'&&(query[key]!<1||query[key]!>5000)))throw new Error(`Invalid ${key}`);}}
 for(const key of ['planet','language','game','q'] as const){if(raw[key]!==undefined){if(typeof raw[key]!=='string'||(raw[key] as string).length>200)throw new Error(`Invalid ${key}`);query[key]=raw[key] as string;}}
 if(query.planet&&!['earth','all',...PLANET_IDS].includes(query.planet as any))throw new Error('Unknown planet');
 if(raw.bbox!==undefined){if(typeof raw.bbox!=='string')throw new Error('Invalid bbox');const box=raw.bbox.split(',').map(Number);if(box.length!==4||box.some(v=>!Number.isFinite(v))||Math.abs(box[0])>180||Math.abs(box[2])>180||Math.abs(box[1])>90||Math.abs(box[3])>90||box[1]>box[3])throw new Error('Invalid bbox');query.bbox=box;}
 return query;
}
function criteria(query:StreamQuery){
 const parts:string[]=[];const values:(string|number)[]=[];
 if(query.planet&&query.planet!=='all'){parts.push(`${world}=?`);values.push(query.planet);}
 if(query.language){parts.push('s.language=? COLLATE NOCASE');values.push(query.language);}
 if(query.game){parts.push("(s.game=? COLLATE NOCASE OR json_extract(s.payload,'$.gameId')=?)");values.push(query.game,query.game);}
 if(query.q){parts.push("(s.login LIKE ? ESCAPE '\\' OR json_extract(s.payload,'$.displayName') LIKE ? ESCAPE '\\' OR s.game LIKE ? ESCAPE '\\' OR o.city LIKE ? ESCAPE '\\' OR json_extract(r.result,'$.city') LIKE ? ESCAPE '\\' OR json_extract(s.payload,'$.location.city') LIKE ? ESCAPE '\\')");const term='%'+query.q.replace(/[\\%_]/g,'\\$&')+'%';values.push(...Array(6).fill(term));}
 if(query.bbox){const [west,south,east,north]=query.bbox;parts.push(`${lat} BETWEEN ? AND ?`);values.push(south,north);parts.push(west<=east?`${lng} BETWEEN ? AND ?`:`(${lng}>=? OR ${lng}<=?)`);values.push(west,east);}
 return {where:parts.length?' WHERE '+parts.join(' AND '):'',values};
}
export function queryStreams(query:StreamQuery={}) {
 const {where,values}=criteria(query);const count=Number((db.prepare(`SELECT COUNT(*) AS n ${join}${where}`).get(...values) as any).n);
 const rows=db.prepare(`SELECT s.payload,s.slot_lat,s.slot_lng,s.demo,${world} AS world,o.city AS optin_city,o.display_lat,o.display_lng,r.result AS research_result,r.usable ${join}${where} ORDER BY s.viewers DESC,s.login LIMIT ? OFFSET ?`).all(...values,query.limit??3000,query.offset??0) as any[];
 const streams=rows.map(row=>{
  const stream=JSON.parse(row.payload) as CatalogStream;
  delete stream.planet;stream.location=null;
  if(row.optin_city)stream.location={city:row.optin_city,lat:row.display_lat,lng:row.display_lng,source:'optin'};
  else if(row.usable===1){const research=JSON.parse(row.research_result);stream.location=research.location;}
  else if(row.demo){stream.location=JSON.parse(row.payload).location;stream.demo=true;}
  if(!stream.location)stream.planet={id:row.world as PlanetId,slot:{lat:row.slot_lat,lng:row.slot_lng}};
  return stream;
 });
 return {streams,total:count,hasMore:(query.offset??0)+streams.length<count};
}
export function getStreams(){return queryStreams({limit:5000}).streams;}
export function getPlanets(){const counts=db.prepare(`SELECT ${world} AS world,COUNT(*) AS count ${join} GROUP BY world`).all() as any[];return PLANETS.map(p=>({id:p.id,name:p.name,color:p.color,count:counts.find(c=>c.world===p.id)?.count??0}));}
export function indexStatus(){return crawlStatus();}
let busy:Promise<void>|undefined;
export function refreshStreams(force=false):Promise<void>{
 if(!configured)return Promise.resolve();if(busy)return force?busy.then(()=>refreshStreams()):busy;
 busy=crawlAllStreams().finally(()=>{busy=undefined;});return busy;
}
export function startPoller(){
 let stopped=false,timer:NodeJS.Timeout|undefined;
 async function poll(){const started=Date.now();try{await refreshStreams();}catch{console.warn(JSON.stringify({event:'stream_refresh_failed',retainingSnapshot:true,cursorSaved:crawlStatus().cursorSaved}));}finally{if(!stopped){timer=setTimeout(()=>void poll(),Math.max(15000,180000-(Date.now()-started)));timer.unref();}}}
 void poll();return ()=>{stopped=true;clearTimeout(timer);};
}
export function channelCapacity(channel:string){const row=db.prepare('SELECT payload FROM streams WHERE login=?').get(channel) as any;const stream:Stream|undefined=row?JSON.parse(row.payload):undefined;return capacityForAudience(stream?.avgViewers??getAvgViewers(channel)??stream?.viewers);}
