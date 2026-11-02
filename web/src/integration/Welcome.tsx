import { Component, Suspense, lazy, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import './welcome.css'
const OrbitScene = lazy(() => import('./WelcomeOrbit'))
function Arrow(){return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function Mark(){return <svg viewBox="0 0 40 40" width="34" height="34" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="1.7"/><ellipse cx="20" cy="20" rx="19" ry="6" transform="rotate(-38 20 20)" stroke="currentColor" strokeWidth="1.7"/><circle cx="33" cy="9" r="3" fill="currentColor"/></svg>}
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}}render(){return this.state.failed?<div className="orbyx-scene-fallback"><Mark/></div>:this.props.children}}
const stops=[
 {id:'discover',title:<>Follow your<br/><em>curiosity.</em></>,text:'A solar system of live communities. Fly between genre planets and find a familiar face—or your next favorite streamer.',label:'Explore the planets',detail:'Chat. Create. Play. Find your orbit.'},
 {id:'together',title:<>Same stream.<br/><em>Same room.</em></>,text:'Walk into a streamer’s theatre, take a seat beside other viewers and watch the broadcast together. You’re more than a name in a scrolling chat.',label:'Enter a shared theatre',detail:'One broadcast. A room full of people.'},
 {id:'connect',title:<>Less scrolling.<br/><em>More connection.</em></>,text:'Wave, emote and meet the people around you. Connect Twitch when you’re ready to send a message to the streamer’s real chat.',label:'Make yourself at home',detail:'Your stream. Your community. Your space.'}
]
export default function Welcome({onEnter}:{onEnter:()=>void}){
 const page=useRef<HTMLDivElement>(null),progress=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const [step,setStep]=useState(0),[leaving,setLeaving]=useState(false)
 useEffect(()=>{
  const root=page.current!;let frame=0
  const update=()=>{frame=0;const p=root.scrollTop/Math.max(1,root.scrollHeight-root.clientHeight);progress.current=p;root.style.setProperty('--journey',String(p));root.classList.toggle('has-scrolled',root.scrollTop>40);let active=0;root.querySelectorAll<HTMLElement>('.orbyx-stop').forEach((el,i)=>{if(el.getBoundingClientRect().top<innerHeight*.58)active=i});setStep(active)}
  const scroll=()=>{if(!frame)frame=requestAnimationFrame(update)};root.addEventListener('scroll',scroll,{passive:true});update()
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-visible',entry.isIntersecting)),{root,threshold:.12});root.querySelectorAll('.orbyx-reveal').forEach(el=>observer.observe(el))
  return()=>{root.removeEventListener('scroll',scroll);cancelAnimationFrame(frame);observer.disconnect();if(timer.current)clearTimeout(timer.current)}
 },[])
 const enter=(event:MouseEvent<HTMLAnchorElement>)=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;event.preventDefault();if(leaving)return;setLeaving(true);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;timer.current=setTimeout(onEnter,reduced?0:950)}
 const entry=(text:string,extra='')=><a className={`orbyx-enter ${extra}`} href="/world" onClick={enter} aria-disabled={leaving||undefined}>{text}<Arrow/></a>
 return <div className={`orbyx-page ${leaving?'is-leaving':''}`} ref={page}>
  <a className="orbyx-skip" href="#orbyx-intro">Skip to introduction</a>
  <div className="orbyx-cosmos" role="img" aria-label="Animated low-poly planets and city buildings orbiting a central hub"><SceneBoundary><Suspense fallback={<div className="orbyx-scene-fallback"><Mark/></div>}><OrbitScene progress={progress}/></Suspense></SceneBoundary></div>
  <header className="orbyx-header"><a className="orbyx-brand" href="/" aria-label="Orbyx home"><Mark/><span>orbyx</span></a><nav aria-label="Introduction"><a className="orbyx-about-link" href="#discover">The experience</a>{entry('Enter Orbyx')}</nav></header>
  <main id="orbyx-intro">
   <section className="orbyx-hero"><div className="orbyx-hero-copy"><h1>Don’t just watch.<br/><em>Be there.</em></h1><p>Your favorite streams have a new home.<br/>A universe you can explore. People you can meet.<br className="orbyx-wide-break"/> A place to belong.</p>{entry('Find your orbit','orbyx-enter-large')}<a href="#discover" className="orbyx-scroll-cue"><span className="orbyx-scroll-line"/>Scroll to explore <span aria-hidden="true">↓</span></a></div><div className="orbyx-hero-note"><span/>Built around Twitch.<br/>Made for being together.</div><div className="orbyx-hero-word" aria-hidden="true">orbyx</div></section>
   <div className="orbyx-marquee" aria-hidden="true"><div>{[0,1].map(i=><span key={i}>Find your people <i/> Explore their worlds <i/> Share the moment <i/> </span>)}</div></div>
   <div className="orbyx-journey"><div className="orbyx-wayfinder" aria-hidden="true">{stops.map((s,i)=><span key={s.id} className={step===i?'active':''}><i/>{s.label}</span>)}</div>{stops.map((s,i)=><section className={`orbyx-stop orbyx-stop-${i}`} id={s.id} key={s.id}><div className="orbyx-stop-copy orbyx-reveal"><h2>{s.title}</h2><p>{s.text}</p><div className="orbyx-stop-detail"><span/>{s.detail}</div></div></section>)}</div>
   <section className="orbyx-why"><div className="orbyx-reveal"><h2>The best part of live<br/>was always <em>the people.</em></h2><div className="orbyx-why-copy"><p>The shared jokes. The familiar names. That one moment everyone reacts to at once.</p><p>We built Orbyx to give those connections a place. Streams become destinations, viewers become neighbors, and finding your next community becomes an adventure.</p></div></div><div className="orbyx-why-orbits" aria-hidden="true"><i/><i/><i/><span>O</span></div></section>
   <section className="orbyx-finale"><div className="orbyx-reveal"><Mark/><h2>There’s a world<br/>with <em>your people</em> in it.</h2>{entry('Let’s go to Orbyx','orbyx-enter-large')}<p>No login needed to explore.<br/>Connect Twitch when you’re ready to chat.</p></div></section>
  </main><footer className="orbyx-footer"><a href="/" className="orbyx-brand"><Mark/><span>orbyx</span></a><p>Live streams. Shared worlds.</p><small>An independent project, built around Twitch.</small></footer>
  {leaving&&<div className="orbyx-departure" role="status" aria-live="polite"><div className="orbyx-tunnel" aria-hidden="true">{Array.from({length:7},(_,i)=><i key={i} style={{'--ring':i} as React.CSSProperties}/>)}</div><div className="orbyx-departure-label"><Mark/><span>Finding your orbit…</span></div></div>}
 </div>
}
