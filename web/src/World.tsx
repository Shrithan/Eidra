import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Bubble, FloatingEmote, Player, WaveEvent } from './useRoom'
import BlockyCharacter, { type CharacterMotion } from './BlockyCharacter'
import { CLASSIC, parseLook, type Appearance } from './Rewards'

// The server stores x, y in 0..1; those map onto a fixed 120 m x 120 m plot (see CONTRACT.md).
//   Z = 0 is the screen wall at the back of the auditorium, Z = wallZ is the front wall with the door,
//   everything beyond is the street outside, where viewers spawn.
// The auditorium itself grows with the room's capacity, which comes from the streamer's usual audience.
const PLOT = 120

export type Layout = {
  seats: number
  cols: number
  rows: number
  hallX: number // half width of the hall
  hallH: number // ceiling height
  wallZ: number // front wall (with the door)
  firstRowZ: number
  screenW: number
  screenH: number
  screenY: number // screen centre height
  spawn: THREE.Vector3
}

/** Seats for a stream, from how many people usually watch it. Keep in sync with CONTRACT.md. */
export function capacityFor(audience: number) {
  if (audience < 30) return 12
  if (audience < 300) return 24
  if (audience < 3000) return 60
  if (audience < 15000) return 128
  return 240
}

const COLS: Record<number, number> = { 12: 6, 24: 8, 60: 12, 128: 16, 240: 20 }

export function makeLayout(capacity: number): Layout {
  const cols = COLS[capacity] ?? Math.ceil(Math.sqrt(capacity * 2))
  const rows = Math.ceil(capacity / cols)
  const hallX = cols + 5
  const screenW = Math.max(18, Math.min(44, hallX * 2 - 4)) // nearly the whole back wall
  const screenH = (screenW * 9) / 16
  const screenY = screenH / 2 + 2.2
  const firstRowZ = Math.max(12, screenW * 0.6 + 4)
  const wallZ = firstRowZ + (rows - 1) * 3 + 8
  return {
    seats: capacity, cols, rows, hallX, wallZ, firstRowZ, screenW, screenH, screenY,
    hallH: screenY + screenH / 2 + 2.5,
    spawn: new THREE.Vector3(0, 0, wallZ + 12),
  }
}

// Set by <World> while it renders, read by everything below. One hall is on screen at a time.
let L: Layout = makeLayout(24)

let lastSeatClick = 0 // a click that sat you down must not also start mouse-look
const WALK_SPEED = 5.5
const GRAVITY = 24
const JUMP_SPEED = 7.6 // about 1.2 m high
const RUN_SPEED = 8.5 // the server clamps anything above 9 m/s, see CONTRACT.md

const toUnit = (X: number, Z: number): [number, number] => [X / PLOT + 0.5, Z / PLOT]
const toWorld = (x: number, y: number): [number, number] => [(x - 0.5) * PLOT, y * PLOT]
const seatPos = (i: number): [number, number, number] => [
  ((i % L.cols) - (L.cols - 1) / 2) * 2,
  0,
  L.firstRowZ + Math.floor(i / L.cols) * 3,
]

function blocked(x: number, z: number) {
  if (Math.abs(z - L.wallZ) < 0.6 && Math.abs(x) > 1.0) return true // front wall, only the door is open
  if (z < L.wallZ) return Math.abs(x) > L.hallX - 0.8 || z < 3
  return Math.abs(x) > PLOT / 2 - 4 || z > PLOT - 3
}

function labelTexture(lines: string[]) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#16101f'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = '#9146ff'
  g.lineWidth = 10
  g.strokeRect(10, 10, c.width - 20, c.height - 20)
  g.textAlign = 'center'
  g.fillStyle = '#bf94ff'
  g.font = '600 46px system-ui, sans-serif'
  g.fillText(lines[0], c.width / 2, 100)
  g.fillStyle = '#ffffff'
  g.font = '700 84px system-ui, sans-serif'
  g.fillText(lines[1], c.width / 2, 192)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

type Props = {
  login: string
  displayName: string
  game: string
  players: Record<string, Player>
  selfId: string
  emotes: FloatingEmote[]
  bubbles: Record<string, Bubble>
  waves: WaveEvent[]
  sit: (seat: number) => void
  move: (x: number, y: number, yaw?: number) => void
  wave: (targetId?: string) => void
  capacity: number
  appearance: Appearance
}

let twitchScript: Promise<void> | null = null
const TWITCH_SCRIPT_TIMEOUT_MS = 6000
/** Twitch's embed script lets us mute and unmute the player from code without reloading it. */
const loadTwitch = () =>
  (twitchScript ??= new Promise<void>((resolve, reject) => {
    if ((window as any).Twitch?.Player) return resolve()
    const el = document.createElement('script')
    el.src = 'https://player.twitch.tv/js/embed/v1.js'
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }
    const timeout = window.setTimeout(() => finish(new Error('Twitch embed script timed out')), TWITCH_SCRIPT_TIMEOUT_MS)
    el.onload = () => finish((window as any).Twitch?.Player ? undefined : new Error('Twitch embed player is unavailable'))
    el.onerror = () => finish(new Error('Twitch embed script failed to load'))
    document.head.appendChild(el)
  }))

export default function World(props: Props) {
  const layout = useMemo(() => makeLayout(props.capacity), [props.capacity])
  L = layout
  const [inside, setInside] = useState(false)
  const insideRef = useRef(false)
  insideRef.current = inside
  const playerBox = useRef<HTMLDivElement>(null)
  const player = useRef<any>(null)
  const [fallback, setFallback] = useState(false)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [offline, setOffline] = useState(false)
  const playbackActive = useRef(false)
  const audio = useRef({ volume: 0.7, muted: true })
  const [aimed, setAimed] = useState(-1)
  const [locked, setLocked] = useState(false)
  const [lockless, setLockless] = useState(false)
  const seatObjs = useRef<THREE.Object3D[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const startPlayback = () => {
    const p = player.current
    if (!p) return
    setOffline(false)
    try {
      // A muted play request is allowed by browser autoplay policies; audio can be enabled after video starts.
      p.setMuted(audio.current.muted)
      p.setVolume(audio.current.volume)
      p.play()
    } catch { /* keep Twitch's own Play control available if scripted autoplay is blocked */ }
  }
  const publishPlayerState = (playing = playbackActive.current) => {
    window.dispatchEvent(new CustomEvent('watchworld:player-state', { detail: { login: props.login, volume: audio.current.volume, muted: audio.current.muted, playing } }))
  }
  // Start muted for reliable autoplay; the player can unmute after playback begins inside the theatre.
  useEffect(() => {
    let dead = false
    setFallback(false)
    setReady(false)
    setPlaying(false)
    setOffline(false)
    playbackActive.current = false
    const publishPlayback = (isPlaying: boolean) => {
      if (dead) return
      playbackActive.current = isPlaying
      setPlaying(isPlaying)
      window.dispatchEvent(new CustomEvent('watchworld:stream-playback', { detail: { login: props.login, playing: isPlaying } }))
    }
    loadTwitch()
      .then(() => {
        const box = playerBox.current
        if (dead || !box) return
        box.innerHTML = ''
        const Twitch = (window as any).Twitch
        const p = new Twitch.Player(box, {
          channel: props.login,
          parent: [location.hostname],
          width: PLAYER_PX[0],
          height: PLAYER_PX[1],
          autoplay: true,
          muted: true,
          controls: true,
        })
        player.current = p
        p.addEventListener(Twitch.Player.READY, () => {
          setReady(true)
          startPlayback()
          // Safari can report READY before the video element accepts its first play request.
          window.setTimeout(startPlayback, 250)
        })
        p.addEventListener(Twitch.Player.PLAYING, () => {
          setOffline(false)
          publishPlayback(true)
          try { p.setMuted(audio.current.muted); p.setVolume(audio.current.volume) } catch { /* video can continue muted */ }
          publishPlayerState(true)
        })
        p.addEventListener(Twitch.Player.PAUSE, () => publishPlayback(false))
        p.addEventListener(Twitch.Player.PLAYBACK_BLOCKED, () => {
          // Retry muted: browsers allow muted autoplay, while sound may still need a user choice.
          if (!playbackActive.current) {
            audio.current.muted = true
            window.setTimeout(startPlayback, 100)
            publishPlayback(false)
          }
        })
        p.addEventListener(Twitch.Player.OFFLINE, () => { setOffline(true); publishPlayback(false) })
        p.addEventListener(Twitch.Player.ONLINE, () => { setOffline(false); startPlayback() })
      })
      .catch(() => { if (!dead) { setFallback(true); publishPlayback(false) } })
    return () => {
      dead = true
      player.current = null
      if (playerBox.current) playerBox.current.innerHTML = ''
    }
  }, [props.login])

  useEffect(() => {
    const command = (event: Event) => {
      const detail = (event as CustomEvent<{ login?: string; action?: string; value?: number }>).detail
      if (detail?.login !== props.login) return
      if (detail.action === 'state') return publishPlayerState()
      if (detail.action === 'play') { startPlayback(); return }
      if (detail.action === 'mute') audio.current.muted = !audio.current.muted
      if (detail.action === 'volume' && typeof detail.value === 'number') {
        audio.current.volume = Math.max(0, Math.min(1, detail.value))
        audio.current.muted = audio.current.volume === 0
      }
      try { player.current?.setMuted(audio.current.muted); player.current?.setVolume(audio.current.volume) } catch { /* player is still loading */ }
      publishPlayerState()
    }
    window.addEventListener('watchworld:player-command', command)
    return () => window.removeEventListener('watchworld:player-command', command)
  }, [props.login])

  useEffect(() => {
    if (!inside && !audio.current.muted) return
    audio.current.muted = !inside
    try { player.current?.setMuted(audio.current.muted) } catch { /* player not ready */ }
    publishPlayerState()
  }, [inside])

  return (
    <div className="worldroot" ref={rootRef}>
      {/* the stream player: a plain iframe behind the canvas, moved to match the 3D screen every frame */}
      <div className="screenlayer" ref={layerRef}>
        <div ref={outerRef} style={{ position: 'absolute', top: 0, left: 0, transformStyle: 'preserve-3d', pointerEvents: 'none' }}>
          <div ref={innerRef} style={{ position: 'absolute', pointerEvents: 'auto' }}>
            <div ref={playerBox} style={{ display: fallback ? 'none' : 'block', width: PLAYER_PX[0], height: PLAYER_PX[1], background: '#000' }} />
            <iframe
              className={`stream-fallback ${fallback ? 'active' : ''}`}
              title="Twitch stream fallback"
              width={PLAYER_PX[0]}
              height={PLAYER_PX[1]}
              src={fallback ? `https://player.twitch.tv/?channel=${encodeURIComponent(props.login)}&parent=${location.hostname}&muted=true&autoplay=true&controls=true` : 'about:blank'}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
            {!fallback && !ready && !offline && <div className="ww-stream-loading">Connecting to Twitch…</div>}
            {offline && <div className="ww-stream-offline">This channel is offline</div>}
          </div>
        </div>
      </div>
      <Canvas
        key={layout.seats}
        camera={{ fov: 65, near: 0.1, far: 300, position: [0, 3, layout.spawn.z + 4] }}
        dpr={[1, 2]}
        eventSource={rootRef as React.RefObject<HTMLElement>}
        eventPrefix="client"
        style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      >
        <fog attach="fog" args={['#0a0a12', 40, 160]} />
        <Environment displayName={props.displayName} game={props.game} />
        <ScreenRig layerRef={layerRef} outerRef={outerRef} innerRef={innerRef} />
        <Seats players={props.players} sit={props.sit} aimed={aimed} objs={seatObjs} />
        <Cast {...props} onInside={setInside} seatObjs={seatObjs} onAim={setAimed} onLock={setLocked} onLockless={setLockless} />
      </Canvas>
      {locked && <div className="crosshair" />}
      {locked && lockless && (
        <div className="notice">
          This browser blocked mouse capture, so the cursor can still leave the window. Open the page in Chrome for a fully locked mouse.
        </div>
      )}
    </div>
  )
}

function Environment({ displayName, game }: { displayName: string; game: string }) {
  const marquee = useMemo(() => labelTexture(['NOW SHOWING', displayName.slice(0, 18)]), [displayName])
  const wall = <meshStandardMaterial color="#1b1428" roughness={0.9} />
  const { hallX, hallH, wallZ, screenW, screenH, screenY, firstRowZ } = L
  const sideW = hallX - 1.4
  const lintelH = hallH - 3.5
  const lightRange = Math.max(26, wallZ)
  const speakerX = Math.min(hallX - 0.7, screenW / 2 + 1.5)
  const panelCount = Math.max(3, Math.floor((wallZ - 8) / 7))
  const panelSpacing = (wallZ - 12) / (panelCount - 1)
  const ceilingBeams = Math.max(3, Math.floor(wallZ / 8))
  return (
    <group>
      <ambientLight intensity={0.55} />
      <pointLight position={[-hallX * 0.5, hallH - 2, firstRowZ]} intensity={90} distance={lightRange} color="#b07cff" />
      <pointLight position={[hallX * 0.5, hallH - 2, wallZ * 0.65]} intensity={90} distance={lightRange} color="#ff7ad9" />
      <pointLight position={[0, screenY, 4]} intensity={160} distance={lightRange} color="#9146ff" />
      <pointLight position={[0, 5, wallZ + 6]} intensity={140} distance={22} color="#ffd9a0" />

      {/* ground outside + street */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, PLOT / 2]}>
        <planeGeometry args={[PLOT, PLOT]} />
        <meshStandardMaterial color="#14141c" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, wallZ + 10]}>
        <planeGeometry args={[3.2, 20]} />
        <meshStandardMaterial color="#2a2238" roughness={0.8} />
      </mesh>

      {/* hall floor + ceiling */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, wallZ / 2]}>
        <planeGeometry args={[hallX * 2, wallZ]} />
        <meshStandardMaterial color="#211a2c" roughness={0.98} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, hallH, wallZ / 2]}>
        <planeGeometry args={[hallX * 2, wallZ]} />
        <meshStandardMaterial color="#0c0a12" roughness={0.92} />
      </mesh>

      {/* plush carpet in the seating bowl and soft-lit aisle edges */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, (firstRowZ + wallZ) / 2]}>
        <planeGeometry args={[hallX * 1.72, wallZ - firstRowZ + 3]} />
        <meshStandardMaterial color="#17131e" roughness={1} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`aisle-${side}`}>
          <mesh position={[side * (hallX - 0.8), 0.045, wallZ / 2]}>
            <boxGeometry args={[0.08, 0.06, wallZ - 3]} />
            <meshStandardMaterial color="#7c46bb" emissive="#6c35a8" emissiveIntensity={0.5} />
          </mesh>
          {Array.from({ length: L.rows }, (_, row) => (
            <mesh key={row} position={[side * (hallX - 1.1), 0.09, firstRowZ + row * 3 + 1.15]}>
              <boxGeometry args={[0.32, 0.09, 0.12]} />
              <meshStandardMaterial color="#f4b76a" emissive="#e38b39" emissiveIntensity={1.1} />
            </mesh>
          ))}
        </group>
      ))}

      {/* back wall, side walls */}
      <mesh position={[0, hallH / 2, -0.2]}><boxGeometry args={[hallX * 2 + 0.8, hallH, 0.4]} />{wall}</mesh>
      <mesh position={[-hallX - 0.2, hallH / 2, wallZ / 2]}><boxGeometry args={[0.4, hallH, wallZ]} />{wall}</mesh>
      <mesh position={[hallX + 0.2, hallH / 2, wallZ / 2]}><boxGeometry args={[0.4, hallH, wallZ]} />{wall}</mesh>

      {/* repeating acoustic panels, brass insets, and low-glare wall sconces */}
      {Array.from({ length: panelCount }, (_, i) => {
        const z = 6 + i * panelSpacing
        return [-1, 1].map((side) => (
          <group key={`wall-panel-${side}-${i}`} position={[side * (hallX - 0.12), 0, z]}>
            <mesh position={[0, hallH * 0.53, 0]}>
              <boxGeometry args={[0.2, Math.min(7.2, hallH * 0.52), 3.4]} />
              <meshStandardMaterial color={i % 2 ? '#21182c' : '#261d33'} roughness={0.96} />
            </mesh>
            <mesh position={[side * -0.11, hallH * 0.53, -1.62]}>
              <boxGeometry args={[0.06, Math.min(7.5, hallH * 0.54), 0.08]} />
              <meshStandardMaterial color="#75518e" metalness={0.45} roughness={0.55} />
            </mesh>
            <mesh position={[side * -0.13, 3.2, 0]}>
              <boxGeometry args={[0.08, 1.15, 0.18]} />
              <meshStandardMaterial color="#d5a4ff" emissive="#9146ff" emissiveIntensity={1.6} />
            </mesh>
          </group>
        ))
      })}

      {/* dark ceiling coffers with violet cove lights */}
      {[-1, 1].map((side) => (
        <mesh key={`cove-${side}`} position={[side * hallX * 0.58, hallH - 0.12, wallZ / 2]}>
          <boxGeometry args={[0.09, 0.08, wallZ - 3]} />
          <meshStandardMaterial color="#c49aff" emissive="#9146ff" emissiveIntensity={1.3} />
        </mesh>
      ))}
      {Array.from({ length: ceilingBeams }, (_, i) => (
        <group key={`ceiling-beam-${i}`} position={[0, hallH - 0.32, 4 + i * ((wallZ - 8) / Math.max(1, ceilingBeams - 1))]}>
          <mesh><boxGeometry args={[hallX * 2 - 1, 0.38, 0.42]} /><meshStandardMaterial color="#17121e" metalness={0.18} roughness={0.85} /></mesh>
          <mesh position={[0, -0.2, 0]}><boxGeometry args={[hallX * 1.45, 0.035, 0.08]} /><meshStandardMaterial color="#b389ee" emissive="#643c9c" emissiveIntensity={0.6} /></mesh>
        </group>
      ))}

      {/* front wall with the door */}
      <mesh position={[-(1.4 + sideW / 2), hallH / 2, wallZ]}><boxGeometry args={[sideW, hallH, 0.4]} />{wall}</mesh>
      <mesh position={[1.4 + sideW / 2, hallH / 2, wallZ]}><boxGeometry args={[sideW, hallH, 0.4]} />{wall}</mesh>
      <mesh position={[0, 3.5 + lintelH / 2, wallZ]}><boxGeometry args={[2.8, lintelH, 0.4]} />{wall}</mesh>
      {/* glowing door frame */}
      <mesh position={[-1.45, 1.75, wallZ + 0.05]}><boxGeometry args={[0.12, 3.5, 0.5]} /><meshStandardMaterial color="#9146ff" emissive="#9146ff" emissiveIntensity={2} /></mesh>
      <mesh position={[1.45, 1.75, wallZ + 0.05]}><boxGeometry args={[0.12, 3.5, 0.5]} /><meshStandardMaterial color="#9146ff" emissive="#9146ff" emissiveIntensity={2} /></mesh>
      <mesh position={[0, 3.5, wallZ + 0.05]}><boxGeometry args={[3, 0.12, 0.5]} /><meshStandardMaterial color="#9146ff" emissive="#9146ff" emissiveIntensity={2} /></mesh>
      {/* marquee above the door */}
      <mesh position={[0, 5.6, wallZ + 0.25]}>
        <planeGeometry args={[7, 1.75]} />
        <meshBasicMaterial map={marquee} />
      </mesh>

      {/* low stage, framed screen portal, and speaker towers */}
      <mesh position={[0, 0.2, 2.2]}><boxGeometry args={[hallX * 2 - 1, 0.4, 3.4]} /><meshStandardMaterial color="#17111f" roughness={0.84} /></mesh>
      <mesh position={[0, 0.43, 0.66]}><boxGeometry args={[screenW + 1.3, 0.11, 0.2]} /><meshStandardMaterial color="#a576e8" emissive="#743bc3" emissiveIntensity={1.2} /></mesh>
      <mesh position={[0, screenY, 0.4]}><boxGeometry args={[screenW + 0.6, screenH + 0.5, 0.2]} /><meshStandardMaterial color="#05050a" /></mesh>
      {[-1, 1].map((side) => (
        <group key={`screen-wing-${side}`}>
          <mesh position={[side * (screenW / 2 + 0.38), screenY, 0.57]}>
            <boxGeometry args={[0.18, screenH + 0.72, 0.28]} />
            <meshStandardMaterial color="#9e64e6" emissive="#783fc2" emissiveIntensity={1.35} />
          </mesh>
          <mesh position={[side * speakerX, screenY, 1.15]}>
            <boxGeometry args={[1.2, Math.min(5.4, screenH * 0.56), 0.72]} />
            <meshStandardMaterial color="#111018" roughness={0.72} metalness={0.12} />
          </mesh>
          {[-1, 1, 2].map((n) => (
            <mesh key={n} position={[side * speakerX, screenY + n * 0.6, 0.77]}>
              <boxGeometry args={[0.64, 0.06, 0.035]} />
              <meshStandardMaterial color="#d8c6ee" emissive="#a66df2" emissiveIntensity={0.75} />
            </mesh>
          ))}
        </group>
      ))}
      <GenreSet game={game} hallX={hallX} hallH={hallH} wallZ={wallZ} firstRowZ={firstRowZ} />
    </group>
  )
}

type TheatreGenre = 'shooter' | 'rpg' | 'horror' | 'sports' | 'strategy' | 'creative' | 'chat'
function theatreGenre(game: string): TheatreGenre {
  const value = game.toLowerCase()
  if (/call of duty|valorant|counter|fortnite|apex|overwatch|pubg|battlefield|deadlock/.test(value)) return 'shooter'
  if (/elden|witcher|warcraft|monster hunter|final fantasy|souls|rpg|diablo|skyrim/.test(value)) return 'rpg'
  if (/horror|resident evil|silent hill|phasmophobia|dead by daylight/.test(value)) return 'horror'
  if (/sports|football|soccer|nba|fifa|racing|rocket league|wrestling/.test(value)) return 'sports'
  if (/chess|civilization|strategy|dota|league of legends|teamfight/.test(value)) return 'strategy'
  if (/minecraft|art|music|makers|software|creative/.test(value)) return 'creative'
  return 'chat'
}

/** Small themed stage pieces make each game genre recognizable without changing the theatre's dark, calm lighting. */
function GenreSet({ game, hallX, hallH, wallZ, firstRowZ }: { game: string; hallX: number; hallH: number; wallZ: number; firstRowZ: number }) {
  const genre = theatreGenre(game)
  const accent: Record<TheatreGenre, string> = { shooter: '#ef5e67', rpg: '#cf9b4a', horror: '#a34b6c', sports: '#42a7db', strategy: '#55b999', creative: '#d177e8', chat: '#9146ff' }
  const color = accent[genre]
  const sideZ = Math.max(7, firstRowZ - 3)
  if (genre === 'shooter') return <group>
    {[-1, 1].map(side => <group key={side} position={[side * (hallX - 0.7), 0, sideZ]}>
      <mesh position={[0, 1.5, 0]}><boxGeometry args={[0.5, 3, 0.5]} /><meshStandardMaterial color="#20242c" metalness={.35} roughness={.55} /></mesh>
      <mesh position={[0, 3.1, 0]}><boxGeometry args={[0.65, .11, .65]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.65} /></mesh>
      <mesh position={[0, .45, .34]}><boxGeometry args={[.72, .38, .06]} /><meshStandardMaterial color="#14151b" emissive={color} emissiveIntensity={.22} /></mesh>
    </group>)}
  </group>
  if (genre === 'rpg') return <group>
    {[-1, 1].map(side => <group key={side} position={[side * (hallX - 1.1), 0, sideZ]}>
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[.58, .78, 2.4, 7]} /><meshStandardMaterial color="#3c3025" roughness={.9} /></mesh>
      <mesh position={[0, 2.6, 0]}><sphereGeometry args={[.24, 12, 12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>
    </group>)}
  </group>
  if (genre === 'horror') return <group>
    {[-1, 1].map(side => <group key={side} position={[side * (hallX - 1.2), 0, wallZ * .53]}>
      <mesh position={[0, 2.4, 0]}><boxGeometry args={[.6, 4.8, .6]} /><meshStandardMaterial color="#1b1720" roughness={1} /></mesh>
      <pointLight position={[0, 3.2, .2]} color={color} intensity={16} distance={6} />
      <mesh position={[0, 3.2, .35]}><sphereGeometry args={[.13, 10, 10]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} /></mesh>
    </group>)}
  </group>
  if (genre === 'sports') return <group>
    {[-1, 1].map(side => <group key={side} position={[side * (hallX - 1.1), .38, sideZ]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.72, .07, 8, 18]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.7} /></mesh>
      <mesh position={[0, -.3, 0]}><cylinderGeometry args={[.4, .5, .6, 12]} /><meshStandardMaterial color="#171b23" /></mesh>
    </group>)}
  </group>
  if (genre === 'strategy') return <group>
    {[-1, 1].map(side => <group key={side} position={[side * (hallX - 1.3), .5, sideZ]}>
      <mesh rotation-x={-Math.PI / 2}><cylinderGeometry args={[.7, .7, .14, 4]} /><meshStandardMaterial color="#18312e" roughness={.8} /></mesh>
      <mesh position={[0, .52, 0]}><cylinderGeometry args={[.18, .3, .95, 6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.4} /></mesh>
    </group>)}
  </group>
  if (genre === 'creative') return <group>
    {[-1, 1].map(side => <group key={side} position={[side * (hallX - 1.2), 1.25, sideZ]}>
      <mesh><boxGeometry args={[1.25, 1.7, .16]} /><meshStandardMaterial color="#292034" roughness={.85} /></mesh>
      <mesh position={[0, 0, .1]}><planeGeometry args={[.82, 1.24]} /><meshBasicMaterial color={color} transparent opacity={.68} /></mesh>
    </group>)}
  </group>
  return <group>{[-1, 1].map(side => <group key={side} position={[side * (hallX - 1.25), .7, sideZ]}>
    <mesh><sphereGeometry args={[.46, 14, 14]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.5} /></mesh>
    <mesh position={[0, -.72, 0]}><cylinderGeometry args={[.34, .5, .9, 10]} /><meshStandardMaterial color="#231a2c" /></mesh>
  </group>)}</group>
}

// CSS3D maths, the same as drei's <Html transform>: the stream player is an ordinary iframe that lives
// *behind* the canvas and is moved every frame to match the 3D camera.
const epsilon = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v)
function cssMatrix(m: THREE.Matrix4, mult: number[], prepend = '') {
  let out = 'matrix3d('
  for (let i = 0; i !== 16; i++) out += epsilon(mult[i] * m.elements[i]) + (i !== 15 ? ',' : ')')
  return prepend + out
}
const CAMERA_MULT = [1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1]
const objectMult = (f: number) => [1 / f, 1 / f, 1 / f, 1, -1 / f, -1 / f, -1 / f, -1, 1 / f, 1 / f, 1 / f, 1, 1, 1, 1, 1]
const PX_PER_M = 40 // at scale 1 the layer draws 40 px per metre
const PLAYER_PX = [1920, 1080]

const HOLE_MATERIAL = new THREE.ShaderMaterial({
  vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'void main(){gl_FragColor=vec4(0.0);}',
  blending: THREE.NoBlending,
  side: THREE.DoubleSide,
})

/**
 * Cuts a see-through hole in the canvas where the screen is, so the player behind the canvas shows through,
 * but anything standing in front of the screen (avatars, seats, the door frame) still covers it.
 */
function ScreenRig({ layerRef, outerRef, innerRef }: {
  layerRef: React.RefObject<HTMLDivElement | null>
  outerRef: React.RefObject<HTMLDivElement | null>
  innerRef: React.RefObject<HTMLDivElement | null>
}) {
  const g = useRef<THREE.Group>(null)
  const { camera, size } = useThree()
  useFrame(() => {
    const layer = layerRef.current, outer = outerRef.current, inner = innerRef.current, grp = g.current
    if (!layer || !outer || !inner || !grp) return
    camera.updateMatrixWorld()
    grp.updateWorldMatrix(true, false)
    const cam = camera as THREE.PerspectiveCamera
    const wh = size.width / 2, hh = size.height / 2
    const fov = cam.projectionMatrix.elements[5] * hh
    layer.style.width = size.width + 'px'
    layer.style.height = size.height + 'px'
    layer.style.perspective = fov + 'px'
    outer.style.width = size.width + 'px'
    outer.style.height = size.height + 'px'
    outer.style.transform = `translateZ(${fov}px)${cssMatrix(camera.matrixWorldInverse, CAMERA_MULT)}translate(${wh}px,${hh}px)`
    inner.style.transform = cssMatrix(grp.matrixWorld, objectMult(PX_PER_M), 'translate(-50%,-50%)')
  })
  return (
    <>
      <group ref={g} position={[0, L.screenY, 0.53]} scale={L.screenW / (PLAYER_PX[0] / PX_PER_M)} />
      <mesh position={[0, L.screenY, 0.53]} material={HOLE_MATERIAL}>
        <planeGeometry args={[L.screenW, L.screenH]} />
      </mesh>
    </>
  )
}

function Seats({ players, sit, aimed, objs }: {
  players: Record<string, Player>
  sit: (seat: number) => void
  aimed: number
  objs: React.MutableRefObject<THREE.Object3D[]>
}) {
  const taken = useMemo(() => new Set(Object.values(players).filter((p) => p.seat >= 0).map((p) => p.seat)), [players])
  const [hover, setHover] = useState(-1)
  return (
    <group>
      {Array.from({ length: L.seats }, (_, i) => {
        const [x, , z] = seatPos(i)
        const highlighted = hover === i || aimed === i
        const color = taken.has(i) ? '#3c3547' : highlighted ? '#a96af4' : '#542e72'
        return (
          <group
            key={i}
            ref={(o) => { if (o) { o.userData.seat = i; objs.current[i] = o } }}
            position={[x, 0, z]}
            onClick={(e) => { e.stopPropagation(); lastSeatClick = performance.now(); if (!taken.has(i)) sit(i) }}
            onPointerOver={(e) => { e.stopPropagation(); setHover(i); document.body.style.cursor = taken.has(i) ? 'default' : 'pointer' }}
            onPointerOut={() => { setHover(-1); document.body.style.cursor = 'auto' }}
          >
            <mesh position={[0, 0.12, 0.02]}><cylinderGeometry args={[0.22, 0.28, 0.18, 8]} /><meshStandardMaterial color="#201b28" metalness={0.5} roughness={0.58} /></mesh>
            <mesh position={[0, 0.43, -0.06]}><boxGeometry args={[0.92, 0.24, 0.84]} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>
            <mesh position={[0, 0.95, 0.32]}><boxGeometry args={[0.92, 0.92, 0.2]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
            <mesh position={[0, 0.58, 0.432]}><boxGeometry args={[0.72, 0.07, 0.025]} /><meshStandardMaterial color={taken.has(i) ? '#51495b' : '#b87bff'} emissive={taken.has(i) ? '#000000' : '#773fc0'} emissiveIntensity={0.55} /></mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.55, 0.59, 0.02]}>
                <boxGeometry args={[0.16, 0.3, 0.72]} />
                <meshStandardMaterial color="#25202c" metalness={0.24} roughness={0.7} />
              </mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}

/** The local player's controller, the camera rig and every avatar in the room. */
function Cast({ players, selfId, emotes, bubbles, waves, move, sit, wave, appearance, onInside, seatObjs, onAim, onLock, onLockless }: Props & {
  onInside: (v: boolean) => void
  seatObjs: React.MutableRefObject<THREE.Object3D[]>
  onAim: (seat: number) => void
  onLock: (locked: boolean) => void
  onLockless: (lockless: boolean) => void
}) {
  const { camera, gl } = useThree()
  const pos = useRef(L.spawn.clone())
  const vel = useRef(new THREE.Vector3()) // horizontal velocity, m/s
  const vy = useRef(0) // vertical velocity
  const air = useRef(false)
  const coyote = useRef(0) // grace period to still jump just after walking off something
  const jumpBuf = useRef(0) // a jump pressed just before landing still counts
  const heading = useRef(0) // which way the body faces; follows the movement direction
  const selfMoving = useRef(false)
  const yaw = useRef(0) // camera yaw
  const pitch = useRef(-0.2) // camera pitch, positive looks up
  const look = useRef(false) // mouse-look mode: pointer locked, or the lock-less fallback below
  const lockless = useRef(false) // the browser refused pointer lock, so we read plain mouse movement instead
  const aimRef = useRef(-1)
  const ptr = useRef({ x: 0, y: 0, over: false })
  const prevSeated = useRef(false)
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const playersRef = useRef(players)
  playersRef.current = players
  const sitRef = useRef(sit)
  sitRef.current = sit
  const waveRef = useRef(wave)
  waveRef.current = wave
  const keys = useRef<Record<string, boolean>>({})
  const lastSent = useRef(0)
  const lastWave = useRef(0)
  const standAt = useRef(0)
  const wasInside = useRef(false)
  const wasMoving = useRef(false)
  const mySeat = players[selfId]?.seat ?? -1
  const seatRef = useRef(-1)
  seatRef.current = mySeat
  const moveRef = useRef(move)
  moveRef.current = move
  const selfIdRef = useRef(selfId)
  selfIdRef.current = selfId

  if (import.meta.env.DEV) (window as any).__ww = { pos, vy, yaw, pitch, look, lockless, air, heading }

  const send = () => {
    const [x, y] = toUnit(pos.current.x, pos.current.z)
    moveRef.current(x, y, seatRef.current >= 0 ? 0 : heading.current)
    lastSent.current = performance.now()
  }

  /** Wave at the closest other player within 8 m, or just wave. */
  const doWave = () => {
    const now = performance.now()
    if (now - lastWave.current < 1500) return
    lastWave.current = now
    let best: string | undefined
    let bestD = 8
    for (const pl of Object.values(playersRef.current)) {
      if (pl.id === selfIdRef.current) continue
      const [wx, wz] = pl.seat >= 0 ? [seatPos(pl.seat)[0], seatPos(pl.seat)[2]] : toWorld(pl.x, pl.y)
      const d = Math.hypot(wx - pos.current.x, wz - pos.current.z)
      if (d < bestD) { bestD = d; best = pl.id }
    }
    waveRef.current(best)
  }

  useEffect(() => {
    const canvas = gl.domElement
    const root = canvas.closest('.worldroot') as HTMLElement // the canvas ignores the mouse; the root receives it
    const setLook = (on: boolean) => {
      look.current = on
      root.classList.toggle('looking', on)
      onLock(on)
    }
    const enterLook = () => {
      if (look.current) return
      lockless.current = false
      setLook(true)
      try {
        Promise.resolve(canvas.requestPointerLock()).catch(() => { lockless.current = true; onLockless(true) })
      } catch {
        lockless.current = true
        onLockless(true)
      }
    }
    const typing = (e: Event) => ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      const key = e.key.toLowerCase()
      if (key === ' ' || key.startsWith('arrow')) e.preventDefault()
      keys.current[key] = true
      if (e.repeat) return
      if (key === 'f') doWave()
      if (key === ' ') jumpBuf.current = 0.15
      if (key === 'escape' && look.current && lockless.current) setLook(false)
    }
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false }
    const blur = () => { keys.current = {} }
    let drag = false
    const pd = () => { drag = true }
    const pu = () => { drag = false }
    const perr = () => { lockless.current = true; onLockless(true) }
    const lockChange = () => {
      if (document.pointerLockElement === canvas) { lockless.current = false; onLockless(false) }
      else if (look.current && !lockless.current) setLook(false) // Esc out of a real pointer lock
    }
    const pm = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ptr.current = {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: ((e.clientY - r.top) / r.height) * 2 - 1,
        over: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom,
      }
      if (!look.current && !(drag && e.buttons)) return
      const k = look.current ? 0.0022 : 0.005
      yaw.current -= e.movementX * k
      pitch.current = Math.max(-1.1, Math.min(1.3, pitch.current - e.movementY * k))
    }
    const md = (e: MouseEvent) => {
      if (!look.current) return
      // clicking anything other than the scene (chat box, buttons) hands the mouse back
      if (lockless.current && !root.contains(e.target as Node)) return setLook(false)
      // while looking around, a click sits you in the seat under the crosshair
      const seat = aimRef.current
      if (seat >= 0 && !Object.values(playersRef.current).some((p) => p.seat === seat)) sitRef.current(seat)
    }
    const click = () => { if (performance.now() - lastSeatClick > 150) enterLook() }
    root.addEventListener('click', click)
    document.addEventListener('pointerlockchange', lockChange)
    document.addEventListener('pointerlockerror', perr)
    window.addEventListener('mousedown', md)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    root.addEventListener('pointerdown', pd)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointermove', pm)
    send() // place ourselves at the spawn point
    return () => {
      root.removeEventListener('click', click)
      document.removeEventListener('pointerlockchange', lockChange)
      document.removeEventListener('pointerlockerror', perr)
      window.removeEventListener('mousedown', md)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      root.classList.remove('looking')
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      root.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointermove', pm)
    }
  }, [gl])

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.1)
    const k = keys.current
    const f = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
    const s = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
    yaw.current += ((k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0)) * 1.8 * dt
    if (look.current && lockless.current && ptr.current.over) {
      // without pointer lock the cursor can hit the edge of the view; keep turning while it is parked there
      const edge = (v: number) => (Math.abs(v) > 0.88 ? Math.sign(v) * (Math.abs(v) - 0.88) / 0.12 : 0)
      yaw.current -= edge(ptr.current.x) * 2.2 * dt
      pitch.current = Math.max(-1.1, Math.min(1.3, pitch.current - edge(ptr.current.y) * 1.4 * dt))
    }
    const wantsMove = f !== 0 || s !== 0
    const now = performance.now()
    const p = pos.current
    jumpBuf.current = Math.max(0, jumpBuf.current - dt)
    const seated = seatRef.current >= 0 && now - standAt.current > 500

    if (seated) {
      vel.current.set(0, 0, 0)
      vy.current = 0
      air.current = false
      selfMoving.current = false
      if (wantsMove || jumpBuf.current > 0) {
        // any movement key (or jump) stands you up; the server clears the seat on `move`
        jumpBuf.current = 0
        standAt.current = now
        p.z += 1.4
        send()
      } else {
        const [sx, , sz] = seatPos(seatRef.current)
        p.set(sx, 0, sz)
      }
    } else {
      // horizontal: ease toward the target speed; weaker steering but kept momentum in the air
      const top = k['shift'] ? RUN_SPEED : WALK_SPEED
      const want = new THREE.Vector3()
      if (wantsMove) {
        const fx = -Math.sin(yaw.current), fz = -Math.cos(yaw.current)
        const rx = Math.cos(yaw.current), rz = -Math.sin(yaw.current)
        want.set(fx * f + rx * s, 0, fz * f + rz * s).normalize().multiplyScalar(top)
      }
      const rate = air.current ? (wantsMove ? 3.5 : 0.6) : wantsMove ? 11 : 15
      vel.current.lerp(want, 1 - Math.exp(-rate * dt))
      const speed = vel.current.length()
      if (speed < 0.05 && !wantsMove && !air.current) vel.current.set(0, 0, 0)
      if (speed > 0.05) {
        const dx = vel.current.x * dt, dz = vel.current.z * dt
        if (!blocked(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz }
        else if (!blocked(p.x + dx, p.z)) p.x += dx
        else if (!blocked(p.x, p.z + dz)) p.z += dz
        // the body turns toward where you are going, not where the camera looks
        const want = Math.atan2(-vel.current.x, -vel.current.z)
        const diff = Math.atan2(Math.sin(want - heading.current), Math.cos(want - heading.current))
        heading.current += diff * (1 - Math.exp(-12 * dt))
      }

      // vertical: gravity, coyote time and a jump buffer so jumping feels forgiving
      const grounded = p.y <= 0.001 && vy.current <= 0
      coyote.current = grounded ? 0.1 : coyote.current - dt
      if (jumpBuf.current > 0 && coyote.current > 0) {
        vy.current = JUMP_SPEED
        coyote.current = 0
        jumpBuf.current = 0
      }
      vy.current -= GRAVITY * dt
      p.y += vy.current * dt
      if (p.y <= 0) {
        p.y = 0
        if (vy.current < 0) vy.current = 0
      }
      air.current = p.y > 0.02

      const movingNow = speed > 0.4
      selfMoving.current = movingNow
      if (movingNow && now - lastSent.current > 100) send()
      else if (!movingNow && wasMoving.current) send() // final position when you stop
      else if (!movingNow && now - lastSent.current > 1500) send() // heartbeat
      wasMoving.current = movingNow
    }

    const isIn = p.z < L.wallZ - 0.3
    if (isIn !== wasInside.current) {
      wasInside.current = isIn
      onInside(isIn)
    }

    // camera rig: first person from a seat, third person otherwise; both follow yaw and pitch
    const want = new THREE.Vector3()
    const target = new THREE.Vector3()
    const cp = Math.cos(pitch.current), sp = Math.sin(pitch.current)
    const seatedNow = seatRef.current >= 0 && now - standAt.current > 500
    if (seatedNow !== prevSeated.current) {
      prevSeated.current = seatedNow
      yaw.current = 0
      pitch.current = seatedNow ? 0.25 : -0.2
    }
    if (seatedNow) {
      want.set(p.x, 1.85, p.z + 0.1)
      target.set(want.x - Math.sin(yaw.current) * cp * 10, want.y + sp * 10, want.z - Math.cos(yaw.current) * cp * 10)
    } else {
      want.set(p.x + Math.sin(yaw.current) * cp * 4.6, 1.6 - sp * 4.6 + p.y * 0.7, p.z + Math.cos(yaw.current) * cp * 4.6)
      want.y = Math.max(0.4, want.y)
      if (p.z < L.wallZ - 0.5) {
        // indoors the camera must not poke through the walls
        want.x = Math.max(-(L.hallX - 0.5), Math.min(L.hallX - 0.5, want.x))
        want.z = Math.min(want.z, L.wallZ - 0.5)
      }
      target.set(p.x, 1.5 + p.y * 0.8, p.z)
    }
    camera.position.lerp(want, 1 - Math.exp(-(seatedNow ? 9 : 14) * dt))
    camera.lookAt(target)

    // sprinting widens the field of view a little
    const cam = camera as THREE.PerspectiveCamera
    const wantFov = 65 + (selfMoving.current && k['shift'] ? 8 : 0) + (air.current ? 3 : 0)
    if (Math.abs(cam.fov - wantFov) > 0.05) {
      cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-6 * dt))
      cam.updateProjectionMatrix()
    }

    // which seat is under the crosshair (only while looking around)
    let aim = -1
    if (look.current && !seatedNow) {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera)
      const hit = ray.intersectObjects(seatObjs.current.filter(Boolean), true)[0]
      if (hit && hit.distance < 22) {
        let o: THREE.Object3D | null = hit.object
        while (o && o.userData.seat === undefined) o = o.parent
        if (o) aim = o.userData.seat
      }
    }
    if (aim !== aimRef.current) {
      aimRef.current = aim
      onAim(aim)
    }
  })

  return (
    <group>
      {Object.values(players).map((pl) => (
        <Avatar
          key={pl.id}
          player={pl}
          isSelf={pl.id === selfId}
          selfPos={pos}
          selfHeading={heading}
          selfMoving={selfMoving}
          selfAir={air}
          emotes={emotes}
          bubble={bubbles[pl.id]}
          waving={waves.some((w) => w.playerId === pl.id)}
          appearance={pl.id === selfId ? appearance : parseLook(pl.look) ?? CLASSIC}
        />
      ))}
    </group>
  )
}

/** Theatre player wrapper: shared character rig plus name tag, speech bubble, and emotes. */
function Avatar({ player, isSelf, selfPos, selfHeading, selfMoving, selfAir, emotes, bubble, waving, appearance }: {
  player: Player
  isSelf: boolean
  selfPos: React.MutableRefObject<THREE.Vector3>
  selfHeading: React.MutableRefObject<number>
  selfMoving: React.MutableRefObject<boolean>
  selfAir: React.MutableRefObject<boolean>
  emotes: FloatingEmote[]
  bubble?: Bubble
  waving: boolean
  appearance: Appearance
}) {
  const g = useRef<THREE.Group>(null)
  const motion = useRef<CharacterMotion>({ alt: 0, vel: new THREE.Vector3(), seated: false, waving: false })
  const target = useMemo(() => new THREE.Vector3(), [])
  const prev = useMemo(() => new THREE.Vector3(), [])
  const inited = useRef(false)
  const seated = player.seat >= 0
  const mine = emotes.filter((m) => m.playerId === player.id)
  const wavingRef = useRef(waving)
  wavingRef.current = waving

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.1)
    const grp = g.current
    if (!grp) return
    motion.current.seated = seated
    motion.current.waving = wavingRef.current
    motion.current.alt = isSelf && selfAir.current ? 0.2 : 0
    let speed = 0

    if (isSelf) {
      grp.position.copy(selfPos.current)
      grp.rotation.y = seated ? 0 : selfHeading.current
      speed = selfMoving.current ? 5 : 0
    } else {
      if (seated) {
        const [sx, , sz] = seatPos(player.seat)
        target.set(sx, 0.35, sz)
      } else {
        const [x, z] = toWorld(player.x, player.y)
        target.set(x, 0, z)
      }
      if (!inited.current) {
        grp.position.copy(target)
        inited.current = true
      }
      prev.copy(grp.position)
      grp.position.lerp(target, 1 - Math.exp(-10 * dt))
      speed = grp.position.distanceTo(prev) / Math.max(dt, 1e-3)
      let want = grp.rotation.y
      if (seated) want = 0
      else if (typeof player.yaw === 'number') want = player.yaw
      else if (speed > 0.3) want = Math.atan2(-(target.x - prev.x), -(target.z - prev.z))
      const diff = Math.atan2(Math.sin(want - grp.rotation.y), Math.cos(want - grp.rotation.y))
      grp.rotation.y += diff * (1 - Math.exp(-10 * dt))
    }

    motion.current.vel.set(0, 0, speed)
  })

  return (
    <group ref={g} visible={!(isSelf && seated)}>
      <BlockyCharacter motion={motion} appearance={appearance} />
      <Html center position={[0, 2.3, 0]} distanceFactor={9} zIndexRange={[2000, 1000]} style={{ pointerEvents: 'none' }}>
        <div className="nametag">{isSelf ? 'you' : player.name}</div>
      </Html>
      {bubble && (
        <Html key={bubble.id} center position={[0, 2.8, 0]} distanceFactor={9} zIndexRange={[2000, 1000]} style={{ pointerEvents: 'none' }}>
          <div className="bubble">{bubble.text}</div>
        </Html>
      )}
      {mine.map((m) => (
        <Html key={m.id} center position={[0, 3.3, 0]} zIndexRange={[2000, 1000]} style={{ pointerEvents: 'none' }}>
          <span className="emote3d">{m.emoji}</span>
        </Html>
      ))}
    </group>
  )
}
