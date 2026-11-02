import { useEffect, useRef, useState } from 'react'
import GlobeGL from 'globe.gl'
import type { Stream } from './api'
import { planetTexture, worldOf, type World } from './integration/worlds'
type Props={streams:Stream[];selected:Stream|null;onSelect:(stream:Stream)=>void;world:World}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const position=(stream:Stream)=>stream.location??stream.planet?.slot??{lat:0,lng:0}
const COLORS={optin:'#9146ff',seed:'#bf94ff',language:'#6b7280',researched:'#67d4bd'}
export default function Globe({streams,selected,onSelect,world}:Props){
 const el=useRef<HTMLDivElement>(null),globe=useRef<any>(null),onSelectRef=useRef(onSelect),worldRef=useRef(world)
 const [near,setNear]=useState(false)
 onSelectRef.current=onSelect;worldRef.current=world
 useEffect(()=>{
  const node=el.current!;const g=(GlobeGL as any)()(node)
   .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
   .backgroundColor('#080711').atmosphereColor('#9146ff')
   .pointLat((s:Stream)=>position(s).lat).pointLng((s:Stream)=>position(s).lng)
   .pointAltitude((s:Stream)=>.01+Math.min(.1,Math.log10(s.viewers+1)*.015))
   .pointRadius(.24).pointResolution(5).pointsTransitionDuration(0)
   .pointColor((s:Stream)=>s.location?COLORS[s.location.source]:worldRef.current.color)
   .pointLabel((s:Stream)=>`<div class="tip"><b>${escapeHtml(s.displayName)}</b><br/>${escapeHtml(s.game)}<br/>${s.viewers.toLocaleString()} watching · ${escapeHtml(s.location?.city??worldRef.current.name)}<br/>${s.demo||s.location?.source==='seed'?'Demo stream':s.location?.source==='researched'?`researched, approximate · ${s.location.confidence} confidence`:s.location?.source==='optin'?'Opted-in city, approximate':'Fictional genre planet; no real location'}</div>`)
   .onPointClick((s:Stream)=>onSelectRef.current(s))
   .onZoom((p:{altitude:number})=>setNear(p.altitude<1.7))
  g.controls().autoRotate=true;g.controls().autoRotateSpeed=.25;g.pointOfView({lat:25,lng:-30,altitude:2.4});globe.current=g
  const resize=()=>g.width(node.clientWidth).height(node.clientHeight);resize();const ro=new ResizeObserver(resize);ro.observe(node)
  return()=>{ro.disconnect();g._destructor?.();node.innerHTML='';globe.current=null}
 },[])
 useEffect(()=>{const g=globe.current;if(!g)return;g.globeImageUrl(world.id==='earth'?'//unpkg.com/three-globe/example/img/earth-night.jpg':planetTexture(world));g.atmosphereColor(world.color);g.pointOfView({lat:20,lng:0,altitude:2.4},600)},[world.id,world.color])
 useEffect(()=>{const g=globe.current;if(!g)return;const data=streams.filter(s=>worldOf(s)===world.id);const points=data.slice(0,near?2000:800);if(selected&&worldOf(selected)===world.id&&!points.some(s=>s.login===selected.login))points.push(selected);g.pointsData(points)},[streams,world.id,near,selected])
 useEffect(()=>{const g=globe.current;if(!g)return;g.controls().autoRotate=!selected;if(selected&&worldOf(selected)===world.id)g.pointOfView({...position(selected),altitude:1.3},800)},[selected,world.id])
 return <div className="globe" ref={el}/>
}
