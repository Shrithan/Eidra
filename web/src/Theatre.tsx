import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Me, Stream } from './api'
import { EMOJIS, useRoom, type TwitchUpdate } from './useRoom'
import World, { capacityFor } from './World'
import type { Appearance, Quest } from './Rewards'
import { getHome, homeCode } from './homePlanet'

type Props = { stream: Stream; name: string; account: Me | null; appearance: Appearance; quests: Quest[]; loggedIn: boolean; watched: { totals: Record<string, number>; at: number }; onProgress: (id:string, amount?:number)=>void; onLeave: () => void; onPhoneUpdates?: (updates: TwitchUpdate[]) => void }

export default function Theatre({ stream, name, account, appearance, quests, loggedIn, watched, onProgress, onLeave, onPhoneUpdates }: Props) {
  // Size the hall from the stream's usual audience, falling back to its current viewer count.
  const usual = (stream as Stream & { avgViewers?: number }).avgViewers ?? stream.viewers
  const hint = capacityFor(usual)
  const { players, selfId, chat, updates, directMessages, planetInvite, setPlanetInvite, visitRequest, setVisitRequest, emotes, waves, bubbles, hype, mode, capacity: roomCapacity, sit, move, emote, wave, say, direct, invitePlanet, requestVisit } = useRoom(stream.login, name, hint, JSON.stringify(appearance))
  const capacity = roomCapacity ?? hint
  const [text, setText] = useState('')
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [readUpdateId, setReadUpdateId] = useState(0)
  const [playerState, setPlayerState] = useState({ volume: 0.7, muted: true, playing: false })
  const [phoneTab, setPhoneTab] = useState<'updates' | 'messages' | 'friends' | 'quests'>('updates')
  const [recipient, setRecipient] = useState('')
  const [directText, setDirectText] = useState('')
  const [interaction, setInteraction] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const count = Object.keys(players).length
  const [, setTick] = useState(0)
  useEffect(() => { if (!phoneOpen || phoneTab !== 'quests') return; const timer = window.setInterval(() => setTick((n) => n + 1), 1000); return () => window.clearInterval(timer) }, [phoneOpen, phoneTab])
  // the server's total for a streamer, plus the seconds since it was last fetched when that is the room we are in
  const live = (login: string) => (watched.totals[login] ?? 0) + (login === stream.login && mode === 'live' ? Math.max(0, Math.floor((Date.now() - watched.at) / 1000)) : 0)
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const unreadUpdates = updates.filter((item) => item.id > readUpdateId).length
  const nearby=useMemo(()=>{const me=players[selfId];if(!me)return null;return Object.values(players).filter(p=>p.id!==selfId).map(p=>({p,d:Math.hypot(p.x-me.x,p.y-me.y)*120})).sort((a,b)=>a.d-b.d)[0]?.d<=3.5?Object.values(players).filter(p=>p.id!==selfId).map(p=>({p,d:Math.hypot(p.x-me.x,p.y-me.y)*120})).sort((a,b)=>a.d-b.d)[0].p:null},[players,selfId])
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(['e','q'].includes(e.key.toLowerCase())&&nearby&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName)){e.preventDefault();setInteraction(true)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[nearby])

  // Only a live room counts. The rewards hook persists each increment by account id.
  useEffect(() => { if (mode !== 'live') return; const timer=window.setInterval(()=>onProgress('theatre-regular'),1000); return()=>window.clearInterval(timer) }, [mode,onProgress])
  const socialRef=useRef(new Set<string>())
  useEffect(()=>{Object.keys(players).filter(id=>id!==selfId).forEach(id=>{if(!socialRef.current.has(id)){socialRef.current.add(id);onProgress('social-butterfly')}})},[players,selfId,onProgress])

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [chat])

  useEffect(() => {
    if (phoneOpen && updates.length) setReadUpdateId(updates[updates.length - 1].id)
  }, [phoneOpen, updates])
  useEffect(() => { onPhoneUpdates?.(updates) }, [updates, onPhoneUpdates])

  useEffect(() => {
    const onPlayerState = (event: Event) => {
      const detail = (event as CustomEvent<{ login?: string; volume?: number; muted?: boolean; playing?: boolean }>).detail
      if (detail?.login !== stream.login) return
      setPlayerState((current) => ({ volume: typeof detail.volume === 'number' ? detail.volume : current.volume, muted: typeof detail.muted === 'boolean' ? detail.muted : current.muted, playing: typeof detail.playing === 'boolean' ? detail.playing : current.playing }))
    }
    window.addEventListener('watchworld:player-state', onPlayerState)
    window.dispatchEvent(new CustomEvent('watchworld:player-command', { detail: { login: stream.login, action: 'state' } }))
    return () => window.removeEventListener('watchworld:player-state', onPlayerState)
  }, [stream.login])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    say(t.slice(0, 200))
    setText('')
  }

  const playerCommand = (action: 'volume' | 'mute' | 'play', value?: number) => window.dispatchEvent(new CustomEvent('watchworld:player-command', { detail: { login: stream.login, action, value } }))
  const openStreamControls = () => window.dispatchEvent(new CustomEvent('watchworld:open-stream-controls', { detail: { login: stream.login } }))
  const contacts = Object.values(players).filter((player) => player.id !== selfId)
  const sendDirectMessage = (event: FormEvent) => { event.preventDefault(); direct(recipient, directText); setDirectText('') }

  return (
    <div className="theatre">
      <header className="bar">
        <button className="ghost" onClick={onLeave}>← Back to globe</button>
        <div className="bar-title">
          <b>{stream.displayName}</b> · {stream.game} · {stream.location?.city}
        </div>
        <span className={`pill ${mode}`}>
          {mode === 'live' ? `${count} in room` : mode === 'connecting' ? 'connecting…' : 'offline demo'}
        </span>
      </header>

      <div className="stage">
        <section className="main">
          <div className="world">
            <World
              login={stream.login}
              displayName={stream.displayName}
              game={stream.game}
              players={players}
              selfId={selfId}
              emotes={emotes}
              bubbles={bubbles}
              waves={waves}
              sit={sit}
              move={move}
              wave={wave}
              capacity={capacity}
              appearance={appearance}
            />
            {hype && <div key={hype.id} className="hype">{'🔥'.repeat(hype.level)} The room is hyped!</div>}
            <div className="hint">
              <b>Click</b> the scene, then move the mouse to look (<b>Esc</b> to release) · <b>WASD</b> move · <b>Space</b> jump · <b>Shift</b> run · <b>F</b> wave · <b>click a seat</b> to sit
            </div>
            {nearby&&<button className="proximity-pill" onClick={()=>setInteraction(true)}>Press <b>Q</b> to interact with {nearby.name}</button>}
            {interaction&&nearby&&<section className="proximity-menu"><b>{nearby.name}</b><button onClick={()=>{setPhoneOpen(true);setPhoneTab('messages');setRecipient(nearby.id);setInteraction(false)}}>Direct Message</button><button onClick={()=>{const home=getHome();if(home)invitePlanet(nearby.id,homeCode(home));setInteraction(false)}} disabled={!getHome()||getHome()?.visiting}>Invite to My Planet</button><button onClick={()=>{requestVisit(nearby.id);setInteraction(false)}}>Request to Visit Planet</button><button onClick={()=>{try{const key='watchworld.friends';const prior=JSON.parse(localStorage.getItem(key)??'[]');localStorage.setItem(key,JSON.stringify([...new Map([...prior,{id:nearby.id,name:nearby.name}].map((x:any)=>[x.id,x])).values()]));}catch{}setInteraction(false)}}>Add Friend</button><button onClick={()=>setInteraction(false)}>Close</button></section>}
            {planetInvite&&<section className="planet-toast"><b>{planetInvite.from} invited you to a planet</b><div><button onClick={()=>{location.assign(`${location.origin}${location.pathname}?home=${encodeURIComponent(planetInvite.code)}`)}}>Accept</button><button onClick={()=>setPlanetInvite(null)}>Decline</button></div></section>}
            {visitRequest&&<section className="planet-toast"><b>{visitRequest.from} wants to visit your planet</b><div><button onClick={()=>{const home=getHome();if(home)invitePlanet(visitRequest.fromId,homeCode(home));setVisitRequest(null)}} disabled={!getHome()||getHome()?.visiting}>Accept</button><button onClick={()=>setVisitRequest(null)}>Decline</button></div></section>}
            <div className="emotes">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => emote(e)}>{e}</button>
              ))}
            </div>

            <div className="phone-dock">
              {phoneOpen && (
                <section className="phone-panel" aria-label="In-game phone">
                  <header className="phone-header">
                    <div className="phone-app-icon" aria-hidden="true">W</div>
                    <div className="phone-heading">
                      <b>{account ? `${account.displayName}'s phone` : 'Orbyx phone'}</b>
                      <small>{account ? `Connected as @${account.login}` : 'Sign in for personal Twitch updates'}</small>
                    </div>
                    <span className="phone-signal" title={mode === 'live' ? 'Connected to the theatre' : 'Demo room'} />
                    <button className="phone-close" onClick={() => setPhoneOpen(false)} aria-label="Close phone">×</button>
                  </header>
                  <div className="phone-now-playing">
                    <span className={playerState.playing ? 'phone-live-dot live' : 'phone-live-dot'} />
                    <div><small>NOW WATCHING</small><b>{stream.displayName}</b><span>{playerState.playing ? 'Live in theatre' : 'Preparing stream'}</span></div>
                  </div>
                  <section className="phone-player-controls" aria-label="Stream controls">
                    <div className="phone-volume-row">
                      <button type="button" onClick={() => playerCommand('mute')} aria-label={playerState.muted ? 'Unmute stream' : 'Mute stream'}>{playerState.muted || playerState.volume === 0 ? '🔇' : playerState.volume < .5 ? '🔉' : '🔊'}</button>
                      <input type="range" min="0" max="100" value={Math.round(playerState.muted ? 0 : playerState.volume * 100)} onChange={(event) => playerCommand('volume', Number(event.target.value) / 100)} aria-label="Theatre volume" />
                      <output>{Math.round(playerState.muted ? 0 : playerState.volume * 100)}%</output>
                    </div>
                    <div className="phone-actions">
                      <button type="button" onClick={() => playerCommand('play')}>{playerState.playing ? '✓ Playing' : '▶ Play stream'}</button>
                      <button type="button" onClick={openStreamControls}>Stream controls</button>
                      <a href={`https://www.twitch.tv/${encodeURIComponent(stream.login)}`} target="_blank" rel="noopener noreferrer">Open Twitch ↗</a>
                    </div>
                  </section>
                  <nav className="phone-tabs"><button className={phoneTab === 'updates' ? 'active' : ''} onClick={() => setPhoneTab('updates')}>Updates{unreadUpdates > 0 && <span className="phone-tab-badge">{unreadUpdates > 9 ? '9+' : unreadUpdates}</span>}</button><button className={phoneTab === 'messages' ? 'active' : ''} onClick={() => setPhoneTab('messages')}>Messages</button><button className={phoneTab === 'friends' ? 'active' : ''} onClick={() => setPhoneTab('friends')}>Friends</button><button className={phoneTab === 'quests' ? 'active' : ''} onClick={() => setPhoneTab('quests')}>Quests</button></nav>
                  {phoneTab === 'updates' ? <><div className="phone-updates-heading">Personal updates</div><div className="phone-updates" role="log" aria-label="Personal Twitch updates" aria-live="polite">
                      {updates.length === 0 ? (
                        <div className="phone-empty">
                          <span aria-hidden="true">✦</span>
                          <b>No personal updates yet</b>
                          <p>Your account and stream updates will appear here. Theatre chat stays in the chat panel.</p>
                        </div>
                      ) : updates.slice().reverse().map((item) => (
                        <article className={`phone-update ${item.category}`} key={item.id}>
                          <span className="phone-update-icon" aria-hidden="true">{item.category === 'stream' ? '●' : item.category === 'channel' ? '↻' : item.category === 'account' ? '◉' : '✦'}</span>
                          <div className="phone-update-copy">
                            <div className="phone-update-heading"><b>{item.title}</b><time>{new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
                            <p>{item.detail}</p>
                          </div>
                        </article>
                      ))}
                  </div></> : phoneTab === 'quests' ? <section className="phone-messages phone-quests" aria-label="Quest tracker">
                    {!loggedIn ? <p className="phone-empty">Log in with Twitch to track quests and your watch time.</p> : <>
                      <div className="phone-watch"><small>Time on {stream.displayName}</small><b>{clock(live(stream.login))}</b><em>counted by the server while you are in this theatre</em></div>
                      {quests.map((q) => <article key={q.id} className="phone-quest"><span><b>{q.text}</b><small>{q.id === 'discover' ? 'Watch one of your picks for 15 minutes' : q.description}</small></span><em>{q.id === 'theatre-regular' || q.id === 'discover' ? `${clock(q.current)} / ${clock(q.max)}` : `${q.current} / ${q.max}`}</em><i className="quest-progress"><i style={{ width: `${Math.round((q.current / q.max) * 100)}%` }} /></i>
                        {q.id === 'discover' && q.targets?.map((tg) => { const done = Math.max(0, live(tg.login) - (q.baseline?.[tg.login] ?? 0)); return <p key={tg.login} className={`phone-pick ${tg.login === stream.login ? 'here' : ''}`}><span>{tg.displayName}{tg.login === stream.login ? ' · you are here' : ''}</span><em>{clock(Math.min(q.max, done))} / {clock(q.max)}</em></p> })}
                      </article>)}
                    </>}
                  </section> : phoneTab === 'friends' ? <section className="phone-messages"><b>Friends in this theatre</b>{contacts.length?contacts.map(contact=><button key={contact.id} onClick={()=>{setRecipient(contact.id);setPhoneTab('messages')}}>Message {contact.name}</button>):<p className="phone-empty">Your followed channels and new acquaintances appear here when they are in a room with you.</p>}</section> : <section className="phone-messages" aria-label="Private messages"><label>To<select value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="">Choose someone in this room</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>{contacts.length === 0 && <p className="phone-empty">No one else is in this room yet. Invite a friend to message them privately.</p>}<div className="direct-log">{directMessages.length === 0 ? <small>Your private conversation stays in your phone.</small> : directMessages.map((message) => <p key={message.id}><b>{message.fromId === selfId ? `To ${message.to}` : `From ${message.from}`}</b> {message.text}</p>)}</div><form onSubmit={sendDirectMessage}><input value={directText} onChange={(event) => setDirectText(event.target.value)} disabled={!recipient} maxLength={280} placeholder={recipient ? `Message ${contacts.find((contact) => contact.id === recipient)?.name ?? ''}` : 'Choose a recipient'} /><button disabled={!recipient}>Send</button></form></section>}
                  <footer className="phone-footer">Phone controls affect only your theatre audio.</footer>
                </section>
              )}
              <button className={`phone-launch ${phoneOpen ? 'open' : ''}`} onClick={() => setPhoneOpen((open) => !open)} aria-expanded={phoneOpen} aria-label={phoneOpen ? 'Close in-game phone' : unreadUpdates ? `Phone, ${unreadUpdates} unread Twitch updates` : 'Open in-game phone'}>
                <span className="phone-launch-icon" aria-hidden="true">▯</span>
                <span>Phone</span>
                {unreadUpdates > 0 && <span className="phone-launch-badge">{unreadUpdates > 9 ? '9+' : unreadUpdates}</span>}
              </button>
            </div>
          </div>
        </section>

        <aside className="chat">
          <div className="chat-title">Room + stream chat</div>
          <div className="chat-log" ref={log}>
            {chat.map((l) => (
              <div key={l.id} className={`line ${l.kind}`}>
                {l.kind === 'system' ? l.text : (
                  <>
                    <b style={{ color: l.color }}>{l.name}</b>
                    {l.kind === 'room' && <small> room</small>}: {l.text}
                  </>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={submit}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Say something to ${stream.displayName}`} maxLength={200} />
            <button type="submit">Send</button>
          </form>
        </aside>
      </div>
    </div>
  )
}
