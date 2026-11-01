import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Bubble, FloatingEmote, Player, WaveEvent } from './useRoom'

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
  players: Record<string, Player>
  selfId: string
  emotes: FloatingEmote[]
  bubbles: Record<string, Bubble>
  waves: WaveEvent[]
  sit: (seat: number) => void
  move: (x: number, y: number, yaw?: number) => void
  wave: (targetId?: string) => void
  capacity: number
}

let twitchScript: Promise<void> | null = null
/** Twitch's embed script lets us mute and unmute the player from code without reloading it. */
const loadTwitch = () =>
  (twitchScript ??= new Promise<void>((resolve, reject) => {
    if ((window as any).Twitch?.Player) return resolve()
    const el = document.createElement('script')
    el.src = 'https://player.twitch.tv/js/embed/v1.js'
    el.onload = () => resolve()
    el.onerror = () => reject(new Error('Twitch embed script failed to load'))
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
  const [aimed, setAimed] = useState(-1)
  const [locked, setLocked] = useState(false)
  const [lockless, setLockless] = useState(false)
  const seatObjs = useRef<THREE.Object3D[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  // The film starts by itself and has no controls. It plays muted from the street and the sound comes on once you are inside.
  useEffect(() => {
    let dead = false
    setFallback(false)
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
          controls: false,
        })
        player.current = p
        const apply = () => { try { p.setMuted(!insideRef.current); p.setVolume(1) } catch { /* not ready yet */ } }
        p.addEventListener(Twitch.Player.READY, apply)
        p.addEventListener(Twitch.Player.PLAYING, apply)
      })
      .catch(() => { if (!dead) setFallback(true) })
    return () => {
      dead = true
      player.current = null
      if (playerBox.current) playerBox.current.innerHTML = ''
    }
  }, [props.login])

  useEffect(() => {
    try { player.current?.setMuted(!inside) } catch { /* player not ready */ }
  }, [inside])

  return (
    <div className="worldroot" ref={rootRef}>
      {/* the stream player: a plain iframe behind the canvas, moved to match the 3D screen every frame */}
      <div className="screenlayer" ref={layerRef}>
        <div ref={outerRef} style={{ position: 'absolute', top: 0, left: 0, transformStyle: 'preserve-3d', pointerEvents: 'none' }}>
          <div ref={innerRef} style={{ position: 'absolute', pointerEvents: 'none' }}>
            {fallback ? (
              <iframe
                title="stream"
                width={PLAYER_PX[0]}
                height={PLAYER_PX[1]}
                style={{ border: 0, display: 'block', background: '#000' }}
                src={`https://player.twitch.tv/?channel=${encodeURIComponent(props.login)}&parent=${location.hostname}&muted=true&autoplay=true&controls=false`}
                allow="autoplay; fullscreen"
              />
            ) : (
              <div ref={playerBox} style={{ width: PLAYER_PX[0], height: PLAYER_PX[1], background: '#000' }} />
            )}
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
        <Environment displayName={props.displayName} />
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

function Environment({ displayName }: { displayName: string }) {
  const marquee = useMemo(() => labelTexture(['NOW SHOWING', displayName.slice(0, 18)]), [displayName])
  const wall = <meshStandardMaterial color="#1b1428" roughness={0.9} />
  const { hallX, hallH, wallZ, screenW, screenH, screenY, firstRowZ } = L
  const sideW = hallX - 1.4
  const lintelH = hallH - 3.5
  const lightRange = Math.max(26, wallZ)
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
        <meshStandardMaterial color="#2b1f45" roughness={0.95} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, hallH, wallZ / 2]}>
        <planeGeometry args={[hallX * 2, wallZ]} />
        <meshStandardMaterial color="#0f0b18" />
      </mesh>

      {/* back wall, side walls */}
      <mesh position={[0, hallH / 2, -0.2]}><boxGeometry args={[hallX * 2 + 0.8, hallH, 0.4]} />{wall}</mesh>
      <mesh position={[-hallX - 0.2, hallH / 2, wallZ / 2]}><boxGeometry args={[0.4, hallH, wallZ]} />{wall}</mesh>
      <mesh position={[hallX + 0.2, hallH / 2, wallZ / 2]}><boxGeometry args={[0.4, hallH, wallZ]} />{wall}</mesh>

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

      {/* stage + screen backing */}
      <mesh position={[0, 0.2, 2.2]}><boxGeometry args={[hallX * 2 - 1, 0.4, 3.4]} /><meshStandardMaterial color="#1a1226" /></mesh>
      <mesh position={[0, screenY, 0.4]}><boxGeometry args={[screenW + 0.6, screenH + 0.5, 0.2]} /><meshStandardMaterial color="#05050a" /></mesh>
    </group>
  )
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
        const color = taken.has(i) ? '#4a4558' : hover === i || aimed === i ? '#c9a5ff' : '#7a3df0'
        return (
          <group
            key={i}
            ref={(o) => { if (o) { o.userData.seat = i; objs.current[i] = o } }}
            position={[x, 0, z]}
            onClick={(e) => { e.stopPropagation(); lastSeatClick = performance.now(); if (!taken.has(i)) sit(i) }}
            onPointerOver={(e) => { e.stopPropagation(); setHover(i); document.body.style.cursor = taken.has(i) ? 'default' : 'pointer' }}
            onPointerOut={() => { setHover(-1); document.body.style.cursor = 'auto' }}
          >
            <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.8, 0.5, 0.8]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
            <mesh position={[0, 0.85, 0.34]}><boxGeometry args={[0.8, 0.8, 0.14]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
          </group>
        )
      })}
    </group>
  )
}

/** The local player's controller, the camera rig and every avatar in the room. */
function Cast({ players, selfId, emotes, bubbles, waves, move, sit, wave, onInside, seatObjs, onAim, onLock, onLockless }: Props & {
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
        />
      ))}
    </group>
  )
}

/** A small articulated avatar: legs and arms swing with speed, sit pose, wave pose, name tag, speech bubble. */
function Avatar({ player, isSelf, selfPos, selfHeading, selfMoving, selfAir, emotes, bubble, waving }: {
  player: Player
  isSelf: boolean
  selfPos: React.MutableRefObject<THREE.Vector3>
  selfHeading: React.MutableRefObject<number>
  selfMoving: React.MutableRefObject<boolean>
  selfAir: React.MutableRefObject<boolean>
  emotes: FloatingEmote[]
  bubble?: Bubble
  waving: boolean
}) {
  const g = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(), [])
  const prev = useMemo(() => new THREE.Vector3(), [])
  const inited = useRef(false)
  const phase = useRef(0)
  const clock = useRef(0)
  const walk = useRef(0)
  const seated = player.seat >= 0
  const mine = emotes.filter((m) => m.playerId === player.id)
  const wavingRef = useRef(waving)
  wavingRef.current = waving

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.1)
    const grp = g.current
    if (!grp) return
    clock.current += dt
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

    walk.current += (Math.min(1, speed / 4) - walk.current) * (1 - Math.exp(-10 * dt))
    phase.current += dt * (5 + speed * 0.9) * (walk.current > 0.05 ? 1 : 0)
    const swing = Math.sin(phase.current) * 0.8 * walk.current
    const t = clock.current

    if (legL.current && legR.current) {
      legL.current.rotation.x = seated ? Math.PI / 2 : swing
      legR.current.rotation.x = seated ? Math.PI / 2 : -swing
    }
    const airborne = isSelf && selfAir.current
    if (legL.current && legR.current && airborne) {
      legL.current.rotation.x = -0.6
      legR.current.rotation.x = 0.3
    }
    if (armL.current) {
      armL.current.rotation.x = seated ? 0.3 : airborne ? 0 : -swing * 0.8
      armL.current.rotation.z = airborne ? -0.8 : 0
    }
    if (armR.current) {
      if (wavingRef.current) {
        armR.current.rotation.x = 0
        armR.current.rotation.z = Math.PI * 0.78 + Math.sin(t * 12) * 0.28
      } else {
        armR.current.rotation.z = airborne ? 0.8 : 0
        armR.current.rotation.x = seated ? 0.3 : airborne ? 0 : swing * 0.8
      }
    }
    if (torso.current) torso.current.position.y = Math.abs(Math.sin(phase.current)) * 0.05 * walk.current + Math.sin(t * 2) * 0.01
  })

  const body = player.color
  return (
    <group ref={g} visible={!(isSelf && seated)}>
      <group ref={torso}>
        <mesh position={[0, 1.0, 0]}>
          <capsuleGeometry args={[0.24, 0.5, 6, 12]} />
          <meshStandardMaterial color={body} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.72, 0]}>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshStandardMaterial color={body} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.74, -0.19]}>
          <boxGeometry args={[0.3, 0.1, 0.1]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <group ref={armL} position={[-0.34, 1.35, 0]}>
          <mesh position={[0, -0.26, 0]}><boxGeometry args={[0.12, 0.52, 0.12]} /><meshStandardMaterial color={body} roughness={0.6} /></mesh>
        </group>
        <group ref={armR} position={[0.34, 1.35, 0]}>
          <mesh position={[0, -0.26, 0]}><boxGeometry args={[0.12, 0.52, 0.12]} /><meshStandardMaterial color={body} roughness={0.6} /></mesh>
        </group>
      </group>
      <group ref={legL} position={[-0.13, 0.62, 0]}>
        <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.17, 0.6, 0.17]} /><meshStandardMaterial color="#1c1830" roughness={0.7} /></mesh>
      </group>
      <group ref={legR} position={[0.13, 0.62, 0]}>
        <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.17, 0.6, 0.17]} /><meshStandardMaterial color="#1c1830" roughness={0.7} /></mesh>
      </group>
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
