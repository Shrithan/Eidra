import * as THREE from 'three'
import type { SphereLayout } from './sphereLayout'
import { roadSides } from './sphereLattice'

const V = THREE.Vector3
/** The highest ground (metres above sea level) a highway may run over: the flat city is 2.2 m, so this allows gentle hills only. */
export const ROAD_MAX = 7

/**
 * The street network: streets run along the edges of the plot grid (every second grid line, so plots sit in 2 x 2 blocks),
 * only where there is a building next to them. Every plot has a street on two of its sides and its front door faces one,
 * so every building is on a road and roads never cut through a plot. Long runs of plots share a straight street.
 */
export type RoadNet = {
  verts: THREE.Vector3[] // unit vectors: street intersections
  edges: [number, number][] // streets between intersections
  adj: number[][]
  cells: number[][] // for each intersection, the buildings around it
  valid: boolean[] // true where streets meet
  rural: boolean[] // per street: true when only huts live along it (a dirt road in the countryside)
  ruralVert: boolean[] // true for junctions where only dirt roads meet
}

export function buildRoadNet(layout: SphereLayout): RoadNet {
  const L = layout.lattice
  const verts = L.corners
  const cells: number[][] = verts.map(() => [])
  const adj: number[][] = verts.map(() => [])
  const edges: [number, number][] = []
  const seen = new Map<number, number>()
  const rural: boolean[] = []
  // a street never runs into the sea: both ends and the middle of every segment must be dry land
  const wet = new Map<number, boolean>()
  const dry = (i: number) => { let w = wet.get(i); if (w === undefined) { w = layout.ground(verts[i]) > 0.8; wet.set(i, w) } return w }
  const midDry = (a: number, b: number) => layout.ground(new V().copy(verts[a]).add(verts[b]).normalize()) > 0.8
  layout.plots.forEach((p, pi) => {
    const c = L.cells[p.cell]
    const sides = roadSides(c)
    for (let k = 0; k < 4; k++) {
      cells[c.corners[k]].push(pi)
      if (!sides[k]) continue
      const a = c.corners[k], b = c.corners[(k + 1) % 4]
      if (!dry(a) || !dry(b) || !midDry(a, b)) continue
      const key = a < b ? a * verts.length + b : b * verts.length + a
      const at = seen.get(key)
      if (at !== undefined) { if (p.tier >= 1) rural[at] = false; continue }
      seen.set(key, edges.length)
      rural.push(p.tier < 1)
      edges.push([a, b]); adj[a].push(b); adj[b].push(a)
    }
  })
  const valid = verts.map((_, i) => adj[i].length > 0)
  const ruralVert = verts.map(() => true)
  edges.forEach(([a, b], i) => { if (!rural[i]) { ruralVert[a] = false; ruralVert[b] = false } })
  return { verts, edges, adj, cells, valid, rural, ruralVert }
}

export const hash1 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export const _V = V
