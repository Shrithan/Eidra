import * as THREE from 'three'
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js'
import type { SphereLayout } from './sphereLayout'

const V = THREE.Vector3

/**
 * The street network: the borders between neighbouring buildings. Every building sits in a cell of the Voronoi diagram of
 * the lattice, and the cell borders are the streets, so roads never cut through a building.
 * The Voronoi diagram is dual to the Delaunay triangulation, which on a sphere is the convex hull of the points.
 */
export type RoadNet = {
  verts: THREE.Vector3[] // unit vectors: street intersections
  edges: [number, number][] // streets between intersections
  adj: number[][]
  cells: number[][] // for each intersection, the buildings around it
  valid: boolean[] // false for the huge outer cells of the diagram, which are wilderness, not streets
}

export function buildRoadNet(layout: SphereLayout): RoadNet {
  const pts = layout.plots.map((p) => p.dir)
  const index = new Map<THREE.Vector3, number>()
  pts.forEach((p, i) => index.set(p, i))
  const hull = new ConvexHull().setFromPoints(pts)
  const faceId = new Map<unknown, number>()
  const verts: THREE.Vector3[] = []
  const cells: number[][] = []
  hull.faces.forEach((f, i) => {
    faceId.set(f, i)
    verts.push(f.normal.clone().normalize()) // direction of the circumcentre of the triangle
    const ids: number[] = []
    let e = f.edge
    do {
      const vi = index.get(e.head().point)
      if (vi !== undefined) ids.push(vi)
      e = e.next
    } while (e !== f.edge)
    cells.push(ids)
  })
  const valid = verts.map((v, i) => cells[i].length > 0 && v.distanceTo(layout.plots[cells[i][0]].dir) * layout.R < layout.spacing * 0.85)
  const edges: [number, number][] = []
  const adj: number[][] = verts.map(() => [])
  hull.faces.forEach((f, i) => {
    let e = f.edge
    do {
      const t = e.twin
      if (t) {
        const j = faceId.get(t.face)
        if (j !== undefined && j > i && valid[i] && valid[j]) { edges.push([i, j]); adj[i].push(j); adj[j].push(i) }
      }
      e = e.next
    } while (e !== f.edge)
  })
  return { verts, edges, adj, cells, valid }
}

export const hash1 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export const _V = V
