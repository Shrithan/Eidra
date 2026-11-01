import type { Stream } from '../api'
export type World = { id:string; name:string; color:string; count:number }
export const FALLBACK_WORLDS:World[]=[['chatterra','Chatterra','#ed9fbb'],['arcadia','Arcadia','#ffbd59'],['warzone','Warzone','#f16c5b'],['mythos','Mythos','#b59afa'],['strata','Strata','#8bb9f4'],['harmonia','Harmonia','#92e3ce'],['craftus','Craftus','#b2ce76'],['odyssey','Odyssey','#b9abc8']].map(([id,name,color])=>({id,name,color,count:0}))
export const worldOf=(stream:Stream)=>stream.location?'earth':stream.planet?.id??'odyssey'
export function placeLabel(stream:Stream,worlds:World[]=FALLBACK_WORLDS){return stream.location?.city??`${worlds.find(w=>w.id===stream.planet?.id)?.name??'Odyssey'} · genre planet`}
const textures=new Map<string,string>()
export function planetTexture(world:World){
 const previous=textures.get(world.id);if(previous)return previous
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=384
 const ctx=canvas.getContext('2d')!;let seed=[...world.id].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,17)
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 ctx.fillStyle=world.color;ctx.fillRect(0,0,768,384)
 for(let y=0;y<384;y+=3){ctx.fillStyle=`rgba(10,8,30,${.18+Math.sin(y*.035)*.09+random()*.12})`;ctx.fillRect(0,y,768,3)}
 for(let i=0;i<1300;i++){const x=random()*768,y=random()*384,r=random()*12+1;ctx.beginPath();ctx.ellipse(x,y,r,r*.5,0,0,Math.PI*2);ctx.fillStyle=`rgba(${random()>.5?'255,255,255':'0,0,20'},${random()*.12})`;ctx.fill()}
 const result=canvas.toDataURL();textures.set(world.id,result);return result
}
