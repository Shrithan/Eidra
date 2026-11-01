import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { db, getMeta, setMeta, transaction } from './db.js';
import { dataDir } from './storage.js';
const require=createRequire(import.meta.url);
const countries=require('world-countries') as {cca2:string;name:{common:string};latlng:number[];status:string}[];
export const COUNTRIES=new Map(countries.filter(c=>c.status==='officially-assigned').map(c=>[c.cca2,c]));
const cities=JSON.parse(readFileSync(new URL('./data/cities.json',import.meta.url),'utf8')) as {city:string;country:string;lat:number;lng:number}[];
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}]/gu,'');
const aliases:Record<string,string>={"Cote d'Ivoire":'CI','DR Congo':'CD'};
export function cityCentroid(city:string,country?:string){return cities.find(c=>normalize(c.city)===normalize(city) && (!country || (aliases[c.country]??countries.find(v=>v.name.common===c.country)?.cca2)===country));}
export function jitterCity(login:string,lat:number,lng:number){
 const h=createHash('sha256').update(login.toLowerCase()).digest();
 const angle=h.readUInt32BE(0)/0xffffffff*Math.PI*2;
 const km=2+h.readUInt32BE(4)/0xffffffff*6;
 return {lat:Math.round(Math.max(-90,Math.min(90,lat+Math.sin(angle)*km/111.32))*100)/100,lng:Math.round((((lng+Math.cos(angle)*km/(111.32*Math.max(.05,Math.cos(lat*Math.PI/180))))+540)%360-180)*100)/100};
}
function writeOptin(id:string,login:string,city:string,lat:number,lng:number){
 const base={lat:Math.round(lat*10)/10,lng:Math.round(lng*10)/10};const point=jitterCity(login,lat,lng);
 db.prepare('INSERT OR REPLACE INTO optins VALUES(?,?,?,?,?,?,?)').run(login,id,city,base.lat,base.lng,point.lat,point.lng);
 db.prepare('DELETE FROM research_jobs WHERE login=?').run(login);
}
if(!getMeta('optins_migrated')){
 let previous:Record<string,any>={};try{previous=JSON.parse(readFileSync(join(dataDir,'cities.json'),'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
 transaction(()=>{for(const [id,c]of Object.entries(previous)){const city=cityCentroid(c.city);if(city)writeOptin(id,c.login,city.city,city.lat,city.lng);else if(typeof c.city==='string' && /^[\p{L} .,'’-]{1,100}$/u.test(c.city) && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat)<=90 && Math.abs(c.lng)<=180)writeOptin(id,c.login,c.city,c.lat,c.lng);}setMeta('optins_migrated','1');});
}
export async function setCity(id:string,login:string,body:any){
 if(typeof body?.city!=='string'||typeof body.lat!=='number'||typeof body.lng!=='number'||!Number.isFinite(body.lat)||!Number.isFinite(body.lng)||Math.abs(body.lat)>90||Math.abs(body.lng)>180)throw new Error('Invalid city');
 const city=cityCentroid(body.city);if(!city)throw new Error('Choose a supported city');
 writeOptin(id,login,city.city,city.lat,city.lng);
}
export async function deleteCity(id:string){db.prepare('DELETE FROM optins WHERE user_id=?').run(id);}
export function hasOptin(login:string){return Boolean(db.prepare('SELECT 1 FROM optins WHERE login=?').get(login));}
