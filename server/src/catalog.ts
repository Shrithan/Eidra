import { db, getMeta, setMeta, transaction } from './db.js';
import { helixApp } from './twitch.js';
import { planetForGame, planetSlot } from './planets.js';
import { MOCK_STREAMS, type Stream } from './seeds.js';
import { observeAudiences, getAvgViewers } from './audience.js';
export type CatalogStream=Stream & { gameId?:string };
export function storeStream(stream:CatalogStream,table:'streams'|'crawl',demo=false) {
 const slot=planetSlot(stream.login);
 db.prepare(`INSERT OR REPLACE INTO ${table} VALUES(?,?,?,?,?,?,?,?,?)`).run(stream.login,JSON.stringify(stream),stream.viewers,stream.language,stream.game,planetForGame(stream.game),slot.lat,slot.lng,demo?1:0);
}
export function seedCatalog(){transaction(()=>{for(const seed of MOCK_STREAMS)storeStream({...seed,location:seed.location?{...seed.location,source:'seed'}:null},'streams',true);});}
export function crawlStatus(){return {completeAt:Number(getMeta('crawl_complete')||0),inProgress:getMeta('crawl_active')==='1',cursorSaved:Boolean(getMeta('crawl_cursor')),count:Number((db.prepare('SELECT COUNT(*) AS n FROM streams').get() as any).n)};}
export async function crawlAllStreams() {
 if(getMeta('crawl_active')!=='1' || Date.now()-Number(getMeta('crawl_started')||0)>30*60*1000)transaction(()=>{db.exec('DELETE FROM crawl');setMeta('crawl_cursor','');setMeta('crawl_started',String(Date.now()));setMeta('crawl_active','1');});
 let cursor=getMeta('crawl_cursor')||'';
 for(;;){
  const result=await helixApp('streams?'+new URLSearchParams({first:'100',...(cursor?{after:cursor}:{})}));
  if(!Array.isArray(result.data))throw new Error('Invalid Twitch streams response');
  const next=result.pagination?.cursor||'';
  if(next && next===cursor)throw new Error('Twitch returned a repeated cursor');
  const observations:{channel:string;viewers:number}[]=[];
  for(const s of result.data){
   if(typeof s.user_login!=='string' || !/^[a-z0-9_]{1,25}$/.test(s.user_login) || !Number.isFinite(s.viewer_count))continue;
   // SQLite stages an entire sweep; a partial sweep never replaces the last complete index.
   const existing=db.prepare('SELECT 1 FROM crawl WHERE login=?').get(s.user_login);
   if(!existing)observations.push({channel:s.user_login,viewers:s.viewer_count});
  }
  transaction(()=>{
   observeAudiences(observations,true);
   for(const s of result.data){
    if(typeof s.user_login!=='string' || !/^[a-z0-9_]{1,25}$/.test(s.user_login) || !Number.isFinite(s.viewer_count))continue;
    storeStream({id:String(s.id),login:s.user_login,displayName:String(s.user_name).slice(0,100),title:String(s.title).slice(0,500),game:String(s.game_name).slice(0,200),gameId:String(s.game_id??''),viewers:Math.max(0,s.viewer_count),avgViewers:getAvgViewers(s.user_login),language:String(s.language).slice(0,16),thumbnail:String(s.thumbnail_url??'').replace('{width}','440').replace('{height}','248'),location:null},'crawl');
   }
   setMeta('crawl_cursor',next);
   // Publish only after the final page, then retain explicitly labelled demos for empty regions.
   if(!next){db.exec('DELETE FROM streams; INSERT INTO streams SELECT * FROM crawl;');for(const seed of MOCK_STREAMS)if(!db.prepare('SELECT 1 FROM streams WHERE login=?').get(seed.login))storeStream({...seed,location:seed.location?{...seed.location,source:'seed'}:null},'streams',true);db.exec('DELETE FROM crawl');setMeta('crawl_active','0');setMeta('crawl_complete',String(Date.now()));}
  });
  if(!next)break;cursor=next;
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 console.log(JSON.stringify({event:'stream_index_refreshed',count:crawlStatus().count}));
}

export async function refreshChannel(login:string) {
 const result=await helixApp('streams?'+new URLSearchParams({user_login:login}));
 for(const s of result.data??[]){observeAudiences([{channel:s.user_login,viewers:s.viewer_count}]);storeStream({id:String(s.id),login:s.user_login,displayName:String(s.user_name),title:String(s.title).slice(0,500),game:String(s.game_name),gameId:String(s.game_id??''),viewers:s.viewer_count,avgViewers:getAvgViewers(s.user_login),language:String(s.language),thumbnail:String(s.thumbnail_url??'').replace('{width}','440').replace('{height}','248'),location:null},'streams');}
}
