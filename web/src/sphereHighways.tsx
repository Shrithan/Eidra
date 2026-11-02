import { useMemo } from 'react'
import * as THREE from 'three'
import { ROAD_MAX, type RoadNet } from './sphereCity'
import type { SphereLayout } from './sphereLayout'

const V = THREE.Vector3

/**
 * The streets only exist inside districts, which leaves each district an island. Highways join every group of streets
 * into one network: each street group is linked to its nearest neighbours (smallest links first, never a loop), so you can
 * drive or walk from any district to any other.
 */
export function useHighways(net: RoadNet, layout: SphereLayout) {
  return useMemo(() => {
    const n = net.verts.length
    const used = net.verts.map(() => false)
    for (const [a, b] of net.edges) { used[a] = true; used[b] = true }
    const parent = Array.from({ length: n }, (_, i) => i)
    const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
    for (const [a, b] of net.edges) parent[find(a)] = find(b)
    const R = layout.R
    // a highway never crosses the sea or climbs a mountain: every few metres along it the ground must be dry and low
    const probe = new THREE.Vector3()
    const passable = (A: THREE.Vector3, B: THREE.Vector3) => {
      const steps = Math.max(2, Math.ceil((A.distanceTo(B) * R) / 6))
      for (let s = 0; s <= steps; s++) {
        const g = layout.ground(probe.copy(A).lerp(B, s / steps).normalize())
        if (g <= 0.8 || g >= ROAD_MAX) return false
      }
      return true
    }
    const ids = net.verts.map((_, i) => i).filter((i) => used[i])
    const pos = net.verts.map((v) => v.clone().multiplyScalar(R))
    const links: [number, number][] = []

    for (const cell of [layout.spacing * 2.5, layout.spacing * 7, layout.spacing * 20, layout.spacing * 60]) {
      const grid = new Map<string, number[]>()
      const key = (x: number, y: number, z: number) => `${x},${y},${z}`
      for (const i of ids) {
        const p = pos[i]
        const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell))
        if (!grid.has(k)) grid.set(k, [])
        grid.get(k)!.push(i)
      }
      const cand: [number, number, number][] = []
      for (const i of ids) {
        const p = pos[i]
        const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell)
        const ri = find(i)
        const best = new Map<number, [number, number]>() // nearest vertex in each other group
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
            const rj = find(j)
            if (rj === ri) continue
            const d = p.distanceTo(pos[j])
            const b = best.get(rj)
            if (!b || d < b[0]) best.set(rj, [d, j])
          }
        }
        for (const [d, j] of best.values()) if (i < j || find(i) !== find(j)) cand.push([d, i, j])
      }
      cand.sort((a, b) => a[0] - b[0])
      for (const [, a, b] of cand) {
        if (find(a) === find(b)) continue
        if (!passable(net.verts[a], net.verts[b])) continue
        parent[find(a)] = find(b)
        links.push([a, b])
      }
    }

    const geos = buildRibbons(links.map(([a, b]) => [net.verts[a], net.verts[b]] as [THREE.Vector3, THREE.Vector3]), layout, 1)
    return { geos, count: links.length }
  }, [net, layout])
}

/** Flat road ribbons (kerb, tarmac, dashed line) laid on the ground along each pair of directions. `wm` scales the width. */
export function buildRibbons(segs: [THREE.Vector3, THREE.Vector3][], layout: SphereLayout, wm: number, stepLen = 5) {
  const R = layout.R
  const layers = [
    { w: 11 * wm, lift: 0.16, dashed: false, pos: [] as number[], idx: [] as number[] },
    { w: 8 * wm, lift: 0.22, dashed: false, pos: [] as number[], idx: [] as number[] },
    { w: 0.5, lift: 0.28, dashed: true, pos: [] as number[], idx: [] as number[] },
  ]
  const A = new V(), B = new V(), d = new V(), up = new V(), tan = new V(), right = new V(), c = new V()
  for (const [pa, pb] of segs) {
    A.copy(pa); B.copy(pb)
    const len = A.distanceTo(B) * R
    const steps = Math.max(2, Math.ceil(len / stepLen))
    const hs: number[] = [], dirs: THREE.Vector3[] = []
    for (let s = 0; s <= steps; s++) {
      d.copy(A).lerp(B, s / steps).normalize()
      dirs.push(d.clone())
      hs.push(Math.max(layout.ground(d), 0.35)) // across water the road becomes a causeway
    }
    const sm = hs.map((_, s) => {
      let t = 0, k = 0
      for (let o = -2; o <= 2; o++) { const q = hs[s + o]; if (q !== undefined) { t += q; k++ } }
      return t / k
    })
    for (const L of layers) {
      if (L.dashed && wm < 1) continue
      const base = L.pos.length / 3
      for (let s = 0; s <= steps; s++) {
        up.copy(dirs[s])
        tan.copy(dirs[Math.min(s + 1, steps)]).sub(dirs[Math.max(s - 1, 0)]).normalize()
        right.crossVectors(tan, up).normalize()
        c.copy(up).multiplyScalar(R + sm[s] + L.lift)
        L.pos.push(c.x - right.x * L.w / 2, c.y - right.y * L.w / 2, c.z - right.z * L.w / 2, c.x + right.x * L.w / 2, c.y + right.y * L.w / 2, c.z + right.z * L.w / 2)
      }
      for (let s = 0; s < steps; s++) {
        if (L.dashed && s % 4 > 1) continue
        const i = base + s * 2
        L.idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3)
      }
    }
  }
  return layers.map((L) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3))
    g.setIndex(L.idx)
    g.computeVertexNormals()
    return g
  })
}

export function Highways({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const { geos, count } = useHighways(net, layout)
  if (import.meta.env.DEV) Object.assign(window, { __highways: count, __plots: layout.plots.length, __spacing: layout.spacing })
  const colors = ['#e1d9c4', '#565a68', '#f2e27a']
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} raycast={() => null}>
          <meshStandardMaterial color={colors[i % 3]} roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </group>
  )
}
