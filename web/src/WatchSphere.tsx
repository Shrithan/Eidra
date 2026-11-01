import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import './sphere.css'
import { fetchStreams, type Stream } from './api'
import { GROUPS, TIERS, frontDir, groupIndex, layoutSystem, type PlanetData, type SphereLayout } from './sphereLayout'
import { SystemScene } from './sphereSystem'
import { buildRoadNet } from './sphereCity'
import { Atmosphere, Clouds, Houses, Planes, Props, Railways, Roads, SkyDome, Traffic, Water, Waterfalls, hashStr, makeGroundMaterial } from './sphereVisuals'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { CUBE, loadGLTF } from './sphereModels'
import { Animals, Nature } from './sphereNature'
import { Residents, WorldChat, useWorldPeople, type WorldPeople } from './sphereResidents'

const MAX_STREAMS = 5000
const WALK_SPEED = 7 // m/s
const RUN_SPEED = 22
const GRAVITY = 24
const JUMP_SPEED = 7.6
const ENTER_RADIUS = 26 // how close to a building before you can walk in
const V = THREE.Vector3
const Y = new V(0, 1, 0)

type Mode = 'orbit' | 'travel' | 'walk'

type Props = {
  selected: Stream | null
  onSelect: (s: Stream) => void
  onEnter: (s: Stream) => void
  name?: string
}

/** Where we are: looking at the whole solar system, or standing on one genre planet. */
type View =
  | { kind: 'system'; from: number | null; fly: number | null }
  | { kind: 'planet'; index: number; entry: THREE.Vector3 | null }

/**
 * All of Twitch as a solar system: every genre is its own planet, every game a country on it, every stream a building.
 * Click a planet to fly down to it, or pick any stream in the list and we take you to its planet.
 */
export default function WatchSphere({ selected, onSelect, onEnter, name }: Props) {
  const [guest] = useState(() => `Guest${Math.floor(Math.random() * 900 + 100)}`)
  const myName = name || guest
  const chatInput = useRef<HTMLInputElement>(null)
  const [planets, setPlanets] = useState<PlanetData[] | null>(null)
  const [view, setView] = useState<View>({ kind: 'system', from: null, fly: null })
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('orbit')
  const [nearIdx, setNearIdx] = useState(-1)
  const [missing, setMissing] = useState(false)
  const [warp, setWarp] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    ;(async () => {
      const all: Stream[] = []
      const seen = new Set<string>()
      let offset = 0
      // the server pages its answers (busiest first); keep asking until we have enough
      for (let page = 0; page < 8 && all.length < MAX_STREAMS; page++) {
        const r = await fetchStreams({ planet: 'all', limit: 2000, offset }, ctl.signal)
        for (const s of r.streams) if (!seen.has(s.login)) { seen.add(s.login); all.push(s) }
        offset += r.streams.length
        if (!r.hasMore || !r.streams.length) break
      }
      if (ctl.signal.aborted) return
      setPlanets(layoutSystem(all.slice(0, MAX_STREAMS)))
    })().catch((e) => { if (!ctl.signal.aborted) setError(String(e?.message ?? e)) })
    return () => ctl.abort()
  }, [])

  useEffect(() => { setMissing(false) }, [selected?.login])

  const layout = planets && view.kind === 'planet' ? planets[view.index].layout : null
  const people = useWorldPeople(layout, myName, view.kind === 'planet' ? planets?.[view.index].theme.id : undefined)

  // picking a stream anywhere takes you to the planet it lives on
  const viewRef = useRef(view)
  viewRef.current = view
  useEffect(() => {
    if (!selected || !planets) return
    const pi = groupIndex(selected.game)
    const v = viewRef.current
    if (v.kind === 'system') setView({ kind: 'system', from: null, fly: pi })
    else if (v.index !== pi) {
      setWarp(planets[pi].theme.name)
      setView({ kind: 'planet', index: pi, entry: null })
      setTimeout(() => setWarp(null), 900)
    }
  }, [selected?.login, planets])

  const goPlanet = (i: number) => {
    if (!planets) return
    if (view.kind === 'system') setView({ kind: 'system', from: null, fly: i })
    else if (view.index !== i) {
      setWarp(planets[i].theme.name)
      setView({ kind: 'planet', index: i, entry: null })
      setTimeout(() => setWarp(null), 900)
    }
  }
  useEffect(() => {
    const toSystem = () => setView((v) => (v.kind === 'planet' ? { kind: 'system', from: v.index, fly: null } : v))
    window.addEventListener('watchsphere:system', toSystem)
    return () => window.removeEventListener('watchsphere:system', toSystem)
  }, [])
  useEffect(() => {
    // T opens the world chat from anywhere
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key.toLowerCase() === 't') { e.preventDefault(); chatInput.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const near = layout && nearIdx >= 0 ? layout.plots[nearIdx] : null
  const here = planets && view.kind === 'planet' ? planets[view.index] : null
  return (
    <div className="sphere">
      {planets ? (
        <Canvas camera={{ fov: 50, near: 20, far: 700000, position: [0, 24000, 40000] }} dpr={[1, 2]}>
          {view.kind === 'system' ? (
            <SystemScene
              planets={planets}
              from={view.from}
              fly={view.fly}
              onPick={(i) => setView({ kind: 'system', from: null, fly: i })}
              onLand={(i, entry) => setView({ kind: 'planet', index: i, entry })}
            />
          ) : (
            <Scene
              key={view.index}
              layout={planets[view.index].layout}
              entry={view.entry}
              selected={selected}
              onSelect={onSelect}
              onEnter={onEnter}
              onMode={setMode}
              onNear={setNearIdx}
              onMissing={() => setMissing(true)}
              people={people}
            />
          )}
        </Canvas>
      ) : (
        <div className="sphere-loading">{error ? `Could not load streams: ${error}` : 'Building the solar system…'}</div>
      )}

      {planets && (
        <>
          <div className="sphere-hud">
            {view.kind === 'system' && <span><b>Drag</b> to look around the system · <b>scroll</b> to zoom · <b>click a planet</b> to fly there</span>}
            {view.kind === 'planet' && mode === 'orbit' && <span><b>{here?.theme.name}</b> · drag to spin · scroll to zoom · click a building or pick a stream to fly down</span>}
            {view.kind === 'planet' && mode === 'travel' && <span>Flying…</span>}
            {view.kind === 'planet' && mode === 'walk' && (
              <span><b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>drag</b> to look · <b>O</b> back to orbit</span>
            )}
            {view.kind === 'planet' && mode !== 'orbit' && <button onClick={() => window.dispatchEvent(new Event('watchsphere:orbit'))}>Back to orbit</button>}
            {view.kind === 'planet' && <button className="alt" onClick={() => window.dispatchEvent(new Event('watchsphere:system'))}>Solar system</button>}
          </div>
          {near && view.kind === 'planet' && mode === 'walk' && (
            <div className="sphere-near">
              <b>{near.stream.displayName}</b>
              <span>{near.category} · {near.stream.viewers.toLocaleString()} watching</span>
              <span className="tier">Tier {near.tier + 1} · {TIERS[near.tier].name}</span>
              <em>Press E to go in</em>
            </div>
          )}
          {view.kind === 'planet' && <WorldChat world={people} inputRef={chatInput} name={myName} />}
          {missing && <div className="sphere-note">That stream is not among the {MAX_STREAMS.toLocaleString()} busiest, so it has no building yet.</div>}
          {warp && <div className="sphere-warp">Travelling to {warp}…</div>}
          <div className="sphere-tiers">
            <div className="sphere-legend-title">Buildings by viewers</div>
            {TIERS.slice().reverse().map((t, k, arr) => (
              <div key={t.id}>
                <b>{t.name}</b>
                <span>{t.min >= 1000 ? `${t.min.toLocaleString()}+` : k === 0 ? `${t.min}+` : `${t.min}–${(arr[k - 1].min - 1).toLocaleString()}`}</span>
                <small>{planets.reduce((n, p) => n + p.layout.plots.filter((pl) => pl.tier === TIERS.indexOf(t)).length, 0).toLocaleString()}</small>
              </div>
            ))}
          </div>
          <div className="sphere-legend">
            <div className="sphere-legend-title">Planets · {planets.reduce((n, p) => n + p.layout.plots.length, 0).toLocaleString()} live streams</div>
            {planets.map((p, i) => (
              <button key={p.theme.id} className={here?.index === i ? 'on' : ''} onClick={() => goPlanet(i)}>
                <i style={{ background: p.theme.color }} />{p.theme.name}<small>{p.layout.plots.length.toLocaleString()}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// spatial grid: which buildings are close to a point

class Grid {
  private cells = new Map<number, number[]>()
  constructor(private size: number) {}
  private key(ix: number, iy: number, iz: number) { return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512) }
  add(i: number, p: THREE.Vector3) {
    const k = this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size), Math.floor(p.z / this.size))
    const l = this.cells.get(k)
    if (l) l.push(i); else this.cells.set(k, [i])
  }
  near(p: THREE.Vector3, fn: (i: number) => void) {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size), cz = Math.floor(p.z / this.size)
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      const l = this.cells.get(this.key(x, y, z))
      if (l) for (const i of l) fn(i)
    }
  }
}

function useGrid(layout: SphereLayout) {
  return useMemo(() => {
    const g = new Grid(layout.spacing * 1.4)
    const p = new V()
    layout.plots.forEach((pl, i) => g.add(i, p.copy(pl.dir).multiplyScalar(layout.R)))
    return g
  }, [layout])
}

// ---------------------------------------------------------------------------------------------------------------------
// the planet, buildings, labels

function Planet({ layout, grid }: { layout: SphereLayout; grid: Grid }) {
  const material = useMemo(() => makeGroundMaterial(), [])
  const geometry = useMemo(() => {
    const R = layout.R, T = layout.terrain
    // build on shared vertices so each point of land is evaluated once, then split into flat-shaded facets
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(R, 64)
    geo.deleteAttribute('normal')
    geo.deleteAttribute('uv')
    geo = mergeVertices(geo, 1e-3)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const d = new V(), pw = new V()
    const c = new THREE.Color(), nat = new THREE.Color(), tint = new THREE.Color(), cityGround = new THREE.Color()
    const grass = new THREE.Color(layout.theme.palette.grassA)
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize()
      const e = T.elevation(d)
      pos.setXYZ(i, d.x * (R + e), d.y * (R + e), d.z * (R + e))
      T.color(d, e, nat)
      const mask = e < 0 ? 0 : T.cityMask(d)
      if (mask > 0.01) {
        // city ground: grass tinted by the nearest building's genre, a little different per game, so the continents show
        pw.copy(d).multiplyScalar(R)
        let best = -1, bestD = Infinity
        grid.near(pw, (idx) => {
          const dist = layout.plots[idx].dir.distanceToSquared(d)
          if (dist < bestD) { bestD = dist; best = idx }
        })
        if (best >= 0) {
          const p = layout.plots[best]
          const hh = hashStr(p.category)
          cityGround.copy(grass).lerp(tint.set(layout.theme.houses[hh % layout.theme.houses.length]), 0.3).multiplyScalar(0.92 + ((hh >> 4) % 100) / 700)
          nat.lerp(cityGround, mask)
        } else nat.lerp(grass, mask)
      }
      c.copy(nat)
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const flat = geo.toNonIndexed()
    flat.computeVertexNormals() // one normal per triangle: the low-poly, faceted look
    return flat
  }, [layout, grid])
  return (
    <mesh geometry={geometry}>
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function labelTexture(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '700 64px system-ui, sans-serif'
  g.lineWidth = 10
  g.strokeStyle = 'rgba(8,6,16,0.85)'
  g.strokeText(text, 256, 64, 500)
  g.fillStyle = color
  g.fillText(text, 256, 64, 500)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Continent and country names floating over their land. Country names fade in as you get close. */
function Labels({ layout }: { layout: SphereLayout }) {
  const { camera } = useThree()
  const items = useMemo(() => {
    const out: { text: string; color: string; pos: THREE.Vector3; w: number; kind: 'group' | 'cat' }[] = []
    for (const g of layout.groups) out.push({ text: GROUPS[g.group].name, color: '#ffffff', pos: g.centroid.clone().multiplyScalar(layout.R + 330), w: layout.R * 0.55, kind: 'group' })
    for (const c of layout.categories.slice(0, 40)) {
      if (c.count < 3) continue
      out.push({ text: c.category ?? '', color: GROUPS[c.group].color, pos: c.centroid.clone().multiplyScalar(layout.R + 150), w: layout.R * 0.2, kind: 'cat' })
    }
    return out.map((o) => ({ ...o, texture: labelTexture(o.text, o.color) }))
  }, [layout])
  const refs = useRef<(THREE.Sprite | null)[]>([])
  useFrame(() => {
    items.forEach((it, i) => {
      const s = refs.current[i]
      if (!s) return
      const d = camera.position.distanceTo(it.pos)
      const mat = s.material as THREE.SpriteMaterial
      mat.opacity = it.kind === 'group' ? THREE.MathUtils.clamp((d - layout.R * 0.5) / (layout.R * 0.6), 0, 1) : THREE.MathUtils.clamp(1 - (d - layout.R * 0.35) / (layout.R * 0.9), 0, 1)
    })
  })
  return (
    <group>
      {items.map((it, i) => (
        <sprite key={i} ref={(el) => { refs.current[i] = el }} position={it.pos} scale={[it.w, it.w / 4, 1]}>
          <spriteMaterial map={it.texture} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

function Stars({ R }: { R: number }) {
  const positions = useMemo(() => {
    const a = new Float32Array(3000 * 3)
    for (let i = 0; i < 3000; i++) {
      const v = new V(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(R * 12)
      a.set([v.x, v.y, v.z], i * 3)
    }
    return a
  }, [R])
  return (
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#ffffff" size={1.8} sizeAttenuation={false} fog={false} />
    </points>
  )
}

function Beacon({ layout, idx }: { layout: SphereLayout; idx: number }) {
  const p = layout.plots[idx]
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(Y, p.dir), [p])
  return (
    <mesh position={p.dir.clone().multiplyScalar(layout.R + 220)} quaternion={q}>
      <cylinderGeometry args={[2.2, 4.5, 440, 12, 1, true]} />
      <meshBasicMaterial color={[1.4, 0.55, 3]} toneMapped={false} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// the player

type Travel = { t0: number; dur: number; P0: THREE.Vector3; F0: THREE.Vector3; alt0: number; P1: THREE.Vector3; F1: THREE.Vector3 }

function Scene({ layout, entry, selected, onSelect, onEnter, onMode, onNear, onMissing, people }: {
  layout: SphereLayout
  entry: THREE.Vector3 | null
  selected: Stream | null
  onSelect: (s: Stream) => void
  onEnter: (s: Stream) => void
  onMode: (m: Mode) => void
  onNear: (i: number) => void
  onMissing: () => void
  people: WorldPeople
}) {
  const { camera, gl, scene } = useThree()
  const skyUp = useRef(new V(0, 1, 0))
  const space = useRef(1)
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const stars = useRef<THREE.Group>(null)
  const net = useMemo(() => (layout.plots.length > 3 ? buildRoadNet(layout) : { verts: [], edges: [], adj: [], cells: [], valid: [] }), [layout])
  const R = layout.R
  const grid = useGrid(layout)
  const [selIdx, setSelIdx] = useState(-1)

  const S = useRef({
    mode: 'orbit' as Mode,
    P: new V(0, 1, 0), F: new V(0, 0, -1), vel: new V(), alt: 0, vy: 0, pitch: -0.25,
    oy: 0.6, op: 0.4, od: R * 2.6,
    keys: {} as Record<string, boolean>, jumpBuf: 0, coyote: 0, phase: 0, walk: 0,
    travel: null as Travel | null, nearIdx: -1, nearAt: 0, locked: false,
  })
  const callbacks = useRef({ onSelect, onEnter, onMode, onNear })
  callbacks.current = { onSelect, onEnter, onMode, onNear }
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.near = 0.3; cam.far = R * 22; cam.fov = 60
    cam.up.set(0, 1, 0)
    cam.updateProjectionMatrix()
    const s = S.current
    const dir = entry ?? new V(0.3, 0.5, 1).normalize()
    s.oy = Math.atan2(dir.x, dir.z)
    s.op = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
    camera.position.copy(dir).multiplyScalar(R * 2.6)
    camera.lookAt(0, 0, 0)
    callbacks.current.onMode('orbit')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const avatar = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)

  const setMode = (m: Mode) => {
    if (S.current.mode === m) return
    S.current.mode = m
    callbacks.current.onMode(m)
  }

  // temporaries, to avoid allocating every frame
  const t = useMemo(() => ({ a: new V(), b: new V(), c: new V(), right: new V(), want: new V(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4(), pw: new V(), cam: new V(), head: new V() }), [])

  const startTravel = (idx: number) => {
    const s = S.current
    const plot = layout.plots[idx]
    let P0: THREE.Vector3, F0: THREE.Vector3, alt0: number
    if (s.mode === 'orbit') {
      P0 = camera.position.clone().normalize()
      alt0 = camera.position.length() - (R + layout.ground(P0))
      F0 = new V().crossVectors(Y, P0)
      if (F0.lengthSq() < 1e-4) F0.set(1, 0, 0)
      F0.normalize()
    } else {
      P0 = s.P.clone(); F0 = s.F.clone(); alt0 = s.alt
    }
    // land on the pavement right in front of the door, looking at it
    const door = frontDir(plot)
    const P1 = plot.dir.clone().multiplyScalar(R).addScaledVector(door, plot.footprint / 2 + 9).normalize()
    const F1 = door.clone().negate()
    F1.addScaledVector(P1, -F1.dot(P1)).normalize()
    const angle = Math.acos(THREE.MathUtils.clamp(P0.dot(P1), -1, 1))
    s.travel = { t0: performance.now(), dur: Math.min(6, 2.4 + angle * 2.2) * 1000, P0, F0, alt0, P1, F1 }
    s.P.copy(P0); s.F.copy(F0); s.alt = alt0; s.vel.set(0, 0, 0); s.vy = 0; s.pitch = -0.4
    setMode('travel')
  }

  // a stream picked anywhere (list, card, building) flies us there
  useEffect(() => {
    if (!selected) { setSelIdx(-1); return }
    const idx = layout.byLogin.get(selected.login)
    if (idx === undefined) {
      setSelIdx(-1)
      // a stream that lives on another planet is not "missing": we are about to fly there
      if (GROUPS[groupIndex(selected.game)].id === layout.theme.id) onMissing()
      return
    }
    setSelIdx(idx)
    startTravel(idx)
  }, [selected?.login])

  // ---- input ----
  useEffect(() => {
    const s = S.current
    const canvas = gl.domElement
    const typing = (e: Event) => ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
    const goOrbit = () => {
      s.oy = Math.atan2(s.P.x, s.P.z); s.op = Math.asin(THREE.MathUtils.clamp(s.P.y, -1, 1)) * 0.8; s.od = R * 2.6
      s.travel = null; s.vel.set(0, 0, 0)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      setMode('orbit')
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      const k = e.key.toLowerCase()
      if (s.mode !== 'orbit' && (k === ' ' || k.startsWith('arrow'))) e.preventDefault()
      s.keys[k] = true
      if (e.repeat) return
      if (k === ' ') s.jumpBuf = 0.15
      if (k === 'o') goOrbit()
      if (k === 'e' && s.mode === 'walk' && s.nearIdx >= 0) callbacks.current.onEnter(layout.plots[s.nearIdx].stream)
    }
    const up = (e: KeyboardEvent) => { s.keys[e.key.toLowerCase()] = false }
    const blur = () => { s.keys = {} }
    let drag = false
    const pd = () => { drag = true }
    const pu = () => { drag = false }
    const pm = (e: PointerEvent) => {
      const looking = (drag && e.buttons) || document.pointerLockElement === canvas
      if (!looking) return
      if (s.mode === 'orbit') {
        s.oy -= e.movementX * 0.005
        s.op = THREE.MathUtils.clamp(s.op + e.movementY * 0.005, -1.45, 1.45)
      } else {
        const k = document.pointerLockElement === canvas ? 0.0022 : 0.005
        t.q.setFromAxisAngle(s.P, -e.movementX * k)
        s.F.applyQuaternion(t.q)
        s.pitch = THREE.MathUtils.clamp(s.pitch - e.movementY * k, -1.2, 0.5)
      }
    }
    const wheel = (e: WheelEvent) => {
      if (s.mode !== 'orbit') return
      e.preventDefault()
      s.od = THREE.MathUtils.clamp(s.od * Math.exp(e.deltaY * 0.001), R * 1.35, R * 7)
    }
    const click = () => {
      if (s.mode !== 'walk' || document.pointerLockElement === canvas) return
      try { Promise.resolve(canvas.requestPointerLock()).catch(() => {}) } catch { /* drag-to-look still works */ }
    }
    const orbit = () => goOrbit()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointermove', pm)
    window.addEventListener('watchsphere:orbit', orbit)
    canvas.addEventListener('pointerdown', pd)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('click', click)
    if (import.meta.env.DEV) (window as any).__sphere = { S, layout, scene, gl }
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('watchsphere:orbit', orbit)
      canvas.removeEventListener('pointerdown', pd)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('click', click)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [gl, layout])

  /** Push a point on the ground out of any building it has walked into (buildings are circles seen from above). */
  const resolve = (P: THREE.Vector3, alt: number) => {
    t.pw.copy(P).multiplyScalar(R)
    for (let pass = 0; pass < 2; pass++) {
      grid.near(t.pw, (i) => {
        const pl = layout.plots[i]
        if (alt > pl.height - 0.2) return
        t.a.copy(pl.dir).multiplyScalar(R)
        t.b.copy(t.pw).sub(t.a)
        const rad = pl.footprint * 0.62 + 0.5
        const d = t.b.length()
        if (d < rad) {
          if (d < 1e-4) t.b.crossVectors(pl.dir, Y)
          t.pw.copy(t.a).addScaledVector(t.b.normalize(), rad)
        }
      })
    }
    P.copy(t.pw).normalize()
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const s = S.current
    const k = s.keys
    s.jumpBuf = Math.max(0, s.jumpBuf - dt)
    // which way is "up" for the sky, and city haze that only appears once you are down in the streets
    skyUp.current.copy(s.mode === 'orbit' ? camera.position : s.P).normalize()
    const fog = state.scene.fog as THREE.FogExp2 | null
    if (fog) fog.density = THREE.MathUtils.lerp(fog.density, s.mode === 'orbit' ? 0 : 0.0016, 1 - Math.exp(-3 * dt))
    space.current += ((s.mode === 'orbit' ? 1 : 0) - space.current) * (1 - Math.exp(-3 * dt))
    if (stars.current) stars.current.visible = space.current > 0.3
    {
      // it is always a sunny day where you stand: the sun and the sky light follow your "up"
      const up = skyUp.current
      t.a.crossVectors(up, Y)
      if (t.a.lengthSq() < 1e-4) t.a.set(1, 0, 0)
      t.a.normalize()
      t.b.copy(up).multiplyScalar(0.8).addScaledVector(t.a, 0.5)
      if (s.mode !== 'orbit') t.b.addScaledVector(s.F, 0.3)
      if (sun.current) sun.current.position.copy(t.b).normalize().multiplyScalar(R * 4)
      if (hemi.current) hemi.current.position.copy(up)
    }
    if (s.mode !== 'orbit') people.sendMove(s.P, s.F, s.alt)

    if (s.mode === 'orbit') {
      const cp = Math.cos(s.op)
      t.cam.set(cp * Math.sin(s.oy), Math.sin(s.op), cp * Math.cos(s.oy)).multiplyScalar(s.od)
      camera.position.lerp(t.cam, 1 - Math.exp(-6 * dt))
      camera.up.lerp(Y, 1 - Math.exp(-6 * dt)).normalize()
      camera.lookAt(0, 0, 0)
      if (s.nearIdx !== -1) { s.nearIdx = -1; callbacks.current.onNear(-1) }
      if (avatar.current) avatar.current.visible = false
      return
    }

    // ---- flying to a building (fast travel) ----
    if (s.mode === 'travel' && s.travel) {
      const tr = s.travel
      const raw = Math.min(1, (performance.now() - tr.t0) / tr.dur)
      const e = raw * raw * (3 - 2 * raw)
      t.q.setFromUnitVectors(tr.P0, tr.P1)
      t.q2.identity().slerp(t.q, e)
      s.P.copy(tr.P0).applyQuaternion(t.q2)
      s.F.copy(tr.F0).applyQuaternion(t.q2).lerp(tr.F1, e)
      s.F.addScaledVector(s.P, -s.F.dot(s.P)).normalize()
      s.alt = THREE.MathUtils.lerp(tr.alt0, 0, e) + 90 * Math.sin(Math.PI * e)
      s.pitch = THREE.MathUtils.lerp(-0.4, -0.25, e)
      s.vel.set(0, 0, 0)
      if (raw >= 1) { s.travel = null; s.alt = 0; s.vy = 0; setMode('walk') }
      s.walk = 0.6
    } else {
      // ---- walking on the sphere ----
      const f = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
      const st = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
      const turn = (k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0)
      if (turn) { t.q.setFromAxisAngle(s.P, turn * 1.8 * dt); s.F.applyQuaternion(t.q) }
      t.right.crossVectors(s.F, s.P).normalize()
      t.want.set(0, 0, 0).addScaledVector(s.F, f).addScaledVector(t.right, st)
      if (t.want.lengthSq() > 0) t.want.normalize().multiplyScalar(k['shift'] ? RUN_SPEED : WALK_SPEED)
      const grounded = s.alt <= 0.001 && s.vy <= 0
      s.coyote = grounded ? 0.1 : s.coyote - dt
      const rate = grounded ? (t.want.lengthSq() > 0 ? 11 : 15) : (t.want.lengthSq() > 0 ? 3.5 : 0.6)
      s.vel.lerp(t.want, 1 - Math.exp(-rate * dt))
      s.vel.addScaledVector(s.P, -s.vel.dot(s.P)) // stay in the ground plane
      const speed = s.vel.length()
      if (speed > 0.05) {
        t.a.copy(s.vel).normalize()
        t.b.crossVectors(s.P, t.a).normalize()
        t.q.setFromAxisAngle(t.b, (speed * dt) / (R + s.alt))
        t.c.copy(s.P).applyQuaternion(t.q) // where we would end up
        resolve(t.c, s.alt)
        if (layout.ground(t.c) < 0.2) { t.c.copy(s.P); s.vel.multiplyScalar(0.2) } // lakes block the way
        t.q2.setFromUnitVectors(s.P, t.c) // carry our heading and velocity along with us
        s.F.applyQuaternion(t.q2)
        s.vel.applyQuaternion(t.q2)
        s.P.copy(t.c)
      } else if (t.want.lengthSq() === 0) s.vel.set(0, 0, 0)
      s.F.addScaledVector(s.P, -s.F.dot(s.P)).normalize()

      if (s.jumpBuf > 0 && s.coyote > 0) { s.vy = JUMP_SPEED; s.coyote = 0; s.jumpBuf = 0 }
      s.vy -= GRAVITY * dt
      s.alt += s.vy * dt
      if (s.alt <= 0) { s.alt = 0; if (s.vy < 0) s.vy = 0 }
      s.walk += (Math.min(1, speed / 4) - s.walk) * (1 - Math.exp(-10 * dt))
    }

    // ---- avatar ----
    const g = layout.ground(s.P) // height of the land under the player
    const av = avatar.current
    if (av) {
      av.visible = true
      av.position.copy(s.P).multiplyScalar(R + g + s.alt)
      t.right.crossVectors(s.F, s.P).normalize()
      t.m.makeBasis(t.right, s.P, t.a.copy(s.F).negate())
      av.quaternion.setFromRotationMatrix(t.m)
      s.phase += dt * (5 + s.vel.length() * 0.9) * (s.walk > 0.05 ? 1 : 0)
      const swing = Math.sin(s.phase) * 0.8 * s.walk
      const air = s.alt > 0.05
      if (legL.current && legR.current) {
        legL.current.rotation.x = air ? -0.6 : swing
        legR.current.rotation.x = air ? 0.3 : -swing
      }
    }

    // ---- camera: third person, behind and above ----
    const dist = s.mode === 'travel' ? 7 + s.alt * 0.15 : 7
    const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch)
    t.head.copy(s.P).multiplyScalar(R + g + s.alt + 1.7)
    t.cam.copy(t.head).addScaledVector(s.F, -cp * dist).addScaledVector(s.P, -sp * dist)
    // never let the camera dip into the ground when you look up
    const camHeight = t.cam.dot(s.P) - (R + g)
    if (camHeight < 1.2) t.cam.addScaledVector(s.P, 1.2 - camHeight)
    camera.position.lerp(t.cam, 1 - Math.exp(-14 * dt))
    camera.up.lerp(s.P, 1 - Math.exp(-10 * dt)).normalize()
    camera.lookAt(t.head)

    // ---- which building are we standing next to? (a few times a second) ----
    const now = performance.now()
    if (s.mode === 'walk' && now - s.nearAt > 120) {
      s.nearAt = now
      t.pw.copy(s.P).multiplyScalar(R)
      let best = -1, bestD = ENTER_RADIUS
      grid.near(t.pw, (i) => {
        const pl = layout.plots[i]
        const d = t.a.copy(pl.dir).multiplyScalar(R).distanceTo(t.pw) - pl.footprint * 0.5
        if (d < bestD) { bestD = d; best = i }
      })
      if (best !== s.nearIdx) { s.nearIdx = best; callbacks.current.onNear(best) }
    } else if (s.mode !== 'walk' && s.nearIdx !== -1) {
      s.nearIdx = -1
      callbacks.current.onNear(-1)
    }
  })

  return (
    <>
      <fogExp2 attach="fog" args={[layout.theme.fog, 0]} />
      <ambientLight intensity={layout.theme.sun.intensity > 2 ? 0.85 : 0.6} />
      <directionalLight ref={sun} position={[R * 2, R * 3, R * 1.5]} intensity={layout.theme.sun.intensity} color={layout.theme.sun.color} />
      <hemisphereLight ref={hemi} args={[layout.theme.sky.horizon, layout.theme.palette.grassB, 1.0]} />
      <SkyDome R={R} up={skyUp} space={space} zenith={layout.theme.sky.zenith} horizon={layout.theme.sky.horizon} />
      <group ref={stars}><Stars R={R} /></group>
      <Atmosphere R={R} color={layout.theme.atmosphere} />
      <Planet layout={layout} grid={grid} />
      <Water R={R} color={layout.theme.water} />
      <Nature layout={layout} net={net} />
      <Animals layout={layout} />
      <Waterfalls layout={layout} />
      <Roads net={net} layout={layout} />
      <Houses layout={layout} onPick={(i) => callbacks.current.onSelect(layout.plots[i].stream)} />
      <Props net={net} layout={layout} />
      <Traffic net={net} layout={layout} />
      <Railways R={R} ground={layout.ground} />
      <Clouds R={R} />
      <Planes R={R} />
      <Residents world={people} layout={layout} self={S} />
      <Labels layout={layout} />
      {selIdx >= 0 && <Beacon layout={layout} idx={selIdx} />}
      <group ref={avatar} visible={false}>
        <PlayerCharacter S={S} />
      </group>
    </>
  )
}

/** You: an animated Cube World character that idles, walks, runs and jumps with what the controller is doing. */
function PlayerCharacter({ S }: { S: React.MutableRefObject<{ alt: number; vel: THREE.Vector3 }> }) {
  const [rig, setRig] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction> } | null>(null)
  const current = useRef('Idle')
  useEffect(() => {
    let live = true
    loadGLTF(CUBE('Character_Male_1')).then((g) => {
      if (!live) return
      const root = SkeletonUtils.clone(g.scene)
      root.scale.setScalar(1.85 / 2.84)
      root.rotation.y = Math.PI // the model faces +Z; the player group faces -Z
      root.traverse((o) => { o.frustumCulled = false })
      const mixer = new THREE.AnimationMixer(root)
      const actions: Record<string, THREE.AnimationAction> = {}
      for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip)
      actions.Idle?.play()
      setRig({ root, mixer, actions })
    })
    return () => { live = false }
  }, [])
  useFrame((_, dtRaw) => {
    if (!rig) return
    const dt = Math.min(dtRaw, 0.1)
    const s = S.current
    const speed = s.vel.length()
    const want = s.alt > 0.15 ? 'Jump_Idle' : speed > 13 ? 'Run' : speed > 0.6 ? 'Walk' : 'Idle'
    if (want !== current.current && rig.actions[want]) {
      const from = rig.actions[current.current], to = rig.actions[want]
      to.reset().play()
      if (from) from.crossFadeTo(to, 0.2, false)
      current.current = want
    }
    const a = rig.actions[current.current]
    if (a) a.timeScale = want === 'Walk' ? THREE.MathUtils.clamp(speed / 5, 0.6, 1.4) : 1
    rig.mixer.update(dt)
  })
  return rig ? <primitive object={rig.root} /> : null
}
