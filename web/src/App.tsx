import { useCallback, useEffect, useRef, useState } from 'react'
import Globe from './Globe'
import GeoWorld from './GeoWorld'
import WatchSphere from './WatchSphere'
import Theatre from './Theatre'
import PlaybackPanel from './integration/PlaybackPanel'
import LocationPanel from './integration/LocationPanel'
import OmniSearch from './OmniSearch'
import WorldPicker from './integration/WorldPicker'
import { FALLBACK_WORLDS, placeLabel, worldOf, type World } from './integration/worlds'
import { fetchMe, fetchStreams, fetchPlanets, logout, type Me, type Stream } from './api'
import './integration/integration.css'
const PAGE_SIZE=2000
const WATCHWORLD:World={id:'watchworld',name:'Watchworld · every genre, walkable',color:'#9146ff',count:0}
export default function App() {
 const [streams,setStreams]=useState<Stream[]>([]),[mock,setMock]=useState(false)
 const [me,setMe]=useState<Me|null>(null),[selected,setSelected]=useState<Stream|null>(null),[inRoom,setInRoom]=useState(false)
 const [query]=useState(''),[search,setSearch]=useState(''),[world,setWorld]=useState('earth'),[worlds,setWorlds]=useState<World[]>(FALLBACK_WORLDS)
 const [page,setPage]=useState(0),[total,setTotal]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[authError,setAuthError]=useState('')
 const [guest]=useState(()=>`Guest${Math.floor(Math.random()*900+100)}`)
 const [listOpen,setListOpen]=useState(false)
 const [visibleRows,setVisibleRows]=useState(80)
 const [transition,setTransition]=useState<'idle'|'cover'|'reveal'>('idle')
 const transitionLock=useRef(false)
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query.trim());setSelected(null);if(query.trim())setListOpen(true);setPage(0);setVisibleRows(80)},250);return()=>clearTimeout(timer)},[query])
 const load=useCallback(async(signal?:AbortSignal)=>{
  const result=await fetchStreams({planet:search||world==='watchworld'?'all':world,q:search,limit:PAGE_SIZE,offset:page*PAGE_SIZE},signal)
  if(signal?.aborted)return
  setStreams(result.streams);setMock(result.mock);setTotal(result.total);setHasMore(result.hasMore)
  try{const planets=await fetchPlanets(signal);if(!signal?.aborted)setWorlds(planets)}catch{if(result.mock)setWorlds(FALLBACK_WORLDS.map(w=>({...w,count:result.streams.filter(s=>s.planet?.id===w.id).length})))}
 },[search,world,page])
 useEffect(()=>{const controller=new AbortController();setStreams([]);setTotal(0);setLoading(true);void load(controller.signal).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});const interval=setInterval(()=>void load(controller.signal).catch(()=>{}),60000);return()=>{controller.abort();clearInterval(interval)}},[load])
 useEffect(()=>{void fetchMe().then(setMe)},[])
 const changeWorld=(id:string)=>{setWorld(id);setPage(0);setVisibleRows(80);setSelected(null)}
 const select=(stream:Stream)=>{setSelected(stream);if(world!=='watchworld'&&worldOf(stream)!==world)setWorld(worldOf(stream))}
 const enterTheatre=(stream:Stream)=>{
  if(transitionLock.current)return
  transitionLock.current=true
  setTransition('cover')
  window.setTimeout(()=>{
   setSelected(stream)
   setInRoom(true)
   window.requestAnimationFrame(()=>setTransition('reveal'))
   window.setTimeout(()=>{setTransition('idle');transitionLock.current=false},280)
  },220)
 }
 const transitionOverlay=transition==='idle'?null:<div className={`ww-transition ${transition}`} aria-hidden="true"/>
 const activeWorld=world==='watchworld'?{...WATCHWORLD,count:total}:worlds.find(w=>w.id===world)??{id:'earth',name:'Earth',color:'#9146ff',count:0}
 if(inRoom&&selected)return <><PlaybackPanel key={selected.login} login={selected.login}><Theatre stream={selected} name={me?.displayName??guest} account={me} onLeave={()=>setInRoom(false)}/></PlaybackPanel>{transitionOverlay}</>
 return <div className="home ww-explorer">
  {world==='watchworld'?<WatchSphere name={me?.displayName} selected={selected} onSelect={select} onEnter={enterTheatre}/>:world==='earth'?<GeoWorld streams={streams} selected={selected} onSelect={select} onEnter={enterTheatre}/>:<Globe streams={streams} selected={selected} onSelect={select} world={activeWorld}/>}
  <header className="top"><h1>Watchworld</h1><OmniSearch onWorld={()=>changeWorld('watchworld')} onStream={s=>{setWorld('watchworld');setSelected(s)}}/>
   {me?<><span className="who">{me.displayName}</span><button className="ww-logout" onClick={()=>void logout().then(()=>setMe(null)).catch(e=>setAuthError(e.message))}>Log out</button></>:<a className="login" href="/auth/twitch">Log in with Twitch</a>}
  </header>
  <WorldPicker world={world} onChange={changeWorld} worlds={[WATCHWORLD]}/>
  {me&&<LocationPanel me={me} streams={streams} onChanged={()=>load()}/>}
  {authError&&<p className="ww-auth-error" role="alert">{authError}</p>}
  <button className="ww-list-toggle" onClick={()=>setListOpen(v=>!v)}>{listOpen?'Hide stream list':'Browse streams'}</button>
  <aside className={`list ww-stream-list ${listOpen?'ww-list-open':''}`}>
   <div className="list-head">{search?'All worlds':activeWorld.name} · {total.toLocaleString()}{mock&&<span className="pill offline">demo</span>}</div>
   <p className="ww-list-note" role="status">{loading?'Loading…':`Page ${page+1} · highest viewers first`}</p>
   {!loading&&!streams.length&&<p className="ww-list-note">No streams match this search.</p>}
   {streams.slice(0,visibleRows).map(s=><button key={s.login} className={`row ${selected?.login===s.login?'on':''}`} onClick={()=>select(s)}><b>{s.displayName}</b><span>{s.game} · {placeLabel(s,worlds)}</span><small>{s.viewers.toLocaleString()} watching{s.demo||s.location?.source==='seed'?' · demo':s.location?.source==='researched'?' · researched, approximate':''}</small></button>)}
   {visibleRows<streams.length&&<button className="ww-more" onClick={()=>setVisibleRows(n=>Math.min(streams.length,n+100))}>Show more streams on this page</button>}
   <div className="ww-pagination"><button disabled={page===0||loading} onClick={()=>{setPage(p=>p-1);setVisibleRows(80)}}>Previous</button><span>Page {page+1}</span><button disabled={!hasMore||loading} onClick={()=>{setPage(p=>p+1);setVisibleRows(80)}}>Next</button></div>
  </aside>
  <p className="ww-render-note">Up to 2,000 pins per page · zoom for more detail{search?' · search spans every world':''}</p>
  {selected&&<div className="card"><button className="x" onClick={()=>setSelected(null)} aria-label="Close">×</button><h2>{selected.displayName}</h2><p>{selected.title}</p><p className="meta">{selected.game} · {selected.viewers.toLocaleString()} watching · {placeLabel(selected,worlds)}</p>
   {selected.location?.source==='researched'&&<><p className="ww-researched">Researched, approximate · {selected.location.confidence} confidence · {selected.location.precision} level</p>{selected.location.sources?.length?<p className="ww-sources">{selected.location.sources.map((source,i)=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">Public source {i+1}</a>)}</p>:<small className="ww-researched">Model knowledge; no linked source. May be outdated.</small>}</>}
   <button className="go" onClick={()=>enterTheatre(selected)}>Enter theatre</button>
  </div>}
  {transitionOverlay}
 </div>
}
