import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { frontDir, type SphereLayout } from './sphereLayout'
import { useBaked } from './sphereModels'
import { mapStore } from './sphereMap'

const V = THREE.Vector3
const KINDS = 'abcefijkmnpq'.split('')
const PER_KIND = 170 // instances per character model: about 2,000 bots on screen at most
const BUDGET = KINDS.length * PER_KIND
const RANGE = 200 // metres around you
const PER_PLOT = 420

type Roam = { P: THREE.Vector3; F: THREE.Vector3; speed: number; turnAt: number; moving: boolean; g: number; blocked?: boolean }
type Bot = { a0: number; u: number; phase: number; kind: number; ground: number; roam?: Roam }
type Crowd = { want: number; bots: Bot[]; centre: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3; front: number; r0: number; depth: number }

const rand = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

/**
 * The people watching each streamer: one bot for every ten viewers. Sixty percent stand in front of the building watching it,
 * the other forty percent wander the streets around it, up and down the pavements.
 * Nobody is stored: a crowd is generated from the streamer's id the first time you come near, and only the
 * crowds around you are drawn, nearest first, so even the biggest channels cost nothing from the other side of the planet.
 */
export function Crowds({ layout, within, near }: { layout: SphereLayout; within: (p: THREE.Vector3, r: number, fn: (i: number) => void) => void; near: (p: THREE.Vector3, fn: (i: number) => void) => void }) {
  const { camera } = useThree()
  const R = layout.R
  const chars = KINDS.map((l) => useBaked(`/models/blocky/character-${l}.glb`, 1.8, Math.PI)) // eslint-disable-line react-hooks/rules-of-hooks
  const meshes = useRef<(THREE.InstancedMesh | null)[][]>(KINDS.map(() => []))
  const cache = useMemo(() => new Map<number, Crowd>(), [layout])
  const active = useRef<{ i: number; n: number }[]>([])
  const clock = useRef(1)
  const frame = useRef(0)
  const t = useMemo(() => ({ cand: new V(), pw: new V(), m: new THREE.Matrix4(), P: new V(), F: new V(), right: new V(), zc: new V(), pos: new V(), c: new V(), tmp: new V() }), [])

  const crowdOf = (i: number): Crowd => {
    let c = cache.get(i)
    if (c) return c
    const pl = layout.plots[i]
    const want = Math.max(1, Math.ceil(pl.stream.viewers / 10))
    const east = new V().crossVectors(new V(0, 1, 0), pl.dir)
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0)
    east.normalize()
    const north = new V().crossVectors(pl.dir, east)
    const fd = frontDir(pl)
    const front = Math.atan2(fd.dot(north), fd.dot(east))
    const r0 = pl.footprint * 0.62 + 4
    const n = Math.min(want, PER_PLOT)
    const depth = Math.sqrt(r0 * r0 + (n * 1.3 * 2) / Math.PI) - r0
    const seed = [...pl.stream.login].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
    const bots: Bot[] = []
    c = { want, bots, centre: pl.dir, east, north, front, r0, depth }
    for (let k = 0; k < n; k++) {
      const a0 = front + (rand(seed + k * 3) - 0.5) * Math.PI * 1.1
      const u = rand(seed + k * 5 + 1)
      const rad = Math.sqrt(r0 * r0 + u * ((r0 + depth) ** 2 - r0 * r0))
      t.tmp.copy(pl.dir).multiplyScalar(R).addScaledVector(east, Math.cos(a0) * rad).addScaledVector(north, Math.sin(a0) * rad).normalize()
      const bot: Bot = { a0, u, phase: rand(seed + k * 7 + 2) * 6.28, kind: Math.floor(rand(seed + k * 11 + 3) * KINDS.length), ground: Math.max(layout.ground(t.tmp), 0) }
      if (k % 5 < 2) {
        // forty percent roam: they start somewhere around the building and then wander wherever the ground is free
        const ra = rand(seed + k * 13 + 4) * Math.PI * 2, rr = r0 + 6 + rand(seed + k * 17 + 5) * 55
        const P = pl.dir.clone().multiplyScalar(R).addScaledVector(east, Math.cos(ra) * rr).addScaledVector(north, Math.sin(ra) * rr).normalize()
        const F = new V().crossVectors(P, new V(0, 1, 0))
        if (F.lengthSq() < 1e-6) F.set(1, 0, 0)
        F.normalize().applyAxisAngle(P, rand(seed + k * 19 + 6) * Math.PI * 2)
        if (layout.ground(P) < 1) P.copy(pl.dir).multiplyScalar(R).addScaledVector(east, r0 + 3).normalize()
        bot.roam = { P, F, speed: 1.1 + rand(seed + k * 23 + 7) * 1.5, turnAt: 0, moving: true, g: Math.max(layout.ground(P), 0) }
      }
      if (bot.ground < 1) continue // never stand anyone in the water
      bots.push(bot)
    }
    if (cache.size > 160) cache.delete(cache.keys().next().value!)
    cache.set(i, c)
    return c
  }

  // stations are solid too: a coarse lookup so a walker only checks the few blocks beside it
  const stationGrid = useRef<{ n: number; map: Map<number, THREE.Vector3[]> }>({ n: -1, map: new Map() })
  const KEY = (x: number, y: number, z: number) => ((Math.floor(x / 40) + 512) << 20) | ((Math.floor(y / 40) + 512) << 10) | (Math.floor(z / 40) + 512)
  const nearStation = (p: THREE.Vector3) => {
    const g = stationGrid.current
    if (g.n !== mapStore.stations.length) {
      g.n = mapStore.stations.length
      g.map = new Map()
      for (const st of mapStore.stations) {
        const w = st.dir.clone().multiplyScalar(R)
        const key = KEY(w.x, w.y, w.z)
        const l = g.map.get(key)
        if (l) l.push(w)
        else g.map.set(key, [w])
      }
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = g.map.get(KEY(p.x + dx * 40, p.y + dy * 40, p.z + dz * 40))
      if (l) for (const w of l) if (w.distanceToSquared(p) < 13 * 13) return true
    }
    return false
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    frame.current++
    const alt = camera.position.length() - R
    const counts = new Array(KINDS.length).fill(0)
    if (alt < 450) {
      clock.current += dtRaw
      if (clock.current > 0.3) {
        clock.current = 0
        const found: { i: number; d: number }[] = []
        within(camera.position, RANGE, (i) => found.push({ i, d: layout.plots[i].dir.distanceToSquared(t.c.copy(camera.position).normalize()) }))
        found.sort((a, b) => a.d - b.d)
        let left = BUDGET
        const next: { i: number; n: number }[] = []
        for (const f of found) {
          if (left <= 0) break
          const n = Math.min(crowdOf(f.i).bots.length, left)
          next.push({ i: f.i, n })
          left -= n
        }
        active.current = next
      }
      const time = performance.now() / 1000
      for (const { i, n } of active.current) {
        const c = crowdOf(i)
        for (let k = 0; k < n; k++) {
          const b = c.bots[k]
          const ti = b.kind
          if (counts[ti] >= PER_KIND) continue
          if (b.roam) {
            const r = b.roam
            if (time >= r.turnAt) {
              r.turnAt = time + 2 + Math.random() * 5
              r.F.applyAxisAngle(r.P, (Math.random() - 0.5) * 2.2)
              r.moving = Math.random() < 0.82
            }
            // anyone who has strayed far from their streamer drifts back towards them
            if (r.P.angleTo(c.centre) * R > 150) {
              t.tmp.copy(c.centre).sub(r.P)
              t.tmp.addScaledVector(r.P, -t.tmp.dot(r.P)).normalize()
              r.F.lerp(t.tmp, 0.05).normalize()
            }
            // look a little way ahead for anything solid now and then (not every frame: there are thousands of walkers)
            if (r.moving && (frame.current + k) % 4 === 0) {
              t.cand.copy(r.P).multiplyScalar(R).addScaledVector(r.F, 2.2)
              let blocked = false
              near(t.cand, (pi) => {
                const pl = layout.plots[pi], rad = pl.footprint * 0.62 + 3.5
                if (t.c.copy(pl.dir).multiplyScalar(R).distanceToSquared(t.cand) < rad * rad) blocked = true
              })
              if (!blocked) blocked = nearStation(t.cand)
              if (!blocked) for (const site of layout.sites) if (t.c.copy(site.dir).multiplyScalar(R).distanceToSquared(t.cand) < (site.radius * 0.93) ** 2) { blocked = true; break }
              if (!blocked) {
                t.tmp.copy(t.cand).normalize()
                const gh = layout.ground(t.tmp)
                if (gh < 1) blocked = true
                else r.g = gh
              }
              r.blocked = blocked
              if (blocked) r.F.applyAxisAngle(r.P, (Math.random() < 0.5 ? 1 : -1) * (1.3 + Math.random() * 1.2))
            }
            if (r.moving && !r.blocked) {
              r.P.multiplyScalar(R).addScaledVector(r.F, r.speed * dt).normalize()
              r.F.addScaledVector(r.P, -r.F.dot(r.P)).normalize()
            }
            t.right.crossVectors(r.F, r.P).normalize()
            t.zc.copy(r.F).negate()
            t.m.makeBasis(t.right, r.P, t.zc)
            t.pos.copy(r.P).multiplyScalar(R + r.g + (r.moving ? Math.abs(Math.sin(time * r.speed * 3.2 + b.phase)) * 0.12 : 0))
            t.m.setPosition(t.pos)
            const idx = counts[ti]++
            for (const m of meshes.current[ti]) if (m) m.setMatrixAt(idx, t.m)
            continue
          }
          // a slow shuffle in front of the building, now and then a bounce of excitement
          const ang = b.a0 + Math.sin(time * 0.25 + b.phase) * 0.12
          const rad = Math.sqrt(c.r0 * c.r0 + b.u * ((c.r0 + c.depth) ** 2 - c.r0 * c.r0)) + Math.sin(time * 0.4 + b.phase * 2) * 0.5
          t.P.copy(c.centre).multiplyScalar(R).addScaledVector(c.east, Math.cos(ang) * rad).addScaledVector(c.north, Math.sin(ang) * rad).normalize()
          // face the building they are watching
          t.F.copy(c.centre).sub(t.P)
          t.F.addScaledVector(t.P, -t.F.dot(t.P)).normalize()
          t.F.addScaledVector(t.right.crossVectors(t.F, t.P), Math.sin(time * 0.6 + b.phase) * 0.25).normalize()
          t.right.crossVectors(t.F, t.P).normalize()
          t.zc.copy(t.F).negate()
          t.m.makeBasis(t.right, t.P, t.zc)
          const hop = Math.max(0, Math.sin(time * 2.6 + b.phase * 3) - 0.93) * 9
          t.pos.copy(t.P).multiplyScalar(R + b.ground + hop)
          t.m.setPosition(t.pos)
          const idx = counts[ti]++
          for (const m of meshes.current[ti]) if (m) m.setMatrixAt(idx, t.m)
        }
      }
    } else active.current = []
    KINDS.forEach((_, ti) => {
      for (const m of meshes.current[ti]) if (m) { m.count = counts[ti]; m.instanceMatrix.needsUpdate = true }
    })
  })

  return (
    <group>
      {chars.map((b, ti) => b && b.parts.map((p, pi) => (
        <instancedMesh key={`k${ti}-${pi}`} ref={(el) => { meshes.current[ti][pi] = el }} args={[p.geometry, p.material, PER_KIND]} frustumCulled={false} raycast={() => null} />
      )))}
    </group>
  )
}
