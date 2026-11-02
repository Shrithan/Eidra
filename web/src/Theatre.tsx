import { FormEvent, useEffect, useRef, useState } from 'react'
import type { Me, Stream } from './api'
import { EMOJIS, useRoom } from './useRoom'
import World, { capacityFor } from './World'

type Props = { stream: Stream; name: string; account: Me | null; onLeave: () => void }

export default function Theatre({ stream, name, account, onLeave }: Props) {
  // Size the hall from the stream's usual audience, falling back to its current viewer count.
  const usual = (stream as Stream & { avgViewers?: number }).avgViewers ?? stream.viewers
  const hint = capacityFor(usual)
  const { players, selfId, chat, updates, emotes, waves, bubbles, hype, mode, capacity: roomCapacity, sit, move, emote, wave, say } = useRoom(stream.login, name, hint)
  const capacity = roomCapacity ?? hint
  const [text, setText] = useState('')
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [readUpdateId, setReadUpdateId] = useState(0)
  const [playerState, setPlayerState] = useState({ volume: 0.7, muted: true, playing: false })
  const log = useRef<HTMLDivElement>(null)
  const count = Object.keys(players).length
  const unreadUpdates = updates.filter((item) => item.id > readUpdateId).length

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [chat])

  useEffect(() => {
    if (phoneOpen && updates.length) setReadUpdateId(updates[updates.length - 1].id)
  }, [phoneOpen, updates])

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
            />
            {hype && <div key={hype.id} className="hype">{'🔥'.repeat(hype.level)} The room is hyped!</div>}
            <div className="hint">
              <b>Click</b> the scene, then move the mouse to look (<b>Esc</b> to release) · <b>WASD</b> move · <b>Space</b> jump · <b>Shift</b> run · <b>F</b> wave · <b>click a seat</b> to sit
            </div>
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
                      <b>{account ? `${account.displayName}'s phone` : 'Watchworld phone'}</b>
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
                  <div className="phone-updates-heading">Personal updates{unreadUpdates > 0 && <span className="phone-tab-badge">{unreadUpdates > 9 ? '9+' : unreadUpdates}</span>}</div>
                  <div className="phone-updates" role="log" aria-label="Personal Twitch updates" aria-live="polite">
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
                  </div>
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
