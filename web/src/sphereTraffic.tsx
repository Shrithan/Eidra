import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { RoadNet } from './sphereCity'
import type { SphereLayout } from './sphereLayout'
import { useBakedSet } from './sphereModels'

const V = THREE.Vector3
const veh = (name: string) => `/models/vehicles/${name}.gltf`
const COLORS = ['red', 'blue', 'yellow', 'green', 'grey', 'orange']
const CARS = [1, 2, 3].flatMap((v) => COLORS.map((c) => veh(`car-v${v}-${c}`)))
const BUSES = ['big', 'small'].flatMap((s) => ['red', 'blue', 'yellow', 'green'].map((c) => veh(`bus-${s}-${c}`)))
const TRUCKS = [1, 2, 3].flatMap((v) => ['red', 'blue', 'orange', 'green'].map((c) => veh(`truck-v${v}-${c}`)))
const EMERGENCY = ['ambulance-1', 'fire-engine-1', 'police-1'].map((n) => veh(`emergency-${n}`))
const KINDS = [
  { list: CARS, n: 90, speed: [9, 15], length: 4.3 },
  { list: BUSES, n: 10, speed: [7, 10], length: 10 },
  { list: TRUCKS, n: 10, speed: [6, 10], length: 8 },
  { list: EMERGENCY, n: 4, speed: [12, 18], length: 5.5 },
]
const SPAWN_RANGE = 360 // metres: traffic lives around you; a car that drifts further away is moved onto a street near you

const PHASE = 9 // seconds of green for each direction
const STOP = 11 // metres before the junction where cars wait
const vhash = (i: number) => (i * 0.6180339887) % 1
/** 0 for roads running east-west at a junction, 1 for north-south, so opposite roads share a light. */
export function approachGroup(v: THREE.Vector3, toward: THREE.Vector3) {
  const east = new V(0, 1, 0).cross(v)
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0).cross(v)
  east.normalize()
  const north = new V().crossVectors(v, east)
  const u = toward.clone().sub(v)
  const ang = Math.atan2(u.dot(north), u.dot(east))
  return ((Math.round(ang / (Math.PI / 2)) % 2) + 2) % 2
}
export const isGreen = (vi: number, group: number, time: number) => group === Math.floor(time / PHASE + vhash(vi) * 2) % 2

type Rider = { a: number; b: number; t: number; speed: number; url: string; slot: number; len: number; live: boolean }

/** Cars, buses, trucks and emergency vehicles driving the streets around the camera, following the ground's own height. */
export function Traffic({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const R = layout.R
  const { camera } = useThree()
  const urls = useMemo(() => [...CARS, ...BUSES, ...TRUCKS, ...EMERGENCY], [])
  const set = useBakedSet(urls, Math.PI / 2) // Kenney vehicles are long along +X and face +X; this turns the nose to -Z
  const grid = useMemo(() => {
    const cell = 160
    const cells = new Map<string, number[]>()
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`
    net.verts.forEach((v, i) => {
      if (!net.valid[i] || !net.adj[i].length) return
      const k = key(Math.floor(v.x * R / cell), Math.floor(v.y * R / cell), Math.floor(v.z * R / cell))
      if (!cells.has(k)) cells.set(k, [])
      cells.get(k)!.push(i)
    })
    return { cell, cells, key }
  }, [net, R])
  const sim = useMemo(() => {
    const counts = new Map<string, number>()
    const riders: Rider[] = []
    for (const k of KINDS) for (let i = 0; i < k.n; i++) {
      const url = k.list[Math.floor(Math.random() * k.list.length)]
      const slot = counts.get(url) ?? 0
      counts.set(url, slot + 1)
      riders.push({ a: 0, b: 0, t: 0, speed: k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]), url, slot, len: k.length, live: false })
    }
    return { riders, counts }
  }, [])
  const groups = useMemo(() => new Map<number, number[]>(), [net]) // junction -> light group of each approach, in net.adj order
  const groupsOf = (vi: number) => {
    let g = groups.get(vi)
    if (!g) { g = net.adj[vi].map((n) => approachGroup(net.verts[vi], net.verts[n])); groups.set(vi, g) }
    return g
  }
  const clock = useRef(0)
  const refs = useRef<Map<string, THREE.InstancedMesh[]>>(new Map())
  const tmp = useMemo(() => ({ A: new V(), B: new V(), p: new V(), up: new V(), dir: new V(), right: new V(), back: new V(), d: new V(), m: new THREE.Matrix4(), s: new V(), far: new THREE.Matrix4().makeScale(0, 0, 0) }), [])

  const respawn = (c: Rider) => {
    const cx = Math.floor(camera.position.x / grid.cell), cy = Math.floor(camera.position.y / grid.cell), cz = Math.floor(camera.position.z / grid.cell)
    const pool: number[] = []
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) for (let z = cz - 2; z <= cz + 2; z++) {
      const l = grid.cells.get(grid.key(x, y, z))
      if (l) for (const v of l) pool.push(v)
    }
    if (!pool.length) { c.live = false; return }
    const a = pool[Math.floor(Math.random() * pool.length)]
    const nb = net.adj[a]
    c.a = a; c.b = nb[Math.floor(Math.random() * nb.length)]; c.t = Math.random(); c.live = true
  }

  useFrame((_, dtRaw) => {
    if (!set) return
    const dt = Math.min(dtRaw, 0.1)
    clock.current += dt
    const close = camera.position.length() - R < 700
    // who is on which street, so a car can queue behind the one in front of it
    const lanes = new Map<number, Rider[]>()
    for (const o of sim.riders) if (o.live) { const k = o.a * 1e6 + o.b; const l = lanes.get(k); if (l) l.push(o); else lanes.set(k, [o]) }
    for (const c of sim.riders) {
      if (!close) { c.live = false }
      else if (!c.live) respawn(c)
      const metas = refs.current.get(c.url) ?? []
      if (!c.live) { for (const mesh of metas) if (mesh) mesh.setMatrixAt(c.slot, tmp.far); continue }
      tmp.A.copy(net.verts[c.a]).multiplyScalar(R); tmp.B.copy(net.verts[c.b]).multiplyScalar(R)
      let len = tmp.A.distanceTo(tmp.B) || 1
      const oldT = c.t
      c.t += (c.speed * dt) / len
      // queue: never drive into the car ahead on this street
      {
        const edgeLen = Math.max(1, len)
        let ahead: Rider | null = null
        for (const o of lanes.get(c.a * 1e6 + c.b) ?? []) if (o !== c && o.t > oldT && (!ahead || o.t < ahead.t)) ahead = o
        if (ahead) {
          const limit = ahead.t - (ahead.len / 2 + c.len / 2 + 1.8) / edgeLen
          if (c.t > limit) c.t = Math.max(oldT, limit)
        }
      }
      // obey the junction ahead: stop at the line if the light for this approach is red
      if (net.adj[c.b].length >= 3) {
        const lineT = 1 - STOP / len
        if (oldT <= lineT && c.t > lineT) {
          const gi = net.adj[c.b].indexOf(c.a)
          if (gi >= 0 && !isGreen(c.b, groupsOf(c.b)[gi], performance.now() / 1000)) c.t = lineT
        }
      }
      while (c.t >= 1) {
        const opts = net.adj[c.b].filter((n) => n !== c.a)
        const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : c.a
        // wait at the junction while the street ahead has no room at its start
        const nextLen = Math.max(1, net.verts[c.b].distanceTo(net.verts[next]) * R)
        if ((lanes.get(c.b * 1e6 + next) ?? []).some((o) => o !== c && o.t < (o.len / 2 + c.len / 2 + 2) / nextLen)) { c.t = 0.9995; break }
        c.t -= 1
        c.a = c.b; c.b = next
        tmp.A.copy(net.verts[c.a]).multiplyScalar(R); tmp.B.copy(net.verts[c.b]).multiplyScalar(R)
        len = tmp.A.distanceTo(tmp.B) || 1
      }
      tmp.p.copy(tmp.A).lerp(tmp.B, c.t)
      if (tmp.p.distanceTo(camera.position) > SPAWN_RANGE * 1.4) { respawn(c); if (!c.live) continue; tmp.A.copy(net.verts[c.a]).multiplyScalar(R); tmp.B.copy(net.verts[c.b]).multiplyScalar(R); tmp.p.copy(tmp.A).lerp(tmp.B, c.t) }
      tmp.up.copy(tmp.p).normalize()
      tmp.dir.copy(tmp.B).sub(tmp.A).normalize()
      tmp.right.crossVectors(tmp.dir, tmp.up).normalize()
      tmp.d.copy(tmp.p).addScaledVector(tmp.right, 2.6).normalize() // drive on the right
      const h = Math.max(layout.ground(tmp.d), 0.35) + 0.22 // the road ribbon sits 0.16 to 0.28 above the ground
      tmp.p.copy(tmp.d).multiplyScalar(R + h)
      tmp.up.copy(tmp.d)
      tmp.right.crossVectors(tmp.dir, tmp.up).normalize()
      tmp.back.crossVectors(tmp.right, tmp.up).negate().normalize()
      tmp.m.makeBasis(tmp.right, tmp.up, tmp.back)
      const s = c.len / Math.max(0.01, set.get(c.url)!.native.z)
      tmp.m.scale(tmp.s.set(s, s, s))
      tmp.m.setPosition(tmp.p)
      for (const mesh of metas) if (mesh) mesh.setMatrixAt(c.slot, tmp.m)
    }
    for (const arr of refs.current.values()) for (const mesh of arr) if (mesh) mesh.instanceMatrix.needsUpdate = true
  })

  if (import.meta.env.DEV) Object.assign(window, { __net: net, __riders: sim.riders })
  if (!set) return null
  return (
    <group>
      {[...sim.counts.entries()].map(([url, n]) => (
        set.get(url)!.parts.map((part, pi) => (
          <instancedMesh key={url + pi} ref={(el) => {
            const a = refs.current.get(url) ?? []
            a[pi] = el as THREE.InstancedMesh
            refs.current.set(url, a)
          }} args={[part.geometry, part.material, n]} frustumCulled={false} raycast={() => null} />
        ))
      ))}
    </group>
  )
}


// ------------------------------------------------------------------------------------------------

type Sig = { m: THREE.Matrix4; vi: number; group: number }
const MAX_SIGNALS = 360

/** Traffic lights on the corners of the junctions near you. Cars stop at the line when theirs is red. */
export function Signals({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const R = layout.R
  const { camera } = useThree()
  const junctions = useMemo(() => net.verts.map((_, i) => i).filter((i) => net.valid[i] && net.adj[i].length >= 3), [net])
  const geo = useMemo(() => {
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)
    return {
      pole: box(0.3, 5.6, 0.3, 0, 2.8, 0),
      head: box(0.95, 2.5, 0.75, 0, 5.9, 0),
      red: box(0.55, 0.55, 0.12, 0, 6.5, 0.42),
      green: box(0.55, 0.55, 0.12, 0, 5.3, 0.42),
    }
  }, [])
  const refs = { pole: useRef<THREE.InstancedMesh>(null), head: useRef<THREE.InstancedMesh>(null), red: useRef<THREE.InstancedMesh>(null), green: useRef<THREE.InstancedMesh>(null) }
  const active = useRef<Sig[]>([])
  const last = useRef(''), clock = useRef(0)
  const tmp = useMemo(() => ({ v: new V(), n: new V(), t: new V(), r: new V(), up: new V(), p: new V(), z: new V(), x: new V(), c: new THREE.Color() }), [])
  const ON_R = useMemo(() => new THREE.Color(1.6, 0.15, 0.1), []), OFF_R = useMemo(() => new THREE.Color(0.18, 0.04, 0.04), [])
  const ON_G = useMemo(() => new THREE.Color(0.2, 1.4, 0.35), []), OFF_G = useMemo(() => new THREE.Color(0.03, 0.14, 0.05), [])

  useFrame((_, dt) => {
    clock.current += dt
    if (clock.current > 0.5) {
      clock.current = 0
      const list: [number, number][] = []
      if (camera.position.length() - R < 500) {
        for (const vi of junctions) {
          tmp.v.copy(net.verts[vi]).multiplyScalar(R)
          const d = tmp.v.distanceTo(camera.position)
          if (d < 240) list.push([d, vi])
        }
      }
      list.sort((a, b) => a[0] - b[0])
      const key = list.slice(0, MAX_SIGNALS / 3).map((l) => l[1]).join(',')
      if (key !== last.current) {
        last.current = key
        const sigs: Sig[] = []
        for (const [, vi] of list.slice(0, MAX_SIGNALS / 3)) {
          const v = net.verts[vi]
          net.adj[vi].forEach((ni) => {
            tmp.up.copy(v)
            tmp.t.copy(net.verts[ni]).sub(v); tmp.t.addScaledVector(v, -tmp.t.dot(v)).normalize() // along the street, away from the junction
            tmp.r.crossVectors(tmp.t, tmp.up).negate().normalize() // the right-hand side of traffic arriving at the junction
            tmp.p.copy(v).multiplyScalar(R).addScaledVector(tmp.t, 10).addScaledVector(tmp.r, 8.6)
            const d = tmp.p.clone().normalize()
            tmp.p.copy(d).multiplyScalar(R + layout.ground(d))
            tmp.z.copy(tmp.t) // the lamps face the cars coming down the street
            tmp.x.crossVectors(d, tmp.z).normalize()
            tmp.z.crossVectors(tmp.x, d).normalize()
            sigs.push({ m: new THREE.Matrix4().makeBasis(tmp.x, d, tmp.z).setPosition(tmp.p), vi, group: approachGroup(v, net.verts[ni]) })
          })
        }
        active.current = sigs.slice(0, MAX_SIGNALS)
        for (const k of ['pole', 'head', 'red', 'green'] as const) {
          const mesh = refs[k].current
          if (!mesh) continue
          active.current.forEach((s, i) => mesh.setMatrixAt(i, s.m))
          mesh.count = active.current.length
          mesh.instanceMatrix.needsUpdate = true
        }
      }
    }
    const now = performance.now() / 1000
    active.current.forEach((s, i) => {
      const go = isGreen(s.vi, s.group, now)
      refs.red.current?.setColorAt(i, go ? OFF_R : ON_R)
      refs.green.current?.setColorAt(i, go ? ON_G : OFF_G)
    })
    for (const k of ['red', 'green'] as const) { const ic = refs[k].current?.instanceColor; if (ic) ic.needsUpdate = true }
  })
  return (
    <group>
      <instancedMesh ref={refs.pole} args={[geo.pole, undefined, MAX_SIGNALS]} frustumCulled={false} raycast={() => null}><meshStandardMaterial color="#2d3040" roughness={1} /></instancedMesh>
      <instancedMesh ref={refs.head} args={[geo.head, undefined, MAX_SIGNALS]} frustumCulled={false} raycast={() => null}><meshStandardMaterial color="#1a1c26" roughness={1} /></instancedMesh>
      <instancedMesh ref={refs.red} args={[geo.red, undefined, MAX_SIGNALS]} frustumCulled={false} raycast={() => null}><meshBasicMaterial color="#ffffff" toneMapped={false} /></instancedMesh>
      <instancedMesh ref={refs.green} args={[geo.green, undefined, MAX_SIGNALS]} frustumCulled={false} raycast={() => null}><meshBasicMaterial color="#ffffff" toneMapped={false} /></instancedMesh>
    </group>
  )
}
