import { useEffect, useMemo, useRef, useState } from 'react'
import type { Stream } from './api'
import { GROUPS } from './sphereLayout'
import { searchAll, setGoto, type Hit } from './sphereSearch'
import { loadAllStreams, onStreams, streamsNow } from './streamStore'

/** The one search box: type a game, streamer, planet or a loose sentence and get where to go. */
export default function OmniSearch({ onWorld, onStream }: { onWorld: () => void; onStream: (s: Stream) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const [, bump] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => onStreams(() => bump((n) => n + 1)), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) { e.preventDefault(); box.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const loaded = streamsNow().length
  const hits = useMemo(() => searchAll(streamsNow(), q), [q, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (h: Hit) => {
    setOpen(false)
    if (h.kind === 'streamer') { onStream(h.stream); return }
    setGoto({ planet: h.planet, game: h.kind === 'game' ? h.game : undefined })
    onWorld()
  }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && hits[sel]) pick(hits[sel])
    else if (e.key === 'Escape') { setOpen(false); box.current?.blur() }
  }
  return (
    <div className="omni">
      <input
        ref={box}
        className="omni-input"
        placeholder="Search anything: a game, streamer, planet, or just describe it  ( / )"
        aria-label="Search everything"
        value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true) }}
        onFocus={() => { setOpen(true); void loadAllStreams().catch(() => {}) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={key}
      />
      {open && q.trim() && (
        <div className="omni-list" role="listbox">
          {!hits.length && <div className="omni-empty">{loaded ? 'Nothing matches yet. Try a game, a streamer name or a planet.' : 'Loading every stream…'}</div>}
          {hits.map((h, i) => (
            <button key={i} role="option" aria-selected={i === sel} className={`omni-row ${i === sel ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => pick(h)}>
              {h.kind === 'game' && <>
                <span className="omni-dot" style={{ background: h.color }} />
                <span className="omni-main"><b>{h.game}</b><small>Game · {h.country === h.game ? 'its own country' : 'in Other games'} on {GROUPS[h.planet].name} · {h.streams.toLocaleString()} streamers</small></span>
                <span className="omni-go">Show country →</span>
              </>}
              {h.kind === 'planet' && <>
                <span className="omni-dot" style={{ background: GROUPS[h.planet].color }} />
                <span className="omni-main"><b>{h.name}</b><small>Planet · {h.streams.toLocaleString()} streamers</small></span>
                <span className="omni-go">Fly there →</span>
              </>}
              {h.kind === 'streamer' && <>
                <span className="omni-dot" style={{ background: GROUPS[h.planet].color }} />
                <span className="omni-main"><b>{h.stream.displayName}</b><small>{h.game || 'Streaming'} · {h.stream.viewers.toLocaleString()} watching · {GROUPS[h.planet].name}</small></span>
                <span className="omni-go">Go to building →</span>
              </>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
