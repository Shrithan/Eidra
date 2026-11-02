import { useCallback, useEffect, useRef, useState } from 'react'
import WatchSphere from './WatchSphere'
import Theatre from './Theatre'
import PlaybackPanel from './integration/PlaybackPanel'
import OmniSearch from './OmniSearch'
import type { TwitchUpdate } from './useRoom'
import { CharacterMenu, QuestBook, useRewards, type Target } from './Rewards'
import { FALLBACK_WORLDS, placeLabel, type World } from './integration/worlds'
import { toggleStream, onMyPlanet, getHome, subscribeHome, saveHome } from './homePlanet'
import { fetchMe, fetchFollows, fetchWatch, fetchStreams, fetchPlanets, logout, type Me, type Stream } from './api'
import { pickStreamers } from './questPicks'
import { onStreams, addStreams } from './streamStore'
import './integration/integration.css'
const PAGE_SIZE=2000
const WATCHWORLD:World={id:'watchworld',name:'Watchworld · every genre, walkable',color:'#9146ff',count:0}
export default function App() {
 const [streams,setStreams]=useState<Stream[]>([]),[mock,setMock]=useState(false)
 const [me,setMe]=useState<Me|null>(null),[selected,setSelected]=useState<Stream|null>(null),[inRoom,setInRoom]=useState(false)
 const [query]=useState(''),[search,setSearch]=useState(''),[world]=useState('watchworld'),[worlds,setWorlds]=useState<World[]>(FALLBACK_WORLDS)
 const [page,setPage]=useState(0),[total,setTotal]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[authError,setAuthError]=useState('')
 const [guest]=useState(()=>`Guest${Math.floor(Math.random()*900+100)}`)
 const rewards=useRewards(me?.login??guest,!!me)
 const rw=useRef(rewards);rw.current=rewards
 const [watched,setWatched]=useState<{totals:Record<string,number>;at:number}>({totals:{},at:Date.now()})
 const planetRef=useRef<number|null>(null),assigning=useRef(false)
 useEffect(()=>{const on=(e:Event)=>{planetRef.current=(e as CustomEvent<number|null>).detail??null};window.addEventListener('watchsphere:planet',on);return()=>window.removeEventListener('watchsphere:planet',on)},[])
 const discover=rewards.quests.find(q=>q.id==='discover')
 const assignPicks=useCallback(async()=>{if(assigning.current)return;assigning.current=true;try{const picks=pickStreamers(planetRef.current),totals=await fetchWatch();if(picks.length)rw.current.setTargets(picks.map(s=>({login:s.login,displayName:s.displayName,viewers:s.viewers,game:s.game})),Object.fromEntries(picks.map(s=>[s.login,totals[s.login]??0])))}finally{assigning.current=false}},[])
 useEffect(()=>{if(!me||!rewards.enabled||!discover||discover.targets)return;void assignPicks();return onStreams(()=>void assignPicks())},[me,rewards.enabled,discover?.targets,assignPicks])
 useEffect(()=>{if(!me||(!discover?.targets?.length&&!inRoom))return;const sync=()=>void fetchWatch().then(t=>{setWatched({totals:t,at:Date.now()});rw.current.syncWatch(t)});sync();const timer=setInterval(sync,inRoom?10000:20000);return()=>clearInterval(timer)},[me,discover?.targets,inRoom])
 const watchPick=async(t:Target)=>{const found=(await fetchStreams({q:t.login,limit:5})).streams.find(s=>s.login===t.login);if(found){setSelected(found);enterTheatre(found)}}
 const [phoneUpdates,setPhoneUpdates]=useState<TwitchUpdate[]>([])
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
 useEffect(()=>{if(!me)return;void fetchFollows().then(follows=>{if(!follows.length)return;const home=getHome();if(home?.visiting)return;saveHome(home?.name??`${me.displayName}'s planet`,[...(home?.logins??[]),...follows.map(f=>f.login)]);addStreams(follows.map(f=>({id:f.login,login:f.login,displayName:f.displayName||f.login,title:'Followed on Twitch',game:'Twitch follow',viewers:0,language:'',location:null})))})},[me?.id])
 useEffect(()=>{
  if(!me)return
  setPhoneUpdates((items)=>items.some((item)=>item.category==='account'&&item.detail.includes(`@${me.login}`))?items:[...items,{id:Date.now(),category:'account',title:'Twitch account connected',detail:`Signed in as @${me.login}. Your personal updates stay with you across Watchworld.`,receivedAt:Date.now()}])
 },[me?.login])
 const [,bumpHome]=useState(0)
 useEffect(()=>subscribeHome(()=>bumpHome(n=>n+1)),[])
 const select=(stream:Stream)=>setSelected(stream)
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
 const activeWorld={...WATCHWORLD,count:total}
 if(inRoom&&selected)return <><PlaybackPanel key={selected.login} login={selected.login}><Theatre stream={selected} name={me?.displayName??guest} account={me} appearance={rewards.appearance} quests={rewards.quests} loggedIn={rewards.enabled} watched={watched} onProgress={rewards.progress} onLeave={()=>setInRoom(false)} onPhoneUpdates={setPhoneUpdates}/></PlaybackPanel>{transitionOverlay}</>
 return <div className="home ww-explorer">
  <WatchSphere name={me?.displayName} selected={selected} appearance={rewards.appearance} onSelect={select} onEnter={enterTheatre}/>
  <header className="top"><h1>Watchworld</h1><OmniSearch onWorld={()=>setSelected(null)} onStream={s=>setSelected(s)}/>
   <div className="dock-corner"><CharacterMenu rewards={rewards}/><QuestBook rewards={rewards} onWatch={t=>void watchPick(t)} onReroll={()=>void assignPicks()}/></div>{me&&<span className="who">{me.displayName}</span>}{me?<button className="ww-logout" onClick={()=>void logout().then(()=>setMe(null)).catch(e=>setAuthError(e.message))}>Log out</button>:<a className="login" href="/auth/twitch">Log in with Twitch</a>}
  </header>
  {authError&&<p className="ww-auth-error" role="alert">{authError}</p>}
  {selected&&<div className="card"><button className="x" onClick={()=>setSelected(null)} aria-label="Close">×</button><h2>{selected.displayName}</h2><p>{selected.title}</p><p className="meta">{selected.game} · {selected.viewers.toLocaleString()} watching · {placeLabel(selected,worlds)}</p>
   {selected.location?.source==='researched'&&<><p className="ww-researched">Researched, approximate · {selected.location.confidence} confidence · {selected.location.precision} level</p>{selected.location.sources?.length?<p className="ww-sources">{selected.location.sources.map((source,i)=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">Public source {i+1}</a>)}</p>:<small className="ww-researched">Model knowledge; no linked source. May be outdated.</small>}</>}
   <button className="go" onClick={()=>enterTheatre(selected)}>Enter theatre</button>
   {!getHome()?.visiting&&<button className="go alt-add" onClick={()=>{toggleStream(selected.login);bumpHome(n=>n+1)}}>{onMyPlanet(selected.login)?'✓ On my planet · remove':'+ Add to my planet'}</button>}
  </div>}
  {transitionOverlay}
  <WorldPhone account={me} updates={phoneUpdates}/>
  {rewards.notice&&<div className="reward-toast">{rewards.notice}</div>}
 </div>
}

function WorldPhone({ account, updates }: { account: Me | null; updates: TwitchUpdate[] }) {
 const [open,setOpen]=useState(false)
 const [read,setRead]=useState(0)
 const [tab,setTab]=useState<'updates'|'friends'>('updates')
 const [friends,setFriends]=useState<{id:string;name:string}[]>([])
 const unread=updates.filter((item)=>item.id>read).length
 useEffect(()=>{if(open&&updates.length)setRead(updates[updates.length-1].id)},[open,updates])
 useEffect(()=>{try{setFriends(JSON.parse(localStorage.getItem('watchworld.friends')??'[]'))}catch{}},[open])
 return <div className="phone-dock world-phone">
  {open&&<section className="phone-panel" aria-label="In-game phone"><header className="phone-header"><div className="phone-app-icon" aria-hidden="true">W</div><div className="phone-heading"><b>{account?`${account.displayName}'s phone`:'Watchworld phone'}</b><small>{account?`Connected as @${account.login}`:'Sign in for personal Twitch updates'}</small></div><span className="phone-signal" title="Watchworld updates connected"/><button className="phone-close" onClick={()=>setOpen(false)} aria-label="Close phone">×</button></header><div className="phone-now-playing"><span className="phone-live-dot live"/><div><small>WATCHWORLD</small><b>Exploring the world</b><span>Your phone stays with you outside theatres</span></div></div><nav className="phone-tabs"><button className={tab==='updates'?'active':''} onClick={()=>setTab('updates')}>Updates</button><button className={tab==='friends'?'active':''} onClick={()=>setTab('friends')}>Friends</button></nav>{tab==='updates'?<><div className="phone-updates-heading">Personal updates{unread>0&&<span className="phone-tab-badge">{unread>9?'9+':unread}</span>}</div><div className="phone-updates" role="log" aria-label="Personal Twitch updates">{updates.length?updates.slice().reverse().map((item)=><article className={`phone-update ${item.category}`} key={item.id}><span className="phone-update-icon" aria-hidden="true">{item.category==='account'?'◉':'✦'}</span><div className="phone-update-copy"><div className="phone-update-heading"><b>{item.title}</b><time>{new Date(item.receivedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div><p>{item.detail}</p></div></article>):<div className="phone-empty"><span aria-hidden="true">✦</span><b>No personal updates yet</b><p>Sign in with Twitch to receive account updates here or in a theatre.</p></div>}</div></>:<div className="phone-updates"><div className="phone-updates-heading">Friends</div>{friends.length?friends.map(friend=><article className="phone-update" key={friend.id}><span className="phone-update-icon">●</span><div className="phone-update-copy"><b>{friend.name}</b><p>Find them in the People panel to message or invite them.</p></div></article>):<div className="phone-empty"><b>No friends saved yet</b><p>Open People in the world chat, then choose Add friend on a player.</p></div>}</div>}<footer className="phone-footer">Use People → Message, Invite, or Add friend while roaming.</footer></section>}
  <button className={`phone-launch ${open?'open':''}`} onClick={()=>setOpen((value)=>!value)} aria-expanded={open} aria-label={open?'Close in-game phone':unread?`Phone, ${unread} unread Twitch updates`:'Open in-game phone'}><span className="phone-launch-icon" aria-hidden="true">▯</span><span>Phone</span>{unread>0&&<span className="phone-launch-badge">{unread>9?'9+':unread}</span>}</button>
 </div>
}
