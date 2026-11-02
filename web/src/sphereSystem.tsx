import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Stream } from './api'
import type { PlanetData } from './sphereLayout'
import { IslandPreview } from './sphereIsland'

const V = THREE.Vector3
export const SUN_R = 1800
const ORBIT0 = 7600
const ORBIT_STEP = 3400
/** Planets are drawn this much bigger than their walkable size, so they read from across the system. */
const VIS = 2.9

/** Orbit radius of the i-th planet. Orbits are spaced by the planets' own sizes, so big planets never overlap their neighbours. */
let ORBITS: number[] = []
export const orbitOf = (i: number) => ORBITS[i] ?? ORBIT0 + i * ORBIT_STEP
export function setOrbits(radii: number[], home = -1) {
  ORBITS = []
  let prev = -1
  radii.forEach((r, i) => {
    if (i === home) { ORBITS.push(2100 * 1.15 + r * VIS * 1.3 + 700); return } // your own planet circles close in, near the island
    ORBITS.push(prev < 0 ? SUN_R * 2.4 + r * VIS * 1.3 : ORBITS[prev] + (radii[prev] + r) * VIS * 1.3 + 1200)
    prev = i
  })
}
export const outerOrbit = () => ORBITS.reduce((m, o) => Math.max(m, o), 0)
const visOf = (_i: number) => VIS
/** Where a planet is at a given time (they circle the sun on slightly different tilts, slowly). */
export function planetPos(i: number, t: number, out: THREE.Vector3) {
  const a = orbitOf(i)
  const th = i * 0.93 + t * (0.022 / (1 + i * 0.32))
  return out.set(Math.cos(th) * a, Math.sin(th * 1.0 + i) * a * 0.025, Math.sin(th) * a)
}

/** A small version of a planet with exactly the land it has when you walk on it (heights exaggerated so ranges read from afar). */
export function miniPlanet(p: PlanetData) {
  const { layout, theme } = p
  const R = layout.R, T = layout.terrain
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(R, 24)
  geo.deleteAttribute('normal')
  geo.deleteAttribute('uv')
  geo = mergeVertices(geo, 1e-3)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const d = new V(), c = new THREE.Color(), city = new THREE.Color(theme.palette.grassA).lerp(new THREE.Color(theme.houses[0]), 0.55)
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize()
    const e = T.elevation(d)
    const r = R + Math.max(e, 0) * 1.1 + Math.min(e, 0) * 0.5
    pos.setXYZ(i, d.x * r, d.y * r, d.z * r)
    T.color(d, e, c)
    if (e >= 0) c.lerp(city, T.cityMask(d) * 0.85)
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const flat = geo.toNonIndexed()
  flat.computeVertexNormals()
  return flat
}

const labelCache = new Map<string, THREE.CanvasTexture>()
function labelTexture(name: string, sub: string, color: string) {
  const key = name + sub + color
  let t = labelCache.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = 512; c.height = 160
  const g = c.getContext('2d')!
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 12
  g.strokeStyle = 'rgba(6,6,16,0.9)'
  g.font = '700 70px system-ui, sans-serif'
  g.strokeText(name, 256, 62, 500)
  g.fillStyle = color
  g.fillText(name, 256, 62, 500)
  g.font = '500 36px system-ui, sans-serif'
  g.lineWidth = 8
  g.strokeText(sub, 256, 126, 500)
  g.fillStyle = '#e8e8f2'
  g.fillText(sub, 256, 126, 500)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  labelCache.set(key, t)
  return t
}

function sunGlow() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,240,200,1)')
  grad.addColorStop(0.25, 'rgba(255,200,110,0.55)')
  grad.addColorStop(1, 'rgba(255,160,60,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

type Props = {
  planets: PlanetData[]
  /** Start close to this planet and zoom out (we just came from it). */
  from: number | null
  /** Fly to this planet and land on it. */
  fly: number | null
  onPick: (i: number) => void
  onLand: (i: number, entryDir: THREE.Vector3) => void
  onPickStream: (s: Stream) => void
  /** Click the island itself, or arrive at it after flying there to land: go down into it. */
  onPickIsland?: () => void
  onLandIsland?: () => void
  elite: Stream[]
  selectedLogin?: string
}

export function SystemScene({ planets, from, fly, onPick, onLand, onPickStream, onPickIsland, onLandIsland, elite, selectedLogin }: Props) {
  setOrbits(planets.map((p) => p.layout.R), planets.findIndex((p) => p.theme.id === 'home'))
  const sysOd = outerOrbit() * 2.2
  const { camera, gl } = useThree()
  const group = useRef<THREE.Group>(null)
  const planetRefs = useRef<(THREE.Group | null)[]>([])
  const spinRefs = useRef<(THREE.Group | null)[]>([])
  const moonRefs = useRef<(THREE.Mesh | null)[]>([])
  const labelRefs = useRef<(THREE.Sprite | null)[]>([])
  const cb = useRef({ onPick, onLand, onPickStream, onPickIsland, onLandIsland })
  cb.current = { onPick, onLand, onPickStream, onPickIsland, onLandIsland }
  const C = useRef({ oy: 0.8, op: 0.62, od: sysOd, tgt: new V(), mode: 'free' as 'free' | 'fly' | 'out', idx: -1, t0: 0, landed: false })
  const tmp = useMemo(() => ({ p: new V(), q: new V(), cam: new V() }), [])
  const geos = useMemo(() => planets.map(miniPlanet), [planets])
  const glow = useMemo(sunGlow, [])
  const moonGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])
  const rings = useMemo(() => planets.map((_, i) => {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 200; k++) { const th = (k / 200) * Math.PI * 2; pts.push(new V(Math.cos(th) * orbitOf(i), 0, Math.sin(th) * orbitOf(i))) }
    return new THREE.BufferGeometry().setFromPoints(pts)
  }), [planets])
  const stars = useMemo(() => {
    const a = new Float32Array(4000 * 3)
    for (let i = 0; i < 4000; i++) {
      const v = new V(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(260000)
      a.set([v.x, v.y, v.z], i * 3)
    }
    return a
  }, [])

  // the camera for this scene sees very far
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.near = 20; cam.far = 700000; cam.fov = 50
    cam.up.set(0, 1, 0)
    cam.updateProjectionMatrix()
    const c = C.current
    if (from !== null && planets[from] && planets[from].theme.id !== 'home') {
      planetPos(from, performance.now() / 1000, c.tgt)
      c.od = planets[from].layout.R * visOf(from) * 3.4
      c.mode = 'out'
      c.t0 = performance.now()
    }
    return () => { document.body.style.cursor = 'auto' }
  }, [camera, from, planets])

  useEffect(() => {
    if (fly === null) return
    const c = C.current
    c.mode = 'fly'; c.idx = fly; c.t0 = performance.now(); c.landed = false
  }, [fly])

  useEffect(() => {
    const canvas = gl.domElement
    let drag = false
    const pd = () => { drag = true }
    const pu = () => { drag = false }
    const pm = (e: PointerEvent) => {
      if (!drag || !e.buttons || C.current.mode !== 'free') return
      C.current.oy -= e.movementX * 0.005
      C.current.op = THREE.MathUtils.clamp(C.current.op + e.movementY * 0.005, -1.4, 1.4)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (C.current.mode !== 'free') return
      C.current.od = THREE.MathUtils.clamp(C.current.od * Math.exp(e.deltaY * 0.0012), 3000, sysOd * 1.5)
    }
    canvas.addEventListener('pointerdown', pd)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointermove', pm)
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointermove', pm)
      canvas.removeEventListener('wheel', wheel)
    }
  }, [gl])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const t = state.clock.elapsedTime + 1000
    const c = C.current
    planets.forEach((p, i) => {
      const g = planetRefs.current[i]
      if (!g) return
      planetPos(i, t, g.position)
      const spin = spinRefs.current[i]
      if (spin) spin.rotation.y = t * 0.05 * (i % 2 ? 1 : -1)
    })
    // a few moons
    moonRefs.current.forEach((m, k) => {
      if (!m) return
      const pi = [0, 3, 5][k]
      const R = planets[pi].layout.R
      const a = t * (0.12 + k * 0.03)
      const host = planetRefs.current[pi]!.position
      m.position.set(host.x + Math.cos(a) * R * VIS * 2.4, host.y + Math.sin(a * 0.7) * R * VIS * 0.5, host.z + Math.sin(a) * R * VIS * 2.4)
      m.scale.setScalar(R * VIS * 0.22)
    })

    // camera
    if (c.mode === 'out') {
      // we just left a planet: slide the view back out to the whole system
      const k = 1 - Math.exp(-1.6 * dt)
      c.tgt.lerp(tmp.p.set(0, 0, 0), k)
      c.od = THREE.MathUtils.lerp(c.od, sysOd, k)
      if (c.od > sysOd * 0.93) c.mode = 'free'
    } else if (c.mode === 'fly' && (c.idx === -1 || c.idx === -2)) {
      // fly to the island at the centre (-2: and then go down into it, like landing on a planet)
      c.tgt.lerp(tmp.p.set(0, 300, 0), 1 - Math.exp(-3.2 * dt))
      c.od = THREE.MathUtils.lerp(c.od, c.idx === -2 ? 3600 : 5200, 1 - Math.exp(-2.4 * dt))
      const goal = c.idx === -2 ? 3600 : 5200
      if (performance.now() - c.t0 > 1500 && Math.abs(c.od - goal) < 150) {
        if (c.idx === -2 && !c.landed) { c.landed = true; cb.current.onLandIsland?.() }
        else if (c.idx === -1) c.mode = 'free'
      }
    } else if (c.mode === 'fly' && c.idx >= 0) {
      const g = planetRefs.current[c.idx]!
      const R = planets[c.idx].layout.R * visOf(c.idx)
      c.tgt.lerp(g.position, 1 - Math.exp(-3.2 * dt))
      c.od = THREE.MathUtils.lerp(c.od, R * 3.3, 1 - Math.exp(-2.4 * dt))
      const elapsed = performance.now() - c.t0
      if (!c.landed && elapsed > 1500 && c.od < R * 3.9 && c.tgt.distanceTo(g.position) < R * 0.4) {
        c.landed = true
        tmp.q.copy(camera.position).sub(g.position).normalize()
        cb.current.onLand(c.idx, tmp.q.clone())
      }
    }
    const cp = Math.cos(c.op)
    tmp.cam.set(cp * Math.sin(c.oy), Math.sin(c.op), cp * Math.cos(c.oy)).multiplyScalar(c.od).add(c.tgt)
    camera.position.lerp(tmp.cam, c.mode === 'free' ? 1 - Math.exp(-10 * dt) : 1)
    camera.lookAt(c.tgt)

    // labels keep the same apparent size, fade as you get close
    labelRefs.current.forEach((s, i) => {
      const g = planetRefs.current[i]
      if (!s || !g) return
      const d = camera.position.distanceTo(g.position)
      const R = planets[i].layout.R * visOf(i)
      const w = d * 0.1
      s.position.copy(g.position).add(tmp.p.set(0, R * 1.5 + w * 0.12, 0))
      s.scale.set(w, w * 0.3125, 1)
      ;(s.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp((d - R * 4) / (R * 4), 0, 1)
    })
  })

  return (
    <group ref={group}>
      <color attach="background" args={['#04040c']} />
      <ambientLight intensity={0.55} />
      <pointLight position={[0, 600, 0]} intensity={4.2} decay={0} color="#e8f4ff" />
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /></bufferGeometry>
        <pointsMaterial color="#ffffff" size={1.7} sizeAttenuation={false} fog={false} />
      </points>

      <IslandPreview elite={elite} onPick={() => cb.current.onPickIsland?.()} />

      {planets.map((p, i) => p.theme.id === 'home' ? null : (
        <group key={p.theme.id}>
          <lineLoop geometry={rings[i]} raycast={() => null}>
            <lineBasicMaterial color={p.theme.color} transparent opacity={0.28} />
          </lineLoop>
          <group ref={(el) => { planetRefs.current[i] = el }} scale={visOf(i)}>
            <group ref={(el) => { spinRefs.current[i] = el }}>
              <mesh
                geometry={geos[i]}
                onClick={(e) => { e.stopPropagation(); cb.current.onPick(i) }}
                onPointerOver={() => { document.body.style.cursor = 'pointer' }}
                onPointerOut={() => { document.body.style.cursor = 'auto' }}
              >
                <meshStandardMaterial vertexColors roughness={1} />
              </mesh>
            </group>
            <mesh raycast={() => null}>
              <sphereGeometry args={[p.layout.R * 1.004, 64, 40]} />
              <meshStandardMaterial color={p.theme.water} transparent opacity={0.85} roughness={0.25} />
            </mesh>
            <mesh raycast={() => null}>
              <sphereGeometry args={[p.layout.R * 1.12, 48, 32]} />
              <meshBasicMaterial color={p.theme.atmosphere} transparent opacity={0.13} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
            </mesh>
          </group>
          <sprite ref={(el) => { labelRefs.current[i] = el }} raycast={() => null}>
            <spriteMaterial map={labelTexture(p.theme.name, `${p.layout.plots.length.toLocaleString()} live streams`, p.theme.color)} transparent depthWrite={false} />
          </sprite>
        </group>
      ))}

      {[0, 3, 5].map((_, k) => (
        <mesh key={k} ref={(el) => { moonRefs.current[k] = el }} geometry={moonGeo} raycast={() => null}>
          <meshStandardMaterial color="#b9bcc6" flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
