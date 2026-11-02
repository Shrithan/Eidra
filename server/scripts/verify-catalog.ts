import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
process.env.WATCHWORLD_DATA_DIR=await mkdtemp(join(tmpdir(),'watchworld-catalog-'));
process.env.TWITCH_CLIENT_ID='fixture';process.env.TWITCH_CLIENT_SECRET='fixture';
let pages:string[]=[];let limited=false;
globalThis.fetch=async(input:any)=>{
 const url=new URL(String(input));if(url.hostname==='id.twitch.tv')return Response.json({access_token:'fixture',expires_in:3600});
 const cursor=url.searchParams.get('after')??'';pages.push(cursor);
 if(!limited){limited=true;return Response.json({}, {status:429,headers:{'Retry-After':'0.001'}});}
 const login=cursor?'last_page':'first_page';
 return Response.json({data:[{id:login+'1',user_login:login,user_name:login,title:'Hello',game_name:'Art',game_id:'1',viewer_count:cursor?12:100,language:'en',thumbnail_url:''}],pagination:cursor?{}:{cursor:'second'}});
};
try{
 const {crawlAllStreams}=await import('../src/catalog.js');const {queryStreams,getPlanets,parseStreamQuery}=await import('../src/streams.js');
 await crawlAllStreams();assert.deepEqual(pages,['','','second']);
 assert.equal(queryStreams({q:'last_page'}).streams[0].login,'last_page');
 // a real Twitch index never keeps invented demo channels
 assert.equal(queryStreams({planet:'harmonia',limit:1}).total,2);assert.equal(queryStreams({planet:'harmonia',limit:1,offset:1}).streams.length,1);
 assert.equal(getPlanets().find(p=>p.id==='harmonia')!.count,2);
 assert.throws(()=>parseStreamQuery({limit:'99999'}));assert.throws(()=>parseStreamQuery({bbox:'0,90,10,-90'}));
 const {getMeta}=await import('../src/db.js');
 const firstFetch=globalThis.fetch;let interrupt=true;
 globalThis.fetch=async(input:any,init:any)=>{if(String(input).includes('after=second')&&interrupt){interrupt=false;throw new Error('Simulated process interruption');}return firstFetch(input,init);};
 await assert.rejects(crawlAllStreams());assert.equal(getMeta('crawl_cursor'),'second');
 const before=pages.length;await crawlAllStreams();assert.equal(pages[before],'second');
 console.log('PASS persisted crawl cursor resumes without replacing the complete snapshot early');
 console.log('PASS cursor exhaustion, 429 retry, complete index, filters, pagination, planet counts and query validation');
}finally{await rm(process.env.WATCHWORLD_DATA_DIR!,{recursive:true,force:true});}
