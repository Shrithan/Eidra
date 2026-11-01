import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Client, type Room } from 'colyseus.js'
import type { SphereLayout } from './sphereLayout'
import { CUBE, useBaked } from './sphereModels'

const V = THREE.Vector3
const Y = new V(0, 1, 0)
const SERVER = import.meta.env.DEV ? 'ws://localhost:2567' : `ws://${location.hostname}:2567`

export type Resident = { kind?: number; id: string; name: string; color: THREE.Color; P: THREE.Vector3; F: THREE.Vector3; tP: THREE.Vector3; tF: THREE.Vector3; alt: number; tAlt: number }
export type ChatLine = { id: number; name: string; text: string; self?: boolean; system?: boolean }
export type Bubble = { text: string; until: number }
export type Status = 'connecting' | 'live' | 'simulated'

export type WorldPeople = {
  residents: React.MutableRefObject<Map<string, Resident>>
  bubbles: React.MutableRefObject<Map<string, Bubble>>
  chat: ChatLine[]
  status: Status
  count: number
  say: (text: string) => void
  sendMove: (P: THREE.Vector3, F: THREE.Vector3, alt: number) => void
  tick: (dt: number) => void
}

const ADJ = ['Neon', 'Pixel', 'Cosmic', 'Turbo', 'Silent', 'Lucky', 'Cyber', 'Nova', 'Glitch', 'Hyper', 'Retro', 'Astro', 'Lunar', 'Vivid', 'Quantum']
const NOUN = ['Fox', 'Wolf', 'Panda', 'Raven', 'Byte', 'Comet', 'Ninja', 'Otter', 'Drone', 'Ghost', 'Moth', 'Kite', 'Pilot', 'Spark', 'Echo']
const LINES = [
  'this city is huge', 'who is watching {s}?', 'anyone going to {c}?', 'the skyline here is insane', 'gg', 'just got here, hi all',
  '{s} is live right now', 'looking for people to watch with', 'those flying cars tho', 'first time on the world, how do I fly?',
  'meet at the {c} district?', 'W stream', 'lol', 'this place never sleeps', 'who wants to raid someone?', 'good vibes in here',
]

let uid = 0
const nextId = () => ++uid

/**
 * Everyone else on the planet. Connects to the server's `world` room (see CONTRACT.md); when the server is not there,
 * simulated residents fill the streets around the busiest buildings so the world is never empty.
 */
export function useWorldPeople(layout: SphereLayout | null, myName: string, planet = 'main'): WorldPeople {
  const residents = useRef(new Map<string, Resident>())
  const bubbles = useRef(new Map<string, Bubble>())
  const [chat, setChat] = useState<ChatLine[]>([])
  const [status, setStatus] = useState<Status>('connecting')
  const [count, setCount] = useState(1)
  const roomRef = useRef<Room | null>(null)
  const lastSend = useRef(0)
  const sim = useRef<null | { npcs: { r: Resident; plot: number; r0: number; ang: number; sign: number; speed: number; hop: number }[]; timer: ReturnType<typeof setInterval> }>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const push = useCallback((l: Omit<ChatLine, 'id'>) => setChat((c) => [...c.slice(-90), { ...l, id: nextId() }]), [])
  const say0 = useCallback((id: string, name: string, text: string) => {
    bubbles.current.set(id, { text: text.slice(0, 90), until: performance.now() + 6500 })
    push({ name, text })
  }, [push])

  const stopSim = useCallback(() => {
    if (!sim.current) return
    clearInterval(sim.current.timer)
    sim.current = null
    for (const id of [...residents.current.keys()]) if (id.startsWith('npc')) residents.current.delete(id)
  }, [])

  const startSim = useCallback(() => {
    const L = layoutRef.current
    if (!L || sim.current) return
    // put the residents around busy buildings: pick buildings weighted by how many people watch them
    const weights = L.plots.map((p) => Math.log10(p.stream.viewers + 1) + 0.2)
    const total = weights.reduce((a, b) => a + b, 0)
    const pick = () => { let x = Math.random() * total; for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return i } return 0 }
    const npcs = Array.from({ length: 72 }, (_, i) => {
      const plot = pick()
      const hue = Math.random()
      const r: Resident = {
        id: `npc${i}`, name: `${ADJ[Math.floor(Math.random() * ADJ.length)]}${NOUN[Math.floor(Math.random() * NOUN.length)]}${Math.floor(Math.random() * 90 + 10)}`,
        color: new THREE.Color().setHSL(hue, 0.7, 0.58), P: new V(0, 1, 0), F: new V(0, 0, -1), tP: new V(0, 1, 0), tF: new V(0, 0, -1), alt: 0, tAlt: 0,
      }
      residents.current.set(r.id, r)
      return { r, plot, r0: L.plots[plot].footprint * 0.62 + 3.4 + Math.random() * 3, ang: Math.random() * Math.PI * 2, sign: Math.random() < 0.5 ? 1 : -1, speed: 1.2 + Math.random() * 2.2, hop: i % 5 === 0 ? 1 : 0 }
    })
    const timer = setInterval(() => {
      const n = npcs[Math.floor(Math.random() * npcs.length)]
      const p = L.plots[n.plot]
      const line = LINES[Math.floor(Math.random() * LINES.length)].replace('{s}', p.stream.displayName).replace('{c}', p.category)
      say0(n.r.id, n.r.name, line)
    }, 4500)
    sim.current = { npcs, timer }
    setStatus('simulated')
    setCount(npcs.length + 1)
    push({ name: '', text: 'No server connection: these residents are simulated. Run the backend to meet real people.', system: true })
  }, [push, say0])

  // ---- connect to the world room, fall back to simulated residents, keep retrying ----
  useEffect(() => {
    if (!layout) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const client = new Client(SERVER)
    const connect = () => {
      client.joinOrCreate('world', { name: myName, shard: planet }).then((room) => {
        if (cancelled) return room.leave()
        stopSim()
        roomRef.current = room
        setStatus('live')
        const sync = () => {
          const state = room.state as any
          const players = state?.players
          if (!players) return
          const seen = new Set<string>()
          players.forEach((p: any, id: string) => {
            if (id === room.sessionId) return
            seen.add(id)
            let r = residents.current.get(id)
            if (!r) {
              r = { id, name: p.name, color: new THREE.Color(p.color || '#ffffff'), P: new V(p.px, p.py, p.pz), F: new V(p.fx, p.fy, p.fz), tP: new V(), tF: new V(), alt: 0, tAlt: 0 }
              residents.current.set(id, r)
            }
            r.name = p.name
            r.tP.set(p.px, p.py, p.pz)
            r.tF.set(p.fx, p.fy, p.fz)
            r.tAlt = p.alt ?? 0
          })
          for (const id of [...residents.current.keys()]) if (!seen.has(id)) residents.current.delete(id)
          setCount(seen.size + 1)
        }
        room.onStateChange(sync)
        sync()
        room.onMessage('chat', (m: { id?: string; name: string; text: string }) => say0(m.id ?? '', m.name, m.text))
        room.onMessage('system', (m: { text: string }) => push({ name: '', text: m.text, system: true }))
        room.onLeave(() => {
          if (roomRef.current === room) roomRef.current = null
          for (const id of [...residents.current.keys()]) residents.current.delete(id)
          if (!cancelled) { startSim(); retry = setTimeout(connect, 5000) }
        })
      }).catch(() => {
        if (cancelled) return
        startSim()
        retry = setTimeout(connect, 5000)
      })
    }
    connect()
    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
      roomRef.current?.leave()
      roomRef.current = null
      stopSim()
      residents.current.clear()
    }
  }, [layout, myName, planet, startSim, stopSim, say0, push])

  const say = useCallback((text: string) => {
    const t = text.trim().slice(0, 200)
    if (!t) return
    if (roomRef.current) { roomRef.current.send('chat', { text: t }); return }
    bubbles.current.set('me', { text: t.slice(0, 90), until: performance.now() + 6500 })
    push({ name: myName, text: t, self: true })
    // a simulated resident answers now and then
    if (sim.current && Math.random() < 0.6) {
      const n = sim.current.npcs[Math.floor(Math.random() * sim.current.npcs.length)]
      const replies = ['welcome!', 'hey!', 'lol same', 'nice, add me', 'o/', 'where are you? I will come over', 'good to see new people']
      setTimeout(() => say0(n.r.id, n.r.name, replies[Math.floor(Math.random() * replies.length)]), 1400 + Math.random() * 1800)
    }
  }, [myName, push, say0])

  const sendMove = useCallback((P: THREE.Vector3, F: THREE.Vector3, alt: number) => {
    const room = roomRef.current
    if (!room) return
    const now = performance.now()
    if (now - lastSend.current < 100) return
    lastSend.current = now
    room.send('move', { p: [P.x, P.y, P.z], f: [F.x, F.y, F.z], alt })
  }, [])

  const tmp = useMemo(() => ({ t1: new V(), t2: new V(), c: new V(), d: new V() }), [])
  const tick = useCallback((dt: number) => {
    const s = sim.current, L = layoutRef.current
    if (!s || !L) return
    const now = performance.now() / 1000
    for (const n of s.npcs) {
      n.ang += (n.sign * n.speed * dt) / n.r0
      const center = L.plots[n.plot].dir
      tmp.t1.crossVectors(center, Y)
      if (tmp.t1.lengthSq() < 1e-4) tmp.t1.set(1, 0, 0)
      tmp.t1.normalize()
      tmp.t2.crossVectors(center, tmp.t1)
      const cos = Math.cos(n.ang), sin = Math.sin(n.ang)
      tmp.c.copy(center).multiplyScalar(L.R).addScaledVector(tmp.t1, cos * n.r0).addScaledVector(tmp.t2, sin * n.r0)
      n.r.P.copy(tmp.c).normalize()
      tmp.d.copy(tmp.t1).multiplyScalar(-sin * n.sign).addScaledVector(tmp.t2, cos * n.sign)
      tmp.d.addScaledVector(n.r.P, -tmp.d.dot(n.r.P)).normalize()
      n.r.F.copy(tmp.d)
      n.r.tP.copy(n.r.P)
      n.r.tF.copy(n.r.F)
      n.r.alt = n.r.tAlt = n.hop ? Math.max(0, Math.sin(now * 2.4 + n.plot) - 0.78) * 4 : 0
    }
  }, [tmp])

  return { residents, bubbles, chat, status, count, say, sendMove, tick }
}

// ---------------------------------------------------------------------------------------------------------------------
// drawing everybody

const MAX = 400

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

const nameCache = new Map<string, THREE.CanvasTexture>()
function nameTexture(name: string) {
  let t = nameCache.get(name)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = 256; c.height = 64
  const g = c.getContext('2d')!
  g.font = '600 28px system-ui, sans-serif'
  const w = Math.min(244, g.measureText(name).width + 28)
  g.fillStyle = 'rgba(10,8,22,0.72)'
  roundRect(g, (256 - w) / 2, 10, w, 44, 18)
  g.fill()
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(name, 128, 33, 230)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (nameCache.size > 300) nameCache.clear()
  nameCache.set(name, t)
  return t
}

const bubbleCache = new Map<string, THREE.CanvasTexture>()
function bubbleTexture(text: string) {
  let t = bubbleCache.get(text)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = 512; c.height = 160
  const g = c.getContext('2d')!
  g.font = '500 30px system-ui, sans-serif'
  // wrap onto at most two lines
  const words = text.split(' ')
  const lines: string[] = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if (g.measureText((cur + ' ' + w).trim()).width > 420 && lines.length < 2) lines.push(w)
    else lines[lines.length - 1] = (cur + ' ' + w).trim()
  }
  const w = Math.min(480, Math.max(...lines.map((l) => g.measureText(l).width)) + 40)
  const h = lines.length * 38 + 28
  g.fillStyle = 'rgba(255,255,255,0.96)'
  roundRect(g, (512 - w) / 2, 8, w, h, 20)
  g.fill()
  g.fillStyle = '#16101f'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  lines.forEach((l, i) => g.fillText(l, 256, 8 + 14 + 19 + i * 38, 450))
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.userData.h = (h + 16) / 160
  if (bubbleCache.size > 120) bubbleCache.clear()
  bubbleCache.set(text, t)
  return t
}

type SelfState = { P: THREE.Vector3; F: THREE.Vector3; alt: number; mode: string }

export function Residents({ world, layout, self }: { world: WorldPeople; layout: SphereLayout; self: React.MutableRefObject<SelfState> }) {
  const { camera } = useThree()
  const R = layout.R
  // everyone is one of the four Cube World characters
  const chars = [
    useBaked(CUBE('Character_Male_1'), 1.85, Math.PI), useBaked(CUBE('Character_Female_1'), 1.85, Math.PI),
    useBaked(CUBE('Character_Male_2'), 1.85, Math.PI), useBaked(CUBE('Character_Female_2'), 1.85, Math.PI),
  ]
  const charMeshes = useRef<(THREE.InstancedMesh | null)[][]>([[], [], [], []])
  const blank = useMemo(() => new THREE.CanvasTexture(document.createElement('canvas')), [])
  const names = useMemo(() => Array.from({ length: 22 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: blank, transparent: true, depthWrite: false, fog: false }))
    s.visible = false
    s.raycast = () => {}
    return s
  }), [blank])
  const bubbles = useMemo(() => Array.from({ length: 10 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: blank, transparent: true, depthWrite: false, fog: false }))
    s.visible = false
    s.raycast = () => {}
    return s
  }), [blank])
  const t = useMemo(() => ({ m: new THREE.Matrix4(), right: new V(), zc: new V(), pos: new V(), up: new V() }), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    world.tick(dt)
    const k = 1 - Math.exp(-10 * dt)
    let n = 0
    const counts = [0, 0, 0, 0]
    const near: { r: Resident; d: number; pos: THREE.Vector3 }[] = []
    for (const r of world.residents.current.values()) {
      if (n >= MAX) break
      r.P.lerp(r.tP, k).normalize()
      r.F.lerp(r.tF, k)
      r.F.addScaledVector(r.P, -r.F.dot(r.P)).normalize()
      r.alt += (r.tAlt - r.alt) * k
      t.right.crossVectors(r.F, r.P).normalize()
      t.zc.copy(r.F).negate()
      t.m.makeBasis(t.right, r.P, t.zc)
      t.pos.copy(r.P).multiplyScalar(R + layout.ground(r.P) + r.alt)
      t.m.setPosition(t.pos)
      if (r.kind === undefined) r.kind = [...r.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 4
      const ti = r.kind
      if (chars[ti] && counts[ti] < MAX) {
        const idx = counts[ti]++
        for (const m of charMeshes.current[ti]) if (m) m.setMatrixAt(idx, t.m)
      }
      n++
      const d = t.pos.distanceTo(camera.position)
      if (d < 100) near.push({ r, d, pos: t.pos.clone() })
    }
    chars.forEach((_, ti) => {
      for (const m of charMeshes.current[ti]) if (m) { m.count = counts[ti]; m.instanceMatrix.needsUpdate = true }
    })

    near.sort((a, b) => a.d - b.d)
    names.forEach((s, i) => {
      const e = near[i]
      s.visible = !!e
      if (!e) return
      t.up.copy(e.r.P)
      s.position.copy(e.pos).addScaledVector(t.up, 2.55)
      const m = s.material as THREE.SpriteMaterial
      const tex = nameTexture(e.r.name)
      if (m.map !== tex) { m.map = tex; m.needsUpdate = true }
      s.scale.set(5.2, 1.3, 1)
    })

    // speech bubbles above whoever is talking (including you)
    const now = performance.now()
    let b = 0
    const place = (id: string, pos: THREE.Vector3, up: THREE.Vector3) => {
      const bub = world.bubbles.current.get(id)
      if (!bub || bub.until < now || b >= bubbles.length) return
      const s = bubbles[b++]
      const tex = bubbleTexture(bub.text)
      const m = s.material as THREE.SpriteMaterial
      if (m.map !== tex) { m.map = tex; m.needsUpdate = true }
      s.visible = true
      // the bubble is drawn at the top of its 512x160 canvas, so anchor the sprite at its top edge and lift it by the bubble's height
      const W = 5.4, sy = W * (160 / 512)
      s.center.set(0.5, 1)
      s.position.copy(pos).addScaledVector(up, 3.1 + (tex.userData.h as number) * sy)
      s.scale.set(W, sy, 1)
    }
    bubbles.forEach((s) => { s.visible = false })
    for (const e of near) place(e.r.id, e.pos, e.r.P)
    if (self.current.mode !== 'orbit') {
      t.pos.copy(self.current.P).multiplyScalar(R + layout.ground(self.current.P) + self.current.alt)
      place('me', t.pos, self.current.P)
    }
  })

  return (
    <group>
      {chars.map((b, ti) => b && b.parts.map((p, pi) => (
        <instancedMesh key={`c${ti}-${pi}`} ref={(el) => { charMeshes.current[ti][pi] = el }} args={[p.geometry, p.material, MAX]} frustumCulled={false} raycast={() => null} />
      )))}
      {names.map((s, i) => <primitive key={'n' + i} object={s} />)}
      {bubbles.map((s, i) => <primitive key={'b' + i} object={s} />)}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// world chat panel

export function WorldChat({ world, inputRef, name }: { world: WorldPeople; inputRef: React.RefObject<HTMLInputElement | null>; name: string }) {
  const [text, setText] = useState('')
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [world.chat])
  const label = world.status === 'live' ? 'online' : world.status === 'simulated' ? 'simulated' : 'connecting…'
  return (
    <div className="world-chat">
      <div className="wc-title">World chat <small>{label} · {world.count.toLocaleString()} here</small></div>
      <div className="wc-log" ref={log}>
        {world.chat.map((l) => (
          <div key={l.id} className={l.system ? 'wc-sys' : l.self ? 'wc-self' : ''}>
            {l.system ? l.text : <><b>{l.self ? name : l.name}</b> {l.text}</>}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); world.say(text); setText('') }}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="Say something to the world (T)"
          onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
        />
      </form>
    </div>
  )
}
