import * as THREE from 'three'
import type { SphereLayout } from './sphereLayout'
import { roadSides } from './sphereLattice'

const V = THREE.Vector3

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
}

export function buildRoadNet(layout: SphereLayout): RoadNet {
  const L = layout.lattice
  const verts = L.corners
  const cells: number[][] = verts.map(() => [])
  const adj: number[][] = verts.map(() => [])
  const edges: [number, number][] = []
  const seen = new Set<number>()
  layout.plots.forEach((p, pi) => {
    const c = L.cells[p.cell]
    const sides = roadSides(c)
    for (let k = 0; k < 4; k++) {
      cells[c.corners[k]].push(pi)
      if (!sides[k]) continue
      const a = c.corners[k], b = c.corners[(k + 1) % 4]
      const key = a < b ? a * verts.length + b : b * verts.length + a
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([a, b]); adj[a].push(b); adj[b].push(a)
    }
  })
  const valid = verts.map((_, i) => adj[i].length > 0)
  return { verts, edges, adj, cells, valid }
}

export const hash1 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export const _V = V
