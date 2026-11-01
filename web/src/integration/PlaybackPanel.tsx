import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './integration.css'

/** Keeps the existing Twitch iframe intact; a real click can recover blocked autoplay. */
export default function PlaybackPanel({ login, children }: { login: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const slot = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!open || !slot.current) return
    const update = () => setBounds(slot.current!.getBoundingClientRect())
    update()
    const observer = new ResizeObserver(update)
    observer.observe(slot.current)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [open])
  const style = bounds ? {
    '--ww-player-left': `${bounds.left}px`, '--ww-player-top': `${bounds.top}px`,
    '--ww-player-width': `${bounds.width}px`, '--ww-player-height': `${bounds.height}px`,
  } as CSSProperties : undefined
  const show = () => {
    if (document.pointerLockElement) void document.exitPointerLock()
    setOpen(true)
  }
  return <div className={open ? 'ww-playback-host ww-playback-open' : 'ww-playback-host'} style={style}>
    {children}
    {open ? <>
      <div className="ww-playback-backdrop" />
      <section className="ww-playback-dialog" role="region" aria-labelledby="ww-playback-title">
        <header><h2 id="ww-playback-title">Start the stream</h2><button onClick={() => setOpen(false)}>Continue to theatre</button></header>
        <p>If Twitch is paused, click Play in the player below. Browsers can require this before video or sound will start.</p>
        <div ref={slot} className="ww-playback-space" />
        <footer><span>This is the same player used on the theatre screen.</span><a href={`https://www.twitch.tv/${encodeURIComponent(login)}`} target="_blank" rel="noopener noreferrer">Open on Twitch ↗</a></footer>
      </section>
    </> : <button className="ww-playback-reopen" onClick={show}>▶ Stream controls</button>}
  </div>
}
