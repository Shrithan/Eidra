import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Stream } from './api'
import BlockyCharacter, { type CharacterMotion } from './BlockyCharacter'
import type { Appearance } from './Rewards'
import { kitScale, loadSciFi, placePiece } from './sphereIslandAssets'
import { GROUPS, groupIndex } from './sphereLayout'
import { bubbleTexture, nameTexture, type WorldPeople, type Resident } from './sphereResidents'

const V = THREE.Vector3
export const ISLAND_R = 680
/** Everything on the island was laid out for a 560 m radius; this scales those positions up to the current size. */
const F = ISLAND_R / 560
const FONT = "'Fredoka', ui-rounded, system-ui, sans-serif"

const rand = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`)

type Solid = { x: number; z: number; r: number; stream?: Stream }

function labelSprite(s: Stream, color: string) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 160
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(10,8,24,0.86)'
  g.beginPath(); g.roundRect(6, 6, 500, 148, 28); g.fill()
  g.lineWidth = 6; g.strokeStyle = color; g.beginPath(); g.roundRect(6, 6, 500, 148, 28); g.stroke()
  g.textAlign = 'center'
  g.fillStyle = '#fff'
  let size = 56
  g.font = `700 ${size}px ${FONT}`
  while (g.measureText(s.displayName).width > 460 && size > 26) { size -= 4; g.font = `700 ${size}px ${FONT}` }
  g.fillText(s.displayName, 256, 70)
  g.font = `500 32px ${FONT}`
  g.fillStyle = color
  g.fillText(`${compact(s.viewers)} watching`, 256, 112)
  g.fillStyle = 'rgba(255,255,255,0.6)'
  g.font = `500 24px ${FONT}`
  g.fillText(s.game.slice(0, 34), 256, 142)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
  void document.fonts?.load('700 40px Fredoka').then(() => { t.needsUpdate = true }).catch(() => {})
  return sp
}

/**
 * The island itself: a floating rock whose top is a faceted, slightly lumpy plate of the colony pack's own "Ground_Tan" red,
 * so it reads as the same ground the pack's pads are made of. The lumps only ever dip below street level, never above it.
 */
function islandGeometry() {
  const ground = new THREE.Color(0.3364, 0.0551, 0.0064) // the pack's ground colour
  const c = new THREE.Color()
  // ---- the top plate: a jittered grid of triangles, flat shaded ----
  const N = 84, size = ISLAND_R * 2.06, step = size / N
  const pts: THREE.Vector3[] = []
  const at = (i: number, j: number) => pts[j * (N + 1) + i]
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    let x = -size / 2 + i * step + (rand(i * 7.1 + j * 13.7) - 0.5) * step * 0.7
    let z = -size / 2 + j * step + (rand(i * 3.3 + j * 9.9 + 5) - 0.5) * step * 0.7
    const r = Math.hypot(x, z)
    if (r > ISLAND_R) { x *= ISLAND_R / r; z *= ISLAND_R / r }
    // broad swells plus small bumps, always at or below street level
    const swell = Math.sin(x * 0.011) * Math.cos(z * 0.013) * 0.5 + Math.sin(x * 0.031 + z * 0.027) * 0.25
    const y = -0.45 - swell * 0.55 - rand(i * 5.7 + j * 2.9 + 1) * 0.35
    pts.push(new THREE.Vector3(x, Math.min(-0.05, y), z))
  }
  const pos: number[] = [], col: number[] = []
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, seed: number) => {
    const cx = (a.x + b.x + d.x) / 3, cz = (a.z + b.z + d.z) / 3
    if (Math.hypot(cx, cz) > ISLAND_R * 1.02) return
    // each facet is a slightly different shade of the same red, with a few darker patches
    const patch = rand(Math.floor(cx / 70) * 3.7 + Math.floor(cz / 70) * 5.3)
    const k = 0.82 + rand(seed) * 0.34 + (patch < 0.22 ? -0.2 : patch > 0.85 ? 0.12 : 0)
    c.copy(ground).multiplyScalar(k)
    for (const v of [a, b, d]) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b) }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = at(i, j), b = at(i + 1, j), d = at(i, j + 1), e = at(i + 1, j + 1)
    tri(a, d, b, i * 31 + j * 17); tri(b, d, e, i * 29 + j * 19 + 3)
  }
  const top = new THREE.BufferGeometry()
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  top.computeVertexNormals()

  // ---- the rim and the rock underneath ----
  const profile: THREE.Vector2[] = [new THREE.Vector2(ISLAND_R, -0.3), new THREE.Vector2(ISLAND_R + 10, -8), new THREE.Vector2(ISLAND_R - 6, -34), new THREE.Vector2(ISLAND_R * 0.82, -90), new THREE.Vector2(ISLAND_R * 0.6, -150), new THREE.Vector2(ISLAND_R * 0.34, -215), new THREE.Vector2(ISLAND_R * 0.12, -270), new THREE.Vector2(0, -300)]
  const side = new THREE.LatheGeometry(profile, 56)
  const sp = side.getAttribute('position') as THREE.BufferAttribute
  const sc = new Float32Array(sp.count * 3)
  const rock = new THREE.Color('#5d4a48'), rock2 = new THREE.Color('#3f3436')
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i)
    if (y < -1) { const j = 1 + (rand(x * 0.37 + z * 1.13 + y) - 0.5) * 0.09; sp.setXYZ(i, x * j, y + (rand(x + z * 3 + y * 7) - 0.5) * 10, z * j) }
    c.copy(rand(x * 0.1 + y * 0.2) < 0.5 ? rock : rock2)
    sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b
  }
  side.setAttribute('color', new THREE.BufferAttribute(sc, 3))
  side.computeVertexNormals()
  const sideFlat = side.toNonIndexed()
  sideFlat.deleteAttribute('uv')
  return mergeGeometries([top, sideFlat], false)!
}

function stars() {
  const n = 2600, a = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const v = new V(rand(i) * 2 - 1, rand(i + 7) * 1.4 - 0.4, rand(i + 13) * 2 - 1).normalize().multiplyScalar(9000)
    a.set([v.x, v.y, v.z], i * 3)
    c.setHSL(rand(i + 3) * 0.2 + 0.55, 0.4, 0.75 + rand(i + 5) * 0.25)
    col.set([c.r, c.g, c.b], i * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(a, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

async function buildWorld(elite: Stream[], solids: Solid[], anim: { train: THREE.Group[]; spin: THREE.Object3D[]; labels: { s: THREE.Sprite; at: THREE.Vector3 }[] }) {
  const world = new THREE.Group()
  const [sf, unit] = await Promise.all([loadSciFi(), kitScale()])
  const add = (o: THREE.Object3D, x: number, z: number, y = 0, ry = 0, scale = 1) => { o.position.set(x, y, z); o.rotation.y = ry; o.scale.multiplyScalar(scale); world.add(o); return o }

  // ---- streets: a ring road, a second ring and eight spokes, with a painted centre line ----
  const asphalt = new THREE.MeshStandardMaterial({ color: '#2a2c36', roughness: 0.95, flatShading: true })
  const paint = new THREE.MeshBasicMaterial({ color: '#e9d27a' })
  const ringRoad = (r: number, w: number) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 96), asphalt)
    m.rotation.x = -Math.PI / 2; m.position.y = 0.12; world.add(m)
    const l = new THREE.Mesh(new THREE.RingGeometry(r - 0.3, r + 0.3, 96), paint)
    l.rotation.x = -Math.PI / 2; l.position.y = 0.14; world.add(l)
  }
  ringRoad(150 * F, 14); ringRoad(262 * F, 14); ringRoad(380 * F, 14)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const holder = new THREE.Group()
    holder.rotation.y = Math.PI / 2 - a // +z of the holder points along (cos a, sin a)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, ISLAND_R - 70), asphalt)
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.1, (ISLAND_R + 70) / 2)
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.6, ISLAND_R - 70), paint)
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.13, (ISLAND_R + 70) / 2)
    holder.add(m, stripe)
    world.add(holder)
  }

  // ---- the plaza and the rocket ----
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(62, 66, 1.4, 40), new THREE.MeshStandardMaterial({ color: '#8d8f9c', roughness: 0.85, flatShading: true }))
  plaza.position.y = 0.5; world.add(plaza)
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(54, 57, 80), new THREE.MeshBasicMaterial({ color: '#58e1ff' }))
  glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 1.3; world.add(glowRing)
  solids.push({ x: 0, z: 0, r: 22 })
  const rocketNames = ['rocket_baseA', 'rocket_fuelA', 'rocket_sidesA', 'rocket_topA', 'rocket_finsA']
  const rocket = new THREE.Group()
  let y = 1.2
  for (const [i, n] of rocketNames.entries()) {
    const p = await placePiece(n, 6)
    if (n === 'rocket_finsA') { p.obj.position.y = 1.2; rocket.add(p.obj); continue }
    p.obj.position.y = y
    rocket.add(p.obj)
    if (i !== 3 || true) y += p.size.y * 0.92
  }
  world.add(rocket)

  // ---- the monorail: a loop of track round the second ring, with a train that never stops ----
  const track = await placePiece('monorail_trackStraight', 3)
  const segLen = Math.max(track.size.z, track.size.x)
  const trackR = 206 * F
  const segs = Math.round((Math.PI * 2 * trackR) / segLen)
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const t = track.obj.clone(true)
    t.position.set(Math.cos(a) * trackR, 0, Math.sin(a) * trackR)
    t.rotation.y = -a + (track.size.z >= track.size.x ? 0 : Math.PI / 2) // the track piece runs along its longest side, which must follow the loop
    world.add(t)
  }
  const carNames = ['monorail_trainFront', 'monorail_trainPassenger', 'monorail_trainPassenger', 'monorail_trainBox', 'monorail_trainEnd']
  for (const [i, n] of carNames.entries()) {
    const car = await placePiece(n, 3)
    const holder = new THREE.Group()
    holder.userData.offset = -i * (car.size.z * 1.05 / trackR)
    holder.userData.radius = trackR
    holder.add(car.obj)
    car.obj.position.y = 0.4
    world.add(holder)
    anim.train.push(holder)
  }

  // ---- the streamers: one colony building each, nearest the plaza for the biggest audiences ----
  const rings = [{ r: 125 * F, n: 8 }, { r: 200 * F, n: 14 }, { r: 322 * F, n: 24 }, { r: 440 * F, n: 28 }]
  const slots: { x: number; z: number; a: number }[] = []
  for (const ring of rings) for (let i = 0; i < ring.n; i++) { const a = (i / ring.n) * Math.PI * 2 + ring.r * 0.011; slots.push({ x: Math.cos(a) * ring.r, z: Math.sin(a) * ring.r, a }) }
  const sorted = [...elite].sort((a, b) => b.viewers - a.viewers).slice(0, slots.length)
  const K = 12
  sorted.forEach((s, i) => {
    const slot = slots[i]
    // the biggest channels get the biggest buildings
    const order = [1, 5, 4, 3, 6, 0, 7, 2]
    const proto = sf.buildings[order[Math.min(order.length - 1, Math.floor(i / (sorted.length / order.length + 0.01)))] % sf.buildings.length]
    const obj = proto.obj.clone(true)
    const k = K * (0.85 + Math.min(0.5, Math.max(0, s.viewers - 3000) / 60000))
    obj.scale.setScalar(k)
    add(obj, slot.x, slot.z, 0, -slot.a + Math.PI / 2)
    const r = (Math.max(proto.size.x, proto.size.z) * k) / 2
    solids.push({ x: slot.x, z: slot.z, r: r * 0.85, stream: s })
    // a glowing pad underfoot in the genre colour, so the district reads from far away
    const color = GROUPS[groupIndex(s.game)].color
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.3, 0.5, 28), new THREE.MeshStandardMaterial({ color: '#4b4c5c', roughness: 0.9, flatShading: true }))
    disc.position.set(slot.x, 0.25, slot.z); world.add(disc)
    const glow = new THREE.Mesh(new THREE.RingGeometry(r * 1.18, r * 1.26, 40), new THREE.MeshBasicMaterial({ color }))
    glow.rotation.x = -Math.PI / 2; glow.position.set(slot.x, 0.55, slot.z); world.add(glow)
    const sp = labelSprite(s, color)
    const at = new V(slot.x, proto.size.y * k + 9, slot.z)
    sp.position.copy(at); sp.scale.set(30, 9.4, 1)
    world.add(sp)
    anim.labels.push({ s: sp, at })
  })

  // ---- three colony pads out near the rim, straight from the pack ----
  sf.pads.forEach((p, i) => {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const k = 20
    const obj = p.obj.clone(true)
    obj.scale.setScalar(k)
    const rr = 462 * F
    add(obj, Math.cos(a) * rr, Math.sin(a) * rr, -p.size.y * 0 - 3.6, a * -1 + 1.2)
    solids.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: Math.max(p.size.x, p.size.z) * k * 0.2 })
  })

  // ---- Kenney Space Kit scenery ----
  const scatter = async (name: string, count: number, rMin: number, rMax: number, k: number, solid = 0, seed = 1) => {
    for (let i = 0; i < count; i++) {
      const a = rand(seed + i * 3) * Math.PI * 2, r = (rMin + rand(seed + i * 5 + 1) * (rMax - rMin)) * F
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      if (solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 12 + solid)) continue
      const p = await placePiece(name, k * (0.8 + rand(seed + i) * 0.5))
      add(p.obj, x, z, 0, rand(seed + i * 9) * Math.PI * 2)
      if (solid) solids.push({ x, z, r: solid })
    }
  }
  await scatter('rock_crystalsLargeA', 14, 120, 520, 3.2, 5, 11)
  await scatter('rock_crystalsLargeB', 12, 150, 520, 3.2, 5, 29)
  await scatter('rock_largeA', 18, 100, 535, 3, 6, 41)
  await scatter('rock_largeB', 16, 100, 535, 3, 6, 53)
  await scatter('rocks_smallA', 30, 70, 540, 3, 0, 61)
  await scatter('rocks_smallB', 30, 70, 540, 3, 0, 67)
  await scatter('craterLarge', 8, 110, 500, 4, 0, 71)
  await scatter('satelliteDish_large', 5, 260, 330, 4, 6, 79)
  await scatter('hangar_largeA', 3, 330, 400, 3.4, 20, 83)
  await scatter('hangar_roundGlass', 3, 330, 400, 3.4, 18, 89)
  await scatter('machine_generatorLarge', 6, 90, 120, 3, 6, 97)
  await scatter('rover', 6, 70, 500, 3, 0, 101)
  await scatter('turret_double', 6, 500, 545, 3, 4, 103)
  await scatter('barrels', 10, 60, 480, 3, 0, 107)
  return world
}

/** Builds the island's buildings and scenery once per set of streamers (shared by the real island and its preview from space). */
function useIslandWorld(elite: Stream[]) {
  const solids = useRef<Solid[]>([])
  const anim = useRef({ train: [] as THREE.Group[], spin: [] as THREE.Object3D[], labels: [] as { s: THREE.Sprite; at: THREE.Vector3 }[] })
  const [world, setWorld] = useState<THREE.Group | null>(null)
  useEffect(() => {
    let live = true
    const list: Solid[] = []
    const a = { train: [] as THREE.Group[], spin: [] as THREE.Object3D[], labels: [] as { s: THREE.Sprite; at: THREE.Vector3 }[] }
    buildWorld(elite, list, a).then((w) => { if (live) { solids.current = list; anim.current = a; setWorld(w) } }).catch((e) => console.warn('[island] could not build', e))
    return () => { live = false }
  }, [elite])
  return { solids, anim, world }
}

const moveTrain = (anim: { train: THREE.Group[] }, t: number) => {
  for (const car of anim.train) {
    const a = t * 0.045 + (car.userData.offset as number), r = car.userData.radius as number
    car.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    car.rotation.y = -a
  }
}

/** The island as seen from the solar system: the very same island, only far away. Click it to fly in. */
export function IslandPreview({ elite, onPick }: { elite: Stream[]; onPick?: () => void }) {
  const { anim, world } = useIslandWorld(elite)
  const geo = useMemo(islandGeometry, [])
  const K = 3.75
  useFrame((st) => {
    moveTrain(anim.current, st.clock.elapsedTime)
    anim.current.labels.forEach((l, i) => { (l.s.material as THREE.SpriteMaterial).opacity = i < 12 ? 0.9 : 0; l.s.scale.set(30 * 2.2, 9.4 * 2.2, 1) })
  })
  return (
    <group position={[0, 100, 0]} scale={K}>
      <hemisphereLight args={['#bcd0ff', '#6a3a30', 1.2]} />
      <mesh geometry={geo} onClick={(e) => { e.stopPropagation(); onPick?.() }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {world && <primitive object={world} />}
    </group>
  )
}

// the planets' own movement numbers, so walking here feels exactly the same
const WALK_SPEED = 7, RUN_SPEED = 22, GRAVITY = 24, JUMP_SPEED = 7.6

type Props = {
  people: WorldPeople
  elite: Stream[]
  onNear: (s: Stream | null) => void
  onEnter: (s: Stream) => void
  onExit: () => void
  onMode: (m: 'orbit' | 'travel' | 'walk') => void
  appearance: Appearance
}

/**
 * The central island, handled exactly like a planet: you arrive in orbit (drag to spin, scroll to zoom), click anywhere on it to fly
 * down and land there, then walk (WASD, Shift to run, Space to jump, click to capture the mouse and look, Esc to release).
 * O goes back up to orbit, and O again back to space.
 */
export function IslandScene({ people, elite, onNear, onEnter, onExit, onMode, appearance }: Props) {
  const { camera, gl, scene } = useThree()
  const { solids, anim, world } = useIslandWorld(elite)
  const worldRef = useRef<THREE.Group | null>(null)
  worldRef.current = world
  const state = useRef({
    mode: 'orbit' as 'orbit' | 'travel' | 'walk',
    oy: 0.8, op: 0.55, od: 1050,
    x: 0, z: 150, alt: 0, vy: 0, yaw: Math.PI, pitch: -0.25, vel: new V(), keys: {} as Record<string, boolean>,
    jumpBuf: 0, coyote: 0, walk: 0, phase: 0,
    near: null as Stream | null, nearAt: 0,
    travel: null as null | { t0: number; dur: number; x0: number; z0: number; alt0: number; x1: number; z1: number; yaw0: number; yaw1: number },
    look: new V(0, -40, 0),
  })
  const motion = useRef<CharacterMotion>({ alt: 0, vel: new V() })
  const avatar = useRef<THREE.Group>(null)
  const geo = useMemo(islandGeometry, [])
  const starGeo = useMemo(stars, [])
  const cb = useRef({ onNear, onEnter, onExit, onMode })
  cb.current = { onNear, onEnter, onExit, onMode }
  const peopleRef = useRef(people)
  peopleRef.current = people

  useEffect(() => {
    scene.background = new THREE.Color('#070916')
    scene.fog = null
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 60; cam.near = 0.3; cam.far = 40000; cam.up.set(0, 1, 0); cam.updateProjectionMatrix()
    const s = state.current
    const cp = Math.cos(s.op)
    camera.position.set(Math.sin(s.oy) * cp * s.od, Math.sin(s.op) * s.od, Math.cos(s.oy) * cp * s.od)
    camera.lookAt(s.look)
    cb.current.onMode('orbit')

    const setMode = (m: 'orbit' | 'travel' | 'walk') => { s.mode = m; cb.current.onMode(m) }
    const goOrbit = () => { s.travel = null; s.vel.set(0, 0, 0); s.keys = {}; if (document.pointerLockElement === gl.domElement) document.exitPointerLock(); setMode('orbit') }
    // fly down to a point (or the front of a building) exactly like the planets: out of orbit, over an arc, onto your feet
    const land = (x: number, z: number, faceX: number, faceZ: number) => {
      for (const o of solids.current) { const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), min = o.r + 1.5; if (d < min) { const q = d > 1e-3 ? 1 / d : 1; x = o.x + (d > 1e-3 ? dx * q : 1) * min; z = o.z + (d > 1e-3 ? dz * q : 0) * min } }
      const rr = Math.hypot(x, z)
      if (rr > ISLAND_R - 5) { x *= (ISLAND_R - 5) / rr; z *= (ISLAND_R - 5) / rr }
      // we start where the camera is looking down from: straight below it, high up
      const start = new V().copy(camera.position)
      const x0 = THREE.MathUtils.clamp(start.x, -ISLAND_R + 5, ISLAND_R - 5), z0 = THREE.MathUtils.clamp(start.z, -ISLAND_R + 5, ISLAND_R - 5)
      const yaw1 = Math.atan2(-(faceX - x), -(faceZ - z))
      const dist = Math.hypot(x - x0, z - z0)
      s.x = x0; s.z = z0; s.alt = Math.max(30, start.y * 0.5); s.vy = 0; s.vel.set(0, 0, 0)
      s.travel = { t0: performance.now(), dur: Math.min(6, 2.4 + (dist / 400) * 2.2) * 1000, x0, z0, alt0: s.alt, x1: x, z1: z, yaw0: Math.atan2(x0, z0), yaw1 }
      s.pitch = -0.4
      setMode('travel')
    }
    const down = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      const k = e.key.toLowerCase()
      if (s.mode !== 'orbit' && (k === ' ' || k.startsWith('arrow'))) e.preventDefault()
      s.keys[k] = true
      if (e.repeat) return
      if (k === ' ') s.jumpBuf = 0.15
      if (k === 'e' && s.mode === 'walk' && s.near) cb.current.onEnter(s.near)
      if (k === 'o') { if (s.mode === 'orbit') cb.current.onExit(); else goOrbit() }
    }
    const up = (e: KeyboardEvent) => { s.keys[e.key.toLowerCase()] = false }
    const blur = () => { s.keys = {} }
    let drag = false, downAt = [0, 0]
    const pd = (e: PointerEvent) => { drag = true; downAt = [e.clientX, e.clientY] }
    const pu = () => { drag = false }
    const pm = (e: PointerEvent) => {
      const looking = (drag && e.buttons) || document.pointerLockElement === gl.domElement
      if (!looking) return
      if (s.mode === 'orbit') { s.oy -= e.movementX * 0.005; s.op = THREE.MathUtils.clamp(s.op + e.movementY * 0.005, -1.45, 1.45) }
      else {
        const k = document.pointerLockElement === gl.domElement ? 0.0022 : 0.005
        s.yaw -= e.movementX * k
        s.pitch = THREE.MathUtils.clamp(s.pitch - e.movementY * k, -1.2, 1.4)
      }
    }
    const wheel = (e: WheelEvent) => {
      if (s.mode !== 'orbit') return
      e.preventDefault()
      s.od = THREE.MathUtils.clamp(s.od * Math.exp(e.deltaY * 0.001), 350, 4200)
    }
    const pick = (cx: number, cy: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), camera)
      let hit: THREE.Vector3 | null = null
      const w = worldRef.current
      const surf = w ? ray.intersectObjects(w.children, true).find((h) => !(h.object as THREE.Sprite).isSprite && h.point.y > -2) : undefined
      if (surf) hit = surf.point.clone()
      else { const t = -ray.ray.origin.y / ray.ray.direction.y; if (t > 0) hit = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t) }
      if (!hit) return
      if (Math.hypot(hit.x, hit.z) > ISLAND_R) { const q = (ISLAND_R - 6) / Math.hypot(hit.x, hit.z); hit.x *= q; hit.z *= q }
      // a click on a streamer's building takes you to its front door
      const b = solids.current.filter((o) => o.stream && Math.hypot(hit!.x - o.x, hit!.z - o.z) < o.r * 1.5 + 6).sort((p, q) => Math.hypot(hit!.x - p.x, hit!.z - p.z) - Math.hypot(hit!.x - q.x, hit!.z - q.z))[0]
      if (b) {
        const d = Math.hypot(b.x, b.z) || 1
        land(b.x - (b.x / d) * (b.r + 14), b.z - (b.z / d) * (b.r + 14), b.x, b.z)
      } else land(hit.x, hit.z, hit.x + (hit.x === 0 && hit.z === 0 ? 0 : -hit.x), hit.z + (hit.x === 0 && hit.z === 0 ? -1 : -hit.z))
    }
    const click = (e: MouseEvent) => {
      if (s.mode === 'orbit') { if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 14) pick(e.clientX, e.clientY); return }
      if (s.mode !== 'walk' || document.pointerLockElement === gl.domElement) return
      try { Promise.resolve(gl.domElement.requestPointerLock()).catch(() => {}) } catch { /* drag-to-look still works */ }
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); window.addEventListener('pointerup', pu); window.addEventListener('pointermove', pm)
    window.addEventListener('island:orbit', goOrbit)
    const goto = (e: Event) => { const d = (e as CustomEvent<number[]>).detail; if (Array.isArray(d)) land(d[0], d[1], 0, 0) }
    window.addEventListener('island:goto', goto)
    gl.domElement.addEventListener('pointerdown', pd); gl.domElement.addEventListener('wheel', wheel, { passive: false }); gl.domElement.addEventListener('click', click)
    if (import.meta.env.DEV) (window as unknown as { __island: unknown }).__island = { state: s, camera, scene, land, solids }
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('pointerup', pu); window.removeEventListener('pointermove', pm)
      window.removeEventListener('island:orbit', goOrbit)
      window.removeEventListener('island:goto', goto)
      gl.domElement.removeEventListener('pointerdown', pd); gl.domElement.removeEventListener('wheel', wheel); gl.domElement.removeEventListener('click', click)
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock()
      scene.background = null
    }
  }, [camera, gl, scene, solids])

  const t = useMemo(() => ({ want: new V(), cam: new V(), head: new V(), F: new V(), right: new V(), m: new THREE.Matrix4(), up: new V(0, 1, 0), a: new V() }), [])
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1), s = state.current, k = s.keys
    s.jumpBuf = Math.max(0, s.jumpBuf - dt)

    if (s.mode === 'orbit') {
      const cp = Math.cos(s.op)
      t.cam.set(cp * Math.sin(s.oy), Math.sin(s.op), cp * Math.cos(s.oy)).multiplyScalar(s.od)
      camera.position.lerp(t.cam, 1 - Math.exp(-6 * dt))
      s.look.lerp(t.a.set(0, -40, 0), 1 - Math.exp(-6 * dt))
      camera.lookAt(s.look)
      if (avatar.current) avatar.current.visible = false
      if (s.near) { s.near = null; cb.current.onNear(null) }
    } else {
      if (s.mode === 'travel' && s.travel) {
        const tr = s.travel
        const raw = Math.min(1, (performance.now() - tr.t0) / tr.dur)
        const e = raw * raw * (3 - 2 * raw)
        s.x = THREE.MathUtils.lerp(tr.x0, tr.x1, e); s.z = THREE.MathUtils.lerp(tr.z0, tr.z1, e)
        s.alt = THREE.MathUtils.lerp(tr.alt0, 0, e) + 90 * Math.sin(Math.PI * e)
        // turn to face where we are going to land
        let dy = tr.yaw1 - tr.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        s.yaw = tr.yaw0 + dy * e
        s.pitch = THREE.MathUtils.lerp(-0.4, -0.25, e)
        s.vel.set(0, 0, 0); s.walk = 0.6
        if (raw >= 1) { s.travel = null; s.alt = 0; s.vy = 0; s.mode = 'walk'; cb.current.onMode('walk') }
      } else {
        // ---- walking: the planets' own rules ----
        t.F.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw))
        const f = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
        const sd = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
        const turn = (k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0)
        if (turn) { s.yaw += turn * 1.8 * dt; t.F.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)) }
        t.right.crossVectors(t.F, t.up).normalize()
        t.want.set(0, 0, 0).addScaledVector(t.F, f).addScaledVector(t.right, sd)
        if (t.want.lengthSq() > 0) t.want.normalize().multiplyScalar(k['shift'] ? RUN_SPEED : WALK_SPEED)
        const grounded = s.alt <= 0.001 && s.vy <= 0
        s.coyote = grounded ? 0.1 : s.coyote - dt
        const rate = grounded ? (t.want.lengthSq() > 0 ? 11 : 15) : (t.want.lengthSq() > 0 ? 3.5 : 0.6)
        s.vel.lerp(t.want, 1 - Math.exp(-rate * dt))
        const speed = s.vel.length()
        if (speed > 0.05) {
          let nx = s.x + s.vel.x * dt, nz = s.z + s.vel.z * dt
          for (const o of solids.current) {
            const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), min = o.r + 0.6
            if (d < min && d > 1e-4) { nx = o.x + (dx / d) * min; nz = o.z + (dz / d) * min }
          }
          const rr = Math.hypot(nx, nz) // the island has an edge, and you cannot walk off it
          if (rr > ISLAND_R - 4) { nx *= (ISLAND_R - 4) / rr; nz *= (ISLAND_R - 4) / rr }
          s.x = nx; s.z = nz
        } else if (t.want.lengthSq() === 0) s.vel.set(0, 0, 0)
        if (s.jumpBuf > 0 && s.coyote > 0) { s.vy = JUMP_SPEED; s.coyote = 0; s.jumpBuf = 0 }
        s.vy -= GRAVITY * dt
        s.alt += s.vy * dt
        if (s.alt <= 0) { s.alt = 0; if (s.vy < 0) s.vy = 0 }
        s.walk += (Math.min(1, speed / 4) - s.walk) * (1 - Math.exp(-10 * dt))
      }
      t.F.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw))
      motion.current.alt = s.alt
      motion.current.vel.copy(s.vel)
      const av = avatar.current
      if (av) {
        av.visible = true
        av.position.set(s.x, s.alt, s.z)
        t.right.crossVectors(t.F, t.up).normalize()
        t.m.makeBasis(t.right, t.up, t.a.copy(t.F).negate())
        av.quaternion.setFromRotationMatrix(t.m)
      }
      // ---- camera: third person, behind and above, exactly as on the planets ----
      let dist = s.mode === 'travel' ? 7 + s.alt * 0.15 : 7
      const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch)
      if (sp > 0.02) dist = Math.min(dist, Math.max(0.6, (s.alt + 1.7 - 0.5) / sp))
      t.head.set(s.x, s.alt + 1.7, s.z)
      t.cam.copy(t.head).addScaledVector(t.F, -cp * dist).addScaledVector(t.up, -sp * dist)
      if (t.cam.y < 0.5) t.cam.y = 0.5
      if (av && s.mode === 'walk') av.visible = dist > 2.4
      camera.position.lerp(t.cam, 1 - Math.exp(-14 * dt))
      s.look.copy(t.head)
      camera.lookAt(t.head)
      // ---- which building are we standing next to? ----
      const now = performance.now()
      if (s.mode === 'walk' && now - s.nearAt > 120) {
        s.nearAt = now
        let near: Stream | null = null, best = 16
        for (const o of solids.current) { if (!o.stream) continue; const d = Math.hypot(s.x - o.x, s.z - o.z) - o.r; if (d < best) { best = d; near = o.stream } }
        if (near?.login !== s.near?.login) { s.near = near; cb.current.onNear(near) }
      } else if (s.mode !== 'walk' && s.near) { s.near = null; cb.current.onNear(null) }
    }
    if (s.mode !== 'orbit') peopleRef.current.sendMove(t.cam.set(s.x, 1000, s.z).normalize(), t.head.set(t.F.x, 0, t.F.z).normalize(), s.alt)
    moveTrain(anim.current, st.clock.elapsedTime)
    // ---- name tags: readable up close, and the busiest channels stay readable from orbit ----
    anim.current.labels.forEach((l, i) => {
      const d = camera.position.distanceTo(l.at)
      const mat = l.s.material as THREE.SpriteMaterial
      const far = d > 460
      mat.opacity = far ? 0.95 : THREE.MathUtils.clamp((460 - d) / 120, 0, 1)
      const grow = far ? THREE.MathUtils.clamp(d / 320, 1, 5.5) : 1
      l.s.scale.set(30 * grow, 9.4 * grow, 1)
    })
  })

  return (
    <>
      <hemisphereLight args={['#bcd0ff', '#6a3a30', 1.5]} />
      <directionalLight position={[300, 420, 200]} intensity={2.6} color="#ffe6c8" />
      <ambientLight intensity={0.35} />
      <points geometry={starGeo}><pointsMaterial vertexColors size={2.2} sizeAttenuation={false} fog={false} /></points>
      <mesh geometry={geo}><meshStandardMaterial vertexColors flatShading roughness={0.95} side={THREE.DoubleSide} /></mesh>
      {world && <primitive object={world} />}
      <group ref={avatar} visible={false}><BlockyCharacter key={`${appearance.skin}:${appearance.top}:${appearance.bottom}:${appearance.face}:${appearance.hat}:${appearance.chain}`} motion={motion} appearance={appearance} /><IslandBubble world={people} id="me" /></group>
      <IslandPeople world={people} />
    </>
  )
}

/** A speech bubble that floats over whoever is talking (the id of the speaker, or "me"). */
function IslandBubble({ world, id }: { world: WorldPeople; id: string }) {
  const sprite = useRef<THREE.Sprite>(null)
  const blank = useMemo(() => new THREE.CanvasTexture(document.createElement('canvas')), [])
  useFrame(() => {
    const sp = sprite.current
    if (!sp) return
    const b = world.bubbles.current.get(id)
    if (!b || b.until < performance.now() || world.muted.current.has(id)) { sp.visible = false; return }
    const tex = bubbleTexture(b.text)
    const m = sp.material as THREE.SpriteMaterial
    if (m.map !== tex) { m.map = tex; m.needsUpdate = true }
    const W = 5.4, sy = W * (160 / 512)
    sp.visible = true
    sp.center.set(0.5, 1)
    sp.position.set(0, 3.1 + (tex.userData.h as number) * sy, 0)
    sp.scale.set(W, sy, 1)
  })
  return <sprite ref={sprite} visible={false} raycast={() => null}><spriteMaterial map={blank} transparent depthWrite={false} fog={false} /></sprite>
}

/** One other person on the island: walks where they walk, with a name tag and their chat bubbles. */
function IslandPlayer({ r, world }: { r: Resident; world: WorldPeople }) {
  const group = useRef<THREE.Group>(null)
  const name = useRef<THREE.Sprite>(null)
  const motion = useRef<CharacterMotion>({ alt: 0, vel: new V() })
  const t = useMemo(() => ({ m: new THREE.Matrix4(), up: new V(0, 1, 0), F: new V(), right: new V(), target: new V(), last: new V(), a: new V() }), [])
  useFrame((_, dtRaw) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(dtRaw, 0.1), k = 1 - Math.exp(-10 * dt)
    // the server keeps everyone as a direction; on the island we sent (x, 1000, z), so this undoes that
    const y = Math.max(1e-3, r.tP.y)
    t.target.set((r.tP.x / y) * 1000, 0, (r.tP.z / y) * 1000)
    g.position.lerp(t.target, k)
    const hopUntil = world.hops.current.get(r.id) ?? 0
    const hop = hopUntil > performance.now() ? Math.abs(Math.sin(performance.now() / 160)) * 0.9 : 0
    g.position.y = r.tAlt + hop
    motion.current.alt = r.tAlt + hop
    motion.current.vel.copy(g.position).sub(t.last).setY(0).divideScalar(Math.max(dt, 1e-3))
    t.last.copy(g.position)
    t.F.set(r.tF.x, 0, r.tF.z)
    if (t.F.lengthSq() > 1e-6) {
      t.F.normalize()
      t.right.crossVectors(t.F, t.up).normalize()
      t.m.makeBasis(t.right, t.up, t.a.copy(t.F).negate())
      g.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(t.m), k)
    }
    if (name.current) {
      const tex = nameTexture(r.name)
      const m = name.current.material as THREE.SpriteMaterial
      if (m.map !== tex) { m.map = tex; m.needsUpdate = true }
    }
  })
  return (
    <group ref={group} position={[(r.tP.x / Math.max(1e-3, r.tP.y)) * 1000, 0, (r.tP.z / Math.max(1e-3, r.tP.y)) * 1000]}>
      <BlockyCharacter motion={motion} appearance={r.look} />
      <sprite ref={name} position={[0, 2.55, 0]} scale={[5.2, 1.3, 1]} raycast={() => null}><spriteMaterial transparent depthWrite={false} fog={false} /></sprite>
      <IslandBubble world={world} id={r.id} />
    </group>
  )
}

/** Everybody else on the island right now. */
function IslandPeople({ world }: { world: WorldPeople }) {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    const tick = () => setIds((old) => {
      const next = [...world.residents.current.keys()].filter((id) => !world.muted.current.has(id)).slice(0, 60)
      return old.length === next.length && old.every((x, i) => x === next[i]) ? old : next
    })
    tick()
    const t = setInterval(tick, 600)
    return () => clearInterval(t)
  }, [world])
  return <>{ids.map((id) => { const r = world.residents.current.get(id); return r ? <IslandPlayer key={id} r={r} world={world} /> : null })}</>
}
