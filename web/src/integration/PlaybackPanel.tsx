import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './integration.css'

/** Keeps the existing Twitch iframe intact; a real click can recover blocked autoplay. */
export default function PlaybackPanel({ login, children }: { login: string; children: ReactNode }) {
  // Twitch can autoplay a muted stream. Keep the theatre visible immediately; this panel is a recovery surface only.
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const slot = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  useEffect(() => {
    const onPlayback = (event: Event) => {
      const detail = (event as CustomEvent<{ login: string; playing: boolean }>).detail
      if (detail?.login !== login) return
      setPlaying(detail.playing)
      if (detail.playing) setOpen(false)
    }
    window.addEventListener('watchworld:stream-playback', onPlayback)
    return () => window.removeEventListener('watchworld:stream-playback', onPlayback)
  }, [login])
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ login?: string }>).detail
      if (detail?.login === login) {
        if (document.pointerLockElement) void document.exitPointerLock()
        setOpen(true)
      }
    }
    window.addEventListener('watchworld:open-stream-controls', onOpen)
    return () => window.removeEventListener('watchworld:open-stream-controls', onOpen)
  }, [login])
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
        <p>{playing ? 'The live stream is playing.' : 'If the video is paused, click Twitch’s Play control inside the video. This panel closes automatically once playback starts.'}</p>
        <div ref={slot} className="ww-playback-space" />
        <footer><span>This is the same player used on the theatre screen.</span><a href={`https://www.twitch.tv/${encodeURIComponent(login)}`} target="_blank" rel="noopener noreferrer">Open on Twitch ↗</a></footer>
      </section>
    </> : <button className="ww-playback-reopen" onClick={show}>▶ Stream controls</button>}
  </div>
}
