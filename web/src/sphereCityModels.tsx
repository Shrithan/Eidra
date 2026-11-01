import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { RoadNet } from './sphereCity'
import { hash1 } from './sphereCity'
import type { SphereLayout } from './sphereLayout'
import { useBakedSet, type Baked } from './sphereModels'
import { Houses, Traffic } from './sphereVisuals'

const V = THREE.Vector3
const Y = new V(0, 1, 0)

const SUB = [...'abcdefghijklmnopqrstu'].map((l) => `/models/city/sub/${l}.glb`)
const COM = [...'abcdefghijklmn'].map((l) => `/models/city/com/${l}.glb`)
const SKY = [...'abcde'].map((l) => `/models/city/com/sky-${l}.glb`)
const IND = [...'abcdefghijklmnopqrst'].map((l) => `/models/city/ind/${l}.glb`)

/** Which building a stream gets: its tier decides how big, its planet decides the architecture. */
function modelFor(tier: number, planet: string, i: number): string {
  const pick = (l: string[]) => l[Math.floor(hash1(i * 7 + tier) * l.length)]
  if (planet === 'shooter' && tier >= 1 && tier <= 3) return pick(IND)
  if (tier <= 1) return pick(SUB)
  if (tier === 2) return hash1(i + 3) < 0.6 ? pick(SUB) : pick(COM.slice(0, 6))
  if (tier === 3) return pick(COM)
  return pick(SKY)
}

/** Kenney city buildings in place of the box houses, sized to each stream's tier. Falls back to boxes while they load. */
export function ModelHouses({ layout, onPick }: { layout: SphereLayout; onPick: (i: number) => void }) {
  const urls = useMemo(() => [...SUB, ...COM, ...SKY, ...IND], [])
  const set = useBakedSet(urls)
  const planet = layout.theme.id
  const groups = useMemo(() => {
    const m = new Map<string, number[]>()
    layout.plots.forEach((p, i) => {
      const u = modelFor(p.tier, planet, i)
      if (!m.has(u)) m.set(u, [])
      m.get(u)!.push(i)
    })
    return [...m.entries()]
  }, [layout, planet])
  const refs = useRef<Map<string, THREE.InstancedMesh[]>>(new Map())

  useLayoutEffect(() => {
    if (!set) return
    const R = layout.R
    const m = new THREE.Matrix4(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), pos = new V(), sc = new V()
    for (const [url, idx] of groups) {
      const b = set.get(url)!
      const meshes = refs.current.get(url) ?? []
      idx.forEach((pi, n) => {
        const p = layout.plots[pi]
        let sx = (p.footprint * 1.05) / Math.max(b.native.x, b.native.z)
        let sy = sx
        if (p.tier >= 3) sy = THREE.MathUtils.clamp(p.height / b.native.y, sx * 0.8, sx * 2.4)
        else if (b.native.y * sx > p.height * 1.6) sy = sx = (p.height * 1.6) / b.native.y
        q1.setFromUnitVectors(Y, p.dir)
        q2.setFromAxisAngle(p.dir, p.yaw).multiply(q1)
        pos.copy(p.dir).multiplyScalar(R + layout.ground(p.dir) - 0.05)
        m.compose(pos, q2, sc.set(sx, sy, sx))
        for (const mesh of meshes) if (mesh) mesh.setMatrixAt(n, m)
      })
      for (const mesh of meshes) if (mesh) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere() }
    }
  }, [set, groups, layout])

  if (!set) return <Houses layout={layout} onPick={onPick} />
  return (
    <group>
      {groups.map(([url, idx]) => (
        set.get(url)!.parts.map((part, pi) => (
          <instancedMesh key={url + pi} ref={(el) => {
            const a = refs.current.get(url) ?? []
            a[pi] = el as THREE.InstancedMesh
            refs.current.set(url, a)
          }} args={[part.geometry, part.material, idx.length]}
            onClick={(e) => { e.stopPropagation(); if (e.instanceId !== undefined) onPick(idx[e.instanceId]) }}
            onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = 'auto' }} />
        ))
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------

const veh = (name: string) => `/models/vehicles/${name}.gltf`
const COLORS = ['red', 'blue', 'yellow', 'green', 'grey', 'orange']
const CARS = [1, 2, 3].flatMap((v) => COLORS.map((c) => veh(`car-v${v}-${c}`)))
const BUSES = ['big', 'small'].flatMap((s) => ['red', 'blue', 'yellow', 'green'].map((c) => veh(`bus-${s}-${c}`)))
const TRUCKS = [1, 2, 3].flatMap((v) => ['red', 'blue', 'orange', 'green'].map((c) => veh(`truck-v${v}-${c}`)))
const EMERGENCY = ['ambulance-1', 'fire-engine-1', 'police-1'].map((n) => veh(`emergency-${n}`))

type Rider = { a: number; b: number; t: number; speed: number; url: string; slot: number; len: number }

/** Kenney cars, buses, trucks and emergency vehicles driving the same street graph. Falls back to the box traffic while loading. */
export function ModelTraffic({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const R = layout.R
  const urls = useMemo(() => [...CARS, ...BUSES, ...TRUCKS, ...EMERGENCY], [])
  const set = useBakedSet(urls, Math.PI)
  const kinds = useMemo(() => [
    { list: CARS, n: 150, speed: [9, 15], length: 4.3 },
    { list: BUSES, n: 36, speed: [7, 10], length: 10 },
    { list: TRUCKS, n: 26, speed: [6, 10], length: 8 },
    { list: EMERGENCY, n: 8, speed: [12, 18], length: 5.5 },
  ], [])
  const sim = useMemo(() => {
    const wv = net.verts.map((v) => v.clone().multiplyScalar(R + layout.ground(v)))
    const counts = new Map<string, number>()
    const riders: Rider[] = []
    for (const k of kinds) for (let i = 0; i < k.n; i++) {
      const e = net.edges[Math.floor(Math.random() * net.edges.length)]
      const flip = Math.random() < 0.5
      const url = k.list[Math.floor(Math.random() * k.list.length)]
      const slot = counts.get(url) ?? 0
      counts.set(url, slot + 1)
      riders.push({ a: flip ? e[0] : e[1], b: flip ? e[1] : e[0], t: Math.random(), speed: k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]), url, slot, len: k.length })
    }
    return { wv, riders, counts }
  }, [net, R, kinds, layout])
  const refs = useRef<Map<string, THREE.InstancedMesh[]>>(new Map())
  const tmp = useMemo(() => ({ A: new V(), B: new V(), p: new V(), up: new V(), dir: new V(), right: new V(), back: new V(), m: new THREE.Matrix4(), s: new V() }), [])

  useFrame((_, dtRaw) => {
    if (!set) return
    const dt = Math.min(dtRaw, 0.1)
    const { wv, riders } = sim
    for (const c of riders) {
      tmp.A.copy(wv[c.a]); tmp.B.copy(wv[c.b])
      let len = tmp.A.distanceTo(tmp.B) || 1
      c.t += (c.speed * dt) / len
      while (c.t >= 1) {
        c.t -= 1
        const opts = net.adj[c.b].filter((n) => n !== c.a)
        const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : c.a
        c.a = c.b; c.b = next
        tmp.A.copy(wv[c.a]); tmp.B.copy(wv[c.b])
        len = tmp.A.distanceTo(tmp.B) || 1
      }
      tmp.p.copy(tmp.A).lerp(tmp.B, c.t)
      tmp.up.copy(tmp.p).normalize()
      tmp.dir.copy(tmp.B).sub(tmp.A).normalize()
      tmp.right.crossVectors(tmp.dir, tmp.up).normalize()
      { const h = tmp.p.length(); tmp.p.addScaledVector(tmp.right, 1.6).normalize().multiplyScalar(h + 0.25) } // drive on the right
      tmp.back.copy(tmp.dir).negate()
      tmp.m.makeBasis(tmp.right, tmp.up, tmp.back)
      const s = c.len / Math.max(0.01, set.get(c.url)!.native.z)
      tmp.m.scale(tmp.s.set(s, s, s))
      tmp.m.setPosition(tmp.p)
      for (const mesh of refs.current.get(c.url) ?? []) if (mesh) mesh.setMatrixAt(c.slot, tmp.m)
    }
    for (const arr of refs.current.values()) for (const mesh of arr) if (mesh) mesh.instanceMatrix.needsUpdate = true
  })

  if (!set) return <Traffic net={net} layout={layout} />
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

// ---------------------------------------------------------------------------------------------------------------------

const BOATS = ['boat-sail-a', 'boat-sail-b', 'boat-fishing-small', 'boat-row-small', 'boat-speed-a', 'boat-speed-c', 'boat-tow-a', 'ship-small', 'ship-cargo-a', 'ship-large'].map((n) => `/models/boats/${n}.glb`)

type Boat = { url: string; dir: THREE.Vector3; fwd: THREE.Vector3; scale: number; speed: number; slot: number }

/** Boats that sail slowly around the lakes and seas. */
export function Boats({ layout, count = 36 }: { layout: SphereLayout; count?: number }) {
  const set = useBakedSet(BOATS, Math.PI)
  const R = layout.R
  const boats = useMemo(() => {
    if (layout.theme.lakes < 0.35) return []
    const counts = new Map<string, number>()
    const out: Boat[] = []
    for (let tries = 0; tries < 4000 && out.length < count; tries++) {
      const d = new V(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      if (d.lengthSq() > 1 || d.lengthSq() < 0.01) continue
      d.normalize()
      if (layout.ground(d) > -7) continue // only where the water is deep enough
      const url = BOATS[Math.floor(Math.random() * BOATS.length)]
      const slot = counts.get(url) ?? 0
      counts.set(url, slot + 1)
      const fwd = new V().crossVectors(d, new V(Math.random(), Math.random(), Math.random())).normalize()
      out.push({ url, dir: d, fwd, scale: 0, speed: 0.6 + Math.random() * 1.6, slot })
    }
    return out
  }, [layout, count])
  const sizes = useMemo(() => {
    const c = new Map<string, number>()
    for (const b of boats) c.set(b.url, (c.get(b.url) ?? 0) + 1)
    return c
  }, [boats])
  const refs = useRef<Map<string, THREE.InstancedMesh[]>>(new Map())
  const tmp = useMemo(() => ({ right: new V(), back: new V(), m: new THREE.Matrix4(), p: new V(), s: new V(), step: new V() }), [])

  useFrame((state, dtRaw) => {
    if (!set) return
    const dt = Math.min(dtRaw, 0.1), t = state.clock.elapsedTime
    for (const b of boats) {
      const nat = set.get(b.url)!.native
      if (!b.scale) b.scale = (b.url.includes('ship') ? 14 : 7) / Math.max(0.01, nat.z)
      // slide along the sea; turn back when the water gets shallow
      const ang = (b.speed * dt) / R
      tmp.step.copy(b.fwd).multiplyScalar(Math.sin(ang))
      const nd = b.dir.clone().multiplyScalar(Math.cos(ang)).add(tmp.step).normalize()
      if (layout.ground(nd) > -4) b.fwd.negate()
      else {
        b.fwd.addScaledVector(nd, -b.fwd.dot(nd)).normalize()
        b.dir.copy(nd)
      }
      tmp.right.crossVectors(b.fwd, b.dir).normalize()
      tmp.back.copy(b.fwd).negate()
      tmp.m.makeBasis(tmp.right, b.dir, tmp.back)
      tmp.m.scale(tmp.s.set(b.scale, b.scale, b.scale))
      tmp.p.copy(b.dir).multiplyScalar(R + 0.05 + Math.sin(t * 1.3 + b.slot) * 0.12)
      tmp.m.setPosition(tmp.p)
      for (const mesh of refs.current.get(b.url) ?? []) if (mesh) mesh.setMatrixAt(b.slot, tmp.m)
    }
    for (const arr of refs.current.values()) for (const mesh of arr) if (mesh) mesh.instanceMatrix.needsUpdate = true
  })

  if (!set || !boats.length) return null
  return (
    <group>
      {[...sizes.entries()].map(([url, n]) => (
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
