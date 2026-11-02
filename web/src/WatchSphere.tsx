import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import './sphere.css'
import { type Stream } from './api'
import { loadAllStreams, onStreams, streamsNow } from './streamStore'
import { onGoto, takeGoto } from './sphereSearch'
import { COUNTRY_COLORS, GROUPS, TIERS, frontDir, groupIndex, layoutSystem, type PlanetData, type SphereLayout } from './sphereLayout'
import { SystemScene } from './sphereSystem'
import { buildRoadNet } from './sphereCity'
import { Atmosphere, Props, Railways, Roads, SkyDome, Water, Waterfalls, hashStr, makeGroundMaterial } from './sphereVisuals'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import BlockyCharacter from './BlockyCharacter'
import { Animals, Nature } from './sphereNature'
import { Boats, ModelHouses } from './sphereCityModels'
import { Highways } from './sphereHighways'
import { Residents, WorldChat, useWorldPeople, type WorldPeople } from './sphereResidents'

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
  | { kind: 'planet'; index: number; entry: THREE.Vector3 | null; nonce?: number; focus?: string | null }

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
    let live = true
    // the busiest page lands first so the world appears quickly; the rest rebuild it with every live streamer
    const lay = () => { if (live && streamsNow().length) setPlanets(layoutSystem(streamsNow().slice())) }
    const off = onStreams(lay)
    loadAllStreams().catch((e) => { if (live) setError(String(e?.message ?? e)) })
    if (streamsNow().length) lay()
    return () => { live = false; off() }
  }, [])

  // the search bar can send us to a planet, or to the country of a game
  useEffect(() => {
    if (!planets) return
    const go = () => {
      const g = takeGoto()
      if (!g) return
      const lay = planets[g.planet].layout
      const t = g.game ? lay.categories.find((c) => c.category === g.game) : null
      const entry = (t ?? lay.groups[0])?.centroid.clone() ?? null
      setView((v) => {
        if (v.kind !== 'planet' || v.index !== g.planet) { setWarp(planets[g.planet].theme.name); setTimeout(() => setWarp(null), 900) }
        return { kind: 'planet', index: g.planet, entry, nonce: (v.kind === 'planet' ? (v.nonce ?? 0) : 0) + 1, focus: t?.category ?? null }
      })
    }
    const off = onGoto(go)
    go()
    return off
  }, [planets])

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
      setView({ kind: 'planet', index: i, entry: new V(0.3, 0.5, 1).normalize() })
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
              key={`${view.index}:${view.nonce ?? 0}`}
              layout={planets[view.index].layout}
              focus={view.focus ?? null}
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
              <em>Walk into the building to enter</em>
            </div>
          )}
          {view.kind === 'planet' && <WorldChat world={people} inputRef={chatInput} name={myName} />}
          {missing && <div className="sphere-note">That stream has no building yet (it may have just gone live).</div>}
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
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(R, layout.detail)
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
      if (e >= 0.4) {
        // every game's country is one flat colour (the 12 biggest differ, the rest share one), so they can be told apart from orbit;
        // it fades out on the high peaks, which keep their rock and snow
        pw.copy(d).multiplyScalar(R)
        let best = -1, bestD = Infinity
        grid.near(pw, (idx) => {
          const dist = layout.plots[idx].dir.distanceToSquared(d)
          if (dist < bestD) { bestD = dist; best = idx }
        })
        if (best >= 0) {
          const hh = hashStr(layout.plots[best].category)
          tint.set(COUNTRY_COLORS[layout.plots[best].country]).multiplyScalar(0.94 + ((hh >> 4) % 100) / 1000)
          const peak = e / layout.terrain.scale
          nat.lerp(tint, 0.72 * T.cityMask(d) * (1 - Math.min(1, Math.max(0, (peak - 60) / 40))))
        }
      }
      c.copy(nat)
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const flat = geo.toNonIndexed()
    flat.computeVertexNormals() // one normal per triangle: the low-poly, faceted look
    // one colour per facet too, so every face is a flat patch of colour instead of a gradient
    const col = flat.attributes.color as THREE.BufferAttribute
    const fp = flat.attributes.position as THREE.BufferAttribute, fn = flat.attributes.normal as THREE.BufferAttribute
    const cliff = new THREE.Color('#7b5a43')
    for (let i = 0; i + 2 < col.count; i += 3) {
      let r = (col.getX(i) + col.getX(i + 1) + col.getX(i + 2)) / 3, g = (col.getY(i) + col.getY(i + 1) + col.getY(i + 2)) / 3, b = (col.getZ(i) + col.getZ(i + 1) + col.getZ(i + 2)) / 3
      // steep faces become brown cliff walls (flat tops stay green), like stacked blocks
      const cx = fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2), cy = fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2), cz = fp.getZ(i) + fp.getZ(i + 1) + fp.getZ(i + 2)
      const up = (fn.getX(i) * cx + fn.getY(i) * cy + fn.getZ(i) * cz) / Math.max(1e-6, Math.hypot(cx, cy, cz))
      const hgt = Math.hypot(cx, cy, cz) / 3 - R
      if (hgt > 3.5 && up < 0.9) {
        const k = Math.min(1, (0.9 - up) / 0.12)
        const wall = 0.78 + 0.22 * (1 - Math.min(1, hgt / 120))
        r += (cliff.r * wall - r) * k; g += (cliff.g * wall - g) * k; b += (cliff.b * wall - b) * k
      }
      for (let j = 0; j < 3; j++) col.setXYZ(i + j, r, g, b)
    }
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
    for (const c of layout.countries) {
      if (c.count < 3) continue
      out.push({ text: c.name, color: c.color, pos: c.centroid.clone().multiplyScalar(layout.R + 150), w: layout.R * 0.3, kind: 'cat' })
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
      mat.opacity = it.kind === 'group' ? THREE.MathUtils.clamp((d - layout.R * 0.5) / (layout.R * 0.6), 0, 1) : THREE.MathUtils.clamp((d - layout.R * 0.1) / (layout.R * 0.25), 0, 1)
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

/** Streets are only worth drawing close up; from orbit they just clutter the colours of the countries. */
function NearOnly({ R, children }: { R: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const { camera } = useThree()
  useFrame(() => { if (ref.current) ref.current.visible = camera.position.length() < R * 1.45 })
  return <group ref={ref}>{children}</group>
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

/** A tall pillar of light over the country of a searched game. */
function CountryBeacon({ layout, game }: { layout: SphereLayout; game: string }) {
  const t = layout.categories.find((c) => c.category === game)
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(Y, t?.centroid ?? Y), [t])
  if (!t) return null
  const color = COUNTRY_COLORS[t.country]
  return (
    <mesh position={t.centroid.clone().multiplyScalar(layout.R + layout.R * 0.3)} quaternion={q} raycast={() => null}>
      <cylinderGeometry args={[layout.R * 0.012, layout.R * 0.03, layout.R * 0.6, 14, 1, true]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
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

function Scene({ layout, focus, entry, selected, onSelect, onEnter, onMode, onNear, onMissing, people }: {
  layout: SphereLayout
  entry: THREE.Vector3 | null
  focus: string | null
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
    if (entry) {
      const spawn = dir.clone().normalize()
      let facing: THREE.Vector3 | null = null
      if (layout.ground(spawn) <= 0.2) {
        if (layout.plots.length) {
          const plot = layout.plots.reduce((best, p) => p.dir.distanceToSquared(spawn) < best.dir.distanceToSquared(spawn) ? p : best)
          const door = frontDir(plot)
          spawn.copy(plot.dir).multiplyScalar(R).addScaledVector(door, plot.footprint * 0.5 + 12).normalize()
          facing = door.negate()
        } else {
          // Empty demo planets still need a dry place to land.
          let highest = -Infinity
          const golden = Math.PI * (3 - Math.sqrt(5))
          for (let i = 0; i < 256; i++) {
            const y = 1 - (2 * (i + 0.5)) / 256
            const radius = Math.sqrt(1 - y * y)
            const sample = new V(Math.cos(i * golden) * radius, y, Math.sin(i * golden) * radius)
            const elevation = layout.ground(sample)
            if (elevation > highest) { highest = elevation; spawn.copy(sample) }
          }
        }
      }
      s.P.copy(spawn)
      s.F.copy(facing ?? new V(0, 0, -1).addScaledVector(spawn, spawn.z))
      if (s.F.lengthSq() < 1e-4) s.F.set(1, 0, 0).addScaledVector(spawn, -spawn.x)
      s.F.normalize()
      s.vel.set(0, 0, 0); s.alt = 0; s.vy = 0; s.mode = 'walk'
      const surface = R + layout.ground(spawn)
      camera.position.copy(spawn).multiplyScalar(surface + 12)
      camera.up.copy(spawn)
      camera.lookAt(spawn.clone().multiplyScalar(surface))
      callbacks.current.onMode('walk')
    } else {
      s.mode = 'orbit'
      camera.position.copy(dir).multiplyScalar(R * 2.6)
      camera.lookAt(0, 0, 0)
      callbacks.current.onMode('orbit')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // the further out the camera is, the further it keeps its near plane, so surfaces that sit close together stay apart in the depth buffer
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera
    const h = Math.max(0, cam.position.length() - R)
    const near = THREE.MathUtils.clamp(h * 0.06, 0.3, R * 0.4)
    if (Math.abs(near - cam.near) > cam.near * 0.05) { cam.near = near; cam.updateProjectionMatrix() }
  })
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
        s.pitch = THREE.MathUtils.clamp(s.pitch - e.movementY * k, -1.2, 1.4)
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

  /** Walk into a stream building to enter it; keep the player outside buildings while airborne. */
  const resolve = (P: THREE.Vector3, alt: number) => {
    t.pw.copy(P).multiplyScalar(R)
    let entered = false
    for (let pass = 0; pass < 2; pass++) {
      grid.near(t.pw, (i) => {
        if (entered) return
        const pl = layout.plots[i]
        if (alt > pl.height - 0.2) return
        t.a.copy(pl.dir).multiplyScalar(R)
        t.b.copy(t.pw).sub(t.a)
        const rad = pl.footprint * 0.62 + 0.5
        const d = t.b.length()
        if (d < rad) {
          if (alt < 2.2) {
            entered = true
            callbacks.current.onEnter(pl.stream)
            return
          }
          if (d < 1e-4) t.b.crossVectors(pl.dir, Y)
          if (!entered) t.pw.copy(t.a).addScaledVector(t.b.normalize(), rad)
        }
      })
      if (entered) return true
    }
    P.copy(t.pw).normalize()
    return false
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
        if (resolve(t.c, s.alt)) return
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
    let dist = s.mode === 'travel' ? 7 + s.alt * 0.15 : 7
    const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch)
    // looking up swings the camera under your head, so pull it in rather than letting the ground push it up
    if (sp > 0.02) dist = Math.min(dist, Math.max(0.6, (s.alt + 1.7 - 0.5) / sp))
    t.head.copy(s.P).multiplyScalar(R + g + s.alt + 1.7)
    t.cam.copy(t.head).addScaledVector(s.F, -cp * dist).addScaledVector(s.P, -sp * dist)
    const camHeight = t.cam.dot(s.P) - (R + g)
    if (camHeight < 0.5) t.cam.addScaledVector(s.P, 0.5 - camHeight)
    if (avatar.current && s.mode === 'walk') avatar.current.visible = dist > 2.4 // hide yourself when the camera is inside your head
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
      <Boats layout={layout} />
      <Waterfalls layout={layout} />
      <NearOnly R={R}>
        <Roads net={net} layout={layout} />
        <Highways net={net} layout={layout} />
      </NearOnly>
      <ModelHouses layout={layout} onPick={(i) => callbacks.current.onSelect(layout.plots[i].stream)} />
      <Props net={net} layout={layout} />
      <Railways R={R} ground={layout.ground} />
      <Residents world={people} layout={layout} self={S} />
      <Labels layout={layout} />
      {focus && <CountryBeacon layout={layout} game={focus} />}
      {selIdx >= 0 && <Beacon layout={layout} idx={selIdx} />}
      <group ref={avatar} visible={false}>
        <PlayerCharacter S={S} />
      </group>
    </>
  )
}

/** You: the shared animated blocky character used inside theatres as well. */
function PlayerCharacter({ S }: { S: React.MutableRefObject<{ alt: number; vel: THREE.Vector3 }> }) {
  return <BlockyCharacter motion={S} />
}
