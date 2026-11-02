import * as THREE from 'three'

/**
 * The planet's land is cut into square plots on a cube-sphere grid: each plot is one cell, and streets run along cell
 * edges (every second grid line, so plots sit in blocks of 2 x 2 and every plot has a street on two of its sides).
 */
export type Cell = {
  f: number; i: number; j: number
  corners: [number, number, number, number] // (i,j) (i+1,j) (i+1,j+1) (i,j+1)
  centre: THREE.Vector3
  size: number // metres across, from the real edge lengths
}
export type Lattice = { N: number; corners: THREE.Vector3[]; cells: Cell[] }

const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
]
const warp = (s: number) => Math.tan((Math.PI / 4) * s) // equal-angle mapping keeps cells close to the same size

export function makeLattice(N: number, R: number): Lattice {
  const corners: THREE.Vector3[] = []
  const ids = new Map<string, number>()
  const cornerAt = (f: number, a: number, b: number) => {
    const [n, A, B] = FACES[f]
    const u = warp((2 * a) / N - 1), v = warp((2 * b) / N - 1)
    const p = new THREE.Vector3(n[0] + u * A[0] + v * B[0], n[1] + u * A[1] + v * B[1], n[2] + u * A[2] + v * B[2]).normalize()
    const key = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`
    let id = ids.get(key)
    if (id === undefined) { id = corners.length; corners.push(p); ids.set(key, id) }
    return id
  }
  const cells: Cell[] = []
  for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c: [number, number, number, number] = [cornerAt(f, i, j), cornerAt(f, i + 1, j), cornerAt(f, i + 1, j + 1), cornerAt(f, i, j + 1)]
    const centre = new THREE.Vector3()
    c.forEach((k) => centre.add(corners[k]))
    centre.normalize()
    let size = 0
    for (let k = 0; k < 4; k++) size += corners[c[k]].distanceTo(corners[c[(k + 1) % 4]]) * R
    cells.push({ f, i, j, corners: c, centre, size: size / 4 })
  }
  return { N, corners, cells }
}

/** Which sides of a cell have a street: bottom, right, top, left. Seam lines between faces are streets from both sides (N is even). */
export const roadSides = (c: Cell): [boolean, boolean, boolean, boolean] => [c.j % 2 === 0, (c.i + 1) % 2 === 0, (c.j + 1) % 2 === 0, c.i % 2 === 0]
