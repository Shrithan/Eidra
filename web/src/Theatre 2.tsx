import { FormEvent, useEffect, useRef, useState } from 'react'
import type { Stream } from './api'
import { EMOJIS, useRoom } from './useRoom'
import World, { capacityFor } from './World'

type Props = { stream: Stream; name: string; onLeave: () => void }

export default function Theatre({ stream, name, onLeave }: Props) {
  // size the hall by how many people usually watch: the server's rolling average when it has one, else who is here now
  const usual = (stream as Stream & { avgViewers?: number }).avgViewers ?? stream.viewers
  const hint = capacityFor(usual)
  const { players, selfId, chat, emotes, waves, bubbles, hype, mode, capacity: roomCapacity, sit, move, emote, wave, say } = useRoom(stream.login, name, hint)
  const capacity = roomCapacity ?? hint
  const [text, setText] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const count = Object.keys(players).length

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [chat])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    say(t.slice(0, 200))
    setText('')
  }

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
