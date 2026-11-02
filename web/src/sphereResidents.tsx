import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Client, type Room } from 'colyseus.js'
import type { SphereLayout } from './sphereLayout'
import { useBaked } from './sphereModels'
import { colyseusUrl, BOTS } from './net'
import { mapStore } from './sphereMap'
import { getHome, homeCode } from './homePlanet'
import BlockyCharacter, { type CharacterMotion } from './BlockyCharacter'
import { parseLook, type Appearance } from './Rewards'

const V = THREE.Vector3
const Y = new V(0, 1, 0)

export type Resident = { look?: Appearance; kind?: number; id: string; name: string; color: THREE.Color; P: THREE.Vector3; F: THREE.Vector3; tP: THREE.Vector3; tF: THREE.Vector3; alt: number; tAlt: number }
export type ChatLine = { id: number; name: string; text: string; self?: boolean; system?: boolean }
export type Bubble = { text: string; until: number }
export type Status = 'connecting' | 'live' | 'simulated' | 'offline'

export type WorldPeople = {
  residents: React.MutableRefObject<Map<string, Resident>>
  bubbles: React.MutableRefObject<Map<string, Bubble>>
  chat: ChatLine[]
  status: Status
  count: number
  say: (text: string) => void
  direct: (id:string, text:string) => void
  invite: (id:string) => void
  emote: (kind: string, to?: string) => void
  muted: React.MutableRefObject<Set<string>>
  toggleMute: (id: string) => void
  hops: React.MutableRefObject<Map<string, number>>
  mutedCount: number
  sendMove: (P: THREE.Vector3, F: THREE.Vector3, alt: number) => void
  /** The closest real person within `meters` of you, if anyone. */
  nearest: (meters: number) => Resident | null
  tick: (dt: number) => void
}

const ADJ = ['Neon', 'Pixel', 'Cosmic', 'Turbo', 'Silent', 'Lucky', 'Cyber', 'Nova', 'Glitch', 'Hyper', 'Retro', 'Astro', 'Lunar', 'Vivid', 'Quantum']
const NOUN = ['Fox', 'Wolf', 'Panda', 'Raven', 'Byte', 'Comet', 'Ninja', 'Otter', 'Drone', 'Ghost', 'Moth', 'Kite', 'Pilot', 'Spark', 'Echo']
const LINES = [
  'this city is huge', 'who is watching {s}?', 'anyone going to {c}?', 'the skyline here is insane', 'gg', 'just got here, hi all',
  '{s} is live right now', 'looking for people to watch with', 'first time on the world, how do I fly?',
  'meet at the {c} district?', 'W stream', 'lol', 'this place never sleeps', 'who wants to raid someone?', 'good vibes in here',
]

export const EMOTES: { kind: string; icon: string; label: string }[] = [
  { kind: 'wave', icon: '👋', label: 'Wave' },
  { kind: 'laugh', icon: '😂', label: 'Laugh' },
  { kind: 'heart', icon: '❤️', label: 'Love' },
  { kind: 'cheer', icon: '🎉', label: 'Cheer' },
  { kind: 'like', icon: '👍', label: 'Like' },
  { kind: 'dance', icon: '💃', label: 'Dance' },
]
const iconOf = (kind: string) => EMOTES.find((e) => e.kind === kind)?.icon ?? '👋'

let uid = 0
const nextId = () => ++uid

/**
 * Everyone else on the planet. Connects to the server's `world` room (see CONTRACT.md); when the server is not there,
 * simulated residents fill the streets around the busiest buildings so the world is never empty.
 */
/** A random id kept in this browser, so opening the world in two tabs does not look like two people. */
const browserId = () => {
  try {
    let id = localStorage.getItem('watchworld:uid')
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('watchworld:uid', id) }
    return id
  } catch { return '' }
}

export function useWorldPeople(layout: SphereLayout | null, myName: string, planet = 'main', enabled = false, look = ''): WorldPeople {
  const lookRef = useRef(look)
  lookRef.current = look
  const me = useRef(new V(0, 1, 0))
  const residents = useRef(new Map<string, Resident>())
  const bubbles = useRef(new Map<string, Bubble>())
  const [chat, setChat] = useState<ChatLine[]>([])
  const [status, setStatus] = useState<Status>('connecting')
  const [count, setCount] = useState(1)
  const roomRef = useRef<Room | null>(null)
  const muted = useRef(new Set<string>())
  const hops = useRef(new Map<string, number>())
  const [mutedCount, setMutedCount] = useState(0)
  const [directMessages, setDirectMessages] = useState<{from:string;text:string}[]>([])
  const lastEmoteAt = useRef(0)
  const lastSend = useRef(0)
  const sim = useRef<null | { npcs: { r: Resident; plot: number; r0: number; ang: number; sign: number; speed: number; hop: number }[]; timer?: ReturnType<typeof setInterval> }>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const push = useCallback((l: Omit<ChatLine, 'id'>) => setChat((c) => [...c.slice(-90), { ...l, id: nextId() }]), [])
  const say0 = useCallback((id: string, name: string, text: string) => {
    if (muted.current.has(id)) return
    bubbles.current.set(id, { text: text.slice(0, 90), until: performance.now() + 6500 })
    push({ name, text })
  }, [push])

  const stopSim = useCallback(() => {
    if (!sim.current) return
    if (sim.current.timer) clearInterval(sim.current.timer)
    sim.current = null
    for (const id of [...residents.current.keys()]) if (id.startsWith('npc')) residents.current.delete(id)
  }, [])

  const startSim = useCallback(() => {
    const L = layoutRef.current
    if (!BOTS || !L) { setStatus('offline'); return }
    if (sim.current) return
    if (!L.plots.length) {
      // Empty genre planets have no building to gather simulated residents around.
      // Keep the world usable and avoid indexing into a missing plot.
      sim.current = { npcs: [] }
      setStatus('simulated')
      setCount(1)
      push({ name: '', text: 'No live streams here yet. Try another planet.', system: true })
      return
    }
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
    setChat([])
    setStatus('connecting')
    setCount(1)
    bubbles.current.clear()
    if (!layout && !enabled) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const client = new Client(colyseusUrl())
    const connect = () => {
      client.joinOrCreate('world', { name: myName, shard: planet, uid: browserId(), look: lookRef.current }).then((room) => {
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
            // another tab of this same browser is still you, not a second person
            if (id === room.sessionId || (p.uid && p.uid === browserId())) return
            seen.add(id)
            let r = residents.current.get(id)
            if (!r) {
              r = { id, name: p.name, color: new THREE.Color(p.color || '#ffffff'), P: new V(p.px, p.py, p.pz), F: new V(p.fx, p.fy, p.fz), tP: new V(), tF: new V(), alt: 0, tAlt: 0 }
              residents.current.set(id, r)
            }
            r.name = p.name
            r.look = parseLook(p.look)
            r.tP.set(p.px, p.py, p.pz)
            r.tF.set(p.fx, p.fy, p.fz)
            r.tAlt = p.alt ?? 0
          })
          for (const id of [...residents.current.keys()]) if (!seen.has(id)) residents.current.delete(id)
          setCount(seen.size + 1)
        }
        room.onStateChange(sync)
        sync()
        room.onMessage('chat', (m: { id?: string; name: string; text: string }) => say0(m.id === room.sessionId ? 'me' : m.id ?? '', m.name, m.text))
        room.onMessage('emote', (m: { id: string; name: string; kind: string; to?: string }) => {
          const who = m.id === room.sessionId ? 'me' : m.id
          if (muted.current.has(m.id)) return
          bubbles.current.set(who, { text: iconOf(m.kind), until: performance.now() + 3200 })
          hops.current.set(who, performance.now() + (m.kind === 'dance' ? 3000 : 1300))
          if (m.to === room.sessionId && m.id !== room.sessionId) push({ name: '', text: `${m.name} ${m.kind === 'wave' ? 'waved at you' : 'sent you ' + iconOf(m.kind)}`, system: true })
        })
        room.onMessage('system', (m: { text: string }) => push({ name: '', text: m.text, system: true }))
        room.onMessage('direct',(m:{from:string;text:string})=>{setDirectMessages(items=>[...items.slice(-20),m]);push({name:'',text:`Private message from ${m.from}: ${m.text}`,system:true})})
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
  }, [layout, enabled, myName, planet, startSim, stopSim, say0, push])

  const say = useCallback((text: string) => {
    const t = text.trim().slice(0, 200)
    if (!t) return
    if (roomRef.current) { roomRef.current.send('chat', { text: t }); return }
    bubbles.current.set('me', { text: t.slice(0, 90), until: performance.now() + 6500 })
    push({ name: myName, text: t, self: true })
    // a simulated resident answers now and then
    if (sim.current?.npcs.length && Math.random() < 0.6) {
      const n = sim.current.npcs[Math.floor(Math.random() * sim.current.npcs.length)]
      const replies = ['welcome!', 'hey!', 'lol same', 'nice, add me', 'o/', 'where are you? I will come over', 'good to see new people']
      setTimeout(() => say0(n.r.id, n.r.name, replies[Math.floor(Math.random() * replies.length)]), 1400 + Math.random() * 1800)
    }
  }, [myName, push, say0])
  const direct=useCallback((id:string,text:string)=>{const clean=text.trim().slice(0,280);if(clean&&roomRef.current)roomRef.current.send('direct',{targetId:id,text:clean});else if(clean)push({name:'',text:'Private messages need an online world connection.',system:true})},[push])
  const invite=useCallback((id:string)=>{const home=getHome();if(home&&roomRef.current)roomRef.current.send('planet_invite',{targetId:id,code:homeCode(home)});else push({name:'',text:'Create your planet and connect online before inviting people.',system:true})},[push])

  const emote = useCallback((kind: string, to?: string) => {
    const now = performance.now()
    if (now - lastEmoteAt.current < 700) return
    lastEmoteAt.current = now
    if (roomRef.current) { roomRef.current.send('emote', { kind, to }); return }
    // offline: it still plays for you, and a simulated resident waves back
    bubbles.current.set('me', { text: iconOf(kind), until: now + 3200 })
    hops.current.set('me', now + (kind === 'dance' ? 3000 : 1300))
    if (sim.current && kind === 'wave' && Math.random() < 0.7) {
      const n = sim.current.npcs[Math.floor(Math.random() * sim.current.npcs.length)]
      setTimeout(() => { bubbles.current.set(n.r.id, { text: '👋', until: performance.now() + 3200 }); hops.current.set(n.r.id, performance.now() + 1300) }, 900)
    }
  }, [])
  const toggleMute = useCallback((id: string) => {
    if (muted.current.has(id)) muted.current.delete(id)
    else muted.current.add(id)
    setMutedCount(muted.current.size)
  }, [])

  const sendMove = useCallback((P: THREE.Vector3, F: THREE.Vector3, alt: number) => {
    me.current.copy(P)
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

  // equipping something while you are standing in the world tells everyone straight away
  useEffect(() => { roomRef.current?.send('look', look) }, [look])
  const nearest = useCallback((meters: number) => {
    // on a planet distances are angles times the radius; the island is flat, encoded as directions over 1000 m
    const scale = layoutRef.current?.R ?? 1000
    let best: Resident | null = null, bd = meters
    for (const r of residents.current.values()) {
      if (r.id.startsWith('npc') || muted.current.has(r.id)) continue
      const d = me.current.angleTo(r.tP) * scale
      if (d < bd) { bd = d; best = r }
    }
    return best
  }, [])
  return { residents, bubbles, chat, status, count, say, direct, invite, emote, muted, toggleMute, hops, mutedCount, sendMove, nearest, tick }
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
export function nameTexture(name: string) {
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
export function bubbleTexture(text: string) {
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

/** People near you who sent their outfit are drawn one by one with their own clothes; everyone else is a cheap instanced stand-in. */
const drawnApart = new Set<string>()

function PlanetPlayers({ world, layout }: { world: WorldPeople; layout: SphereLayout }) {
  const { camera } = useThree()
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    const tick = () => {
      const R = layout.R, here = camera.position.clone().normalize()
      const near = [...world.residents.current.values()]
        .filter((r) => r.look && !r.id.startsWith('npc') && !world.muted.current.has(r.id))
        .map((r) => ({ r, d: here.angleTo(r.P) * R }))
        .filter((x) => x.d < 160 + Math.max(0, camera.position.length() - R) * 0.5)
        .sort((a, b) => a.d - b.d)
        .slice(0, 10)
      const next = near.map((x) => x.r.id)
      drawnApart.clear()
      next.forEach((id) => drawnApart.add(id))
      setIds((old) => (old.length === next.length && old.every((x, i) => x === next[i]) ? old : next))
    }
    tick()
    const t = setInterval(tick, 500)
    return () => { clearInterval(t); drawnApart.clear() }
  }, [world, layout, camera])
  return <>{ids.map((id) => { const r = world.residents.current.get(id); return r ? <PlanetPlayer key={id} r={r} world={world} layout={layout} /> : null })}</>
}

function PlanetPlayer({ r, world, layout }: { r: Resident; world: WorldPeople; layout: SphereLayout }) {
  const group = useRef<THREE.Group>(null)
  const motion = useRef<CharacterMotion>({ alt: 0, vel: new V() })
  const t = useMemo(() => ({ m: new THREE.Matrix4(), right: new V(), zc: new V(), pos: new V(), last: new V() }), [])
  useFrame((_, dtRaw) => {
    const g = group.current
    if (!g) return
    const dt = Math.max(1e-3, Math.min(dtRaw, 0.1))
    t.right.crossVectors(r.F, r.P).normalize()
    t.zc.copy(r.F).negate()
    t.m.makeBasis(t.right, r.P, t.zc)
    g.quaternion.setFromRotationMatrix(t.m)
    const hopUntil = world.hops.current.get(r.id) ?? 0
    const hop = hopUntil > performance.now() ? Math.abs(Math.sin(performance.now() / 160)) * 0.9 : 0
    t.pos.copy(r.P).multiplyScalar(layout.R + layout.ground(r.P) + r.alt + hop)
    g.position.copy(t.pos)
    motion.current.alt = r.alt + hop
    motion.current.vel.copy(t.pos).sub(t.last).divideScalar(dt)
    if (motion.current.vel.length() > 40) motion.current.vel.set(0, 0, 0)
    t.last.copy(t.pos)
  })
  return <group ref={group}><BlockyCharacter motion={motion} appearance={r.look} /></group>
}

export function Residents({ world, layout, self }: { world: WorldPeople; layout: SphereLayout; self: React.MutableRefObject<SelfState> }) {
  const { camera } = useThree()
  const R = layout.R
  // grown men and women from Kenney's blocky pack (no robots, dummies or children)
  const chars = [
    ...'abcefijkmnpq'.split('').map((l) => useBaked(`/models/blocky/character-${l}.glb`, 1.8, Math.PI)), // eslint-disable-line react-hooks/rules-of-hooks
  ]
  const charMeshes = useRef<(THREE.InstancedMesh | null)[][]>(Array.from({ length: 12 }, () => []))
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
    const counts = new Array(chars.length).fill(0)
    const near: { r: Resident; d: number; pos: THREE.Vector3 }[] = []
    for (const r of world.residents.current.values()) {
      if (n >= MAX) break
      if (world.muted.current.has(r.id)) continue
      r.P.lerp(r.tP, k).normalize()
      r.F.lerp(r.tF, k)
      r.F.addScaledVector(r.P, -r.F.dot(r.P)).normalize()
      r.alt += (r.tAlt - r.alt) * k
      t.right.crossVectors(r.F, r.P).normalize()
      t.zc.copy(r.F).negate()
      t.m.makeBasis(t.right, r.P, t.zc)
      const hopUntil = world.hops.current.get(r.id) ?? 0
      const hop = hopUntil > performance.now() ? Math.abs(Math.sin(performance.now() / 160)) * 0.9 : 0
      t.pos.copy(r.P).multiplyScalar(R + layout.ground(r.P) + r.alt + hop)
      t.m.setPosition(t.pos)
      if (r.kind === undefined) r.kind = [...r.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % chars.length
      const ti = r.kind
      if (chars[ti] && counts[ti] < MAX && !drawnApart.has(r.id)) {
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
      <PlanetPlayers world={world} layout={layout} />
      {names.map((s, i) => <primitive key={'n' + i} object={s} />)}
      {bubbles.map((s, i) => <primitive key={'b' + i} object={s} />)}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// world chat panel

export function WorldChat({ world, inputRef, name }: { world: WorldPeople; inputRef: React.RefObject<HTMLInputElement | null>; name: string }) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState<'chat' | 'people'>('chat')
  const [, tick] = useState(0)
  // Q: talk to the person standing closest to you
  const [focus, setFocus] = useState<string | null>(null)
  const [dm, setDm] = useState('')
  const [nobody, setNobody] = useState(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault()
        if (focus) { setFocus(null); return }
        const r = world.nearest(14)
        if (!r) { setNobody(true); window.setTimeout(() => setNobody(false), 2400); return }
        document.exitPointerLock?.() // so the cursor is free to type and click
        setFocus(r.id); setDm('')
      } else if (e.key === 'Escape' && focus) setFocus(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [world, focus])
  const person = focus ? world.residents.current.get(focus) : undefined
  useEffect(() => { if (focus && !person) setFocus(null) }, [focus, person, world.count])
  const addFriend = (r: Resident) => { try { const k = 'watchworld.friends'; const prior = JSON.parse(localStorage.getItem(k) ?? '[]'); localStorage.setItem(k, JSON.stringify([...new Map([...prior, { id: r.id, name: r.name }].map((x: { id: string }) => [x.id, x])).values()])) } catch { /* private mode */ } }
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [world.chat, tab])
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 700); return () => clearInterval(t) }, [])
  // 1 to 6 are the emotes
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < EMOTES.length) world.emote(EMOTES[i].kind)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [world])
  const label = world.status === 'live' ? 'online' : world.status === 'simulated' ? 'simulated' : world.status === 'offline' ? 'reconnecting…' : 'connecting…'
  const onIsland = !mapStore.layout // the island is flat, so there is no planet to measure distances on
  const me = mapStore.player.dir, R = mapStore.layout?.R ?? 1
  const people = [...world.residents.current.values()]
    .map((r) => ({ r, d: me.angleTo(r.tP) * R }))
    .sort((a, b) => a.d - b.d)
  const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)
  return (
    <div className="world-chat">
      {nobody && createPortal(<div className="interact-hint">Nobody close enough. Walk up to someone and press Q.</div>, document.body)}
      {person && createPortal(
        <div className="interact-card" role="dialog" aria-label={`Talk to ${person.name}`}>
          <div className="ic-head"><i style={{ background: `#${person.color.getHexString()}` }} /><b>{person.name}</b><small>press Q or Esc to close</small><button onClick={() => setFocus(null)} aria-label="Close">×</button></div>
          <div className="ic-emotes">{EMOTES.map((e) => <button key={e.kind} title={e.label} onClick={() => world.emote(e.kind, person.id)}>{e.icon}</button>)}</div>
          <form onSubmit={(e) => { e.preventDefault(); if (dm.trim()) { world.direct(person.id, dm.trim()); setDm('') } }}>
            <input value={dm} onChange={(e) => setDm(e.target.value)} maxLength={280} placeholder={`Private message to ${person.name}`} autoFocus onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setFocus(null) }} />
            <button type="submit">Send</button>
          </form>
          <div className="ic-actions">
            <button onClick={() => world.invite(person.id)}>Invite to my planet</button>
            <button onClick={() => addFriend(person)}>Add friend</button>
            <button onClick={() => { world.toggleMute(person.id); setFocus(null) }}>Mute</button>
          </div>
        </div>, document.body)}
      <div className="wc-title">
        <span className="wc-tabs">
          <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
          <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>People · {world.count.toLocaleString()}</button>
        </span>
        <small>{label}</small>
      </div>
      {tab === 'chat' ? (
        <div className="wc-log" ref={log}>
          {world.chat.map((l) => (
            <div key={l.id} className={l.system ? 'wc-sys' : l.self ? 'wc-self' : ''}>
              {l.system ? l.text : <><b>{l.self ? name : l.name}</b> {l.text}</>}
            </div>
          ))}
        </div>
      ) : (
        <div className="wc-log wc-people">
          {people.length === 0 && <div className="wc-sys">Nobody else is on this planet yet. Send a friend your invite link.</div>}
          {people.slice(0, 60).map(({ r, d }) => {
            const muted = world.muted.current.has(r.id)
            return (
              <div key={r.id} className={`wc-person ${muted ? 'muted' : ''}`}>
                <i style={{ background: `#${r.color.getHexString()}` }} />
                <span><b>{r.name}</b>{!onIsland && <small>{dist(d)} away</small>}</span>
                <button title="Wave at them" onClick={() => world.emote('wave', r.id)} disabled={muted}>👋</button>
                <button title="Private message" onClick={() => { const text=window.prompt(`Message ${r.name}`); if(text)world.direct(r.id,text) }}>Message</button>
                <button title="Invite to your planet" onClick={() => world.invite(r.id)}>Invite</button>
                <button title="Add friend" onClick={() => { try { const key='watchworld.friends';const prior=JSON.parse(localStorage.getItem(key)??'[]');localStorage.setItem(key,JSON.stringify([...new Map([...prior,{id:r.id,name:r.name}].map((x:{id:string})=>[x.id,x])).values()])); } catch {} }}>Add friend</button>
                <button title="Fly to them" onClick={() => window.dispatchEvent(onIsland ? new CustomEvent('island:goto', { detail: [(r.tP.x / Math.max(1e-3, r.tP.y)) * 1000, (r.tP.z / Math.max(1e-3, r.tP.y)) * 1000] }) : new CustomEvent('watchsphere:travel', { detail: [r.tP.x, r.tP.y, r.tP.z] }))}>Fly</button>
                <button title={muted ? 'Unmute' : 'Mute: hide their messages and avatar'} onClick={() => world.toggleMute(r.id)}>{muted ? 'Unmute' : 'Mute'}</button>
              </div>
            )
          })}
        </div>
      )}
      <div className="wc-emotes" title="Press Q near someone to talk to them">
        {EMOTES.map((e, i) => <button key={e.kind} title={`${e.label} (${i + 1})`} onClick={() => world.emote(e.kind)}>{e.icon}</button>)}
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
