import * as THREE from 'three'
import { loadGLTF } from './sphereModels'

const V = THREE.Vector3

export const SPACE = (name: string) => `/models/island/space/${name}.glb`

/** A model of the Kenney Space Kit, placed with its base on the ground and its middle at the origin. */
export type Piece = { root: THREE.Group; size: THREE.Vector3 }

const pieces = new Map<string, Promise<Piece>>()
/** Metres per Kenney unit, so a Kenney astronaut stands 1.85 m tall like our own characters. */
let kit = 0
export async function kitScale() {
  if (kit) return kit
  const g = await loadGLTF(SPACE('astronautA'))
  const h = new THREE.Box3().setFromObject(g.scene).getSize(new V()).y
  kit = 1.85 / Math.max(0.01, h)
  return kit
}

export function loadPiece(name: string): Promise<Piece> {
  let p = pieces.get(name)
  if (!p) {
    p = loadGLTF(SPACE(name)).then((g) => {
      const root = new THREE.Group()
      const inner = g.scene.clone(true)
      inner.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(inner)
      inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
      root.add(inner)
      inner.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
      return { root, size: box.getSize(new V()) }
    })
    pieces.set(name, p)
  }
  return p
}

/** A fresh copy of a piece (geometry and materials are shared), scaled by `k` times the Kenney unit. */
export async function placePiece(name: string, k = 1): Promise<{ obj: THREE.Group; size: THREE.Vector3 }> {
  const [piece, unit] = await Promise.all([loadPiece(name), kitScale()])
  const obj = piece.root.clone(true)
  obj.scale.setScalar(unit * k)
  return { obj, size: piece.size.clone().multiplyScalar(unit * k) }
}

// ---------------------------------------------------------------------------------------------------------------------
// the stylized sci-fi colony pack: three colony pads, each a red plateau with habitat modules, silos and lights

export type Building = { obj: THREE.Group; size: THREE.Vector3 }
export type SciFi = { buildings: Building[]; pads: Building[] }

let scifi: Promise<SciFi> | null = null

export function loadSciFi(): Promise<SciFi> {
  if (!scifi) scifi = loadGLTF('/models/island/scifi.glb').then((g) => {
    // the pack ships with specular-glossiness colours, which this renderer ignores: read the colour of every material ourselves
    const defs = ((g.parser as unknown as { json: { materials?: { name?: string; extensions?: Record<string, { diffuseFactor?: number[]; glossinessFactor?: number }> }[] } }).json.materials) ?? []
    const mats = new Map<string, THREE.Material>()
    const fix = (m: THREE.Material): THREE.Material => {
      let out = mats.get(m.name)
      if (out) return out
      const def = defs.find((d) => d.name === m.name)
      const f = def?.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseFactor
      const glow = m.name.toLowerCase().includes('glow') || m.name.toLowerCase().includes('yellow') || m.name.toLowerCase().includes('light')
      const c = f ? new THREE.Color(f[0], f[1], f[2]) : new THREE.Color('#999999')
      out = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.75, metalness: 0.15, emissive: glow ? c : new THREE.Color(0, 0, 0), emissiveIntensity: glow ? 0.9 : 0 })
      mats.set(m.name, out)
      return out
    }
    const scene = g.scene
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material); m.castShadow = true; m.receiveShadow = true } })
    scene.updateMatrixWorld(true)
    let rootNode: THREE.Object3D = scene
    scene.traverse((o) => { if (o.name === 'Root') rootNode = o })
    const kids = rootNode.children.filter((k) => k.name !== 'Sun' && !(k as THREE.Light).isLight)
    const box = new THREE.Box3()
    const info = kids.map((k) => {
      box.setFromObject(k)
      return { k, size: box.getSize(new V()), centre: box.getCenter(new V()), min: box.min.clone() }
    }).filter((i) => isFinite(i.size.x) && i.size.x > 0)
    const isPad = (n: string) => n.startsWith('Plane')
    const pads = info.filter((i) => isPad(i.k.name))
    const mains = info.filter((i) => !isPad(i.k.name) && Math.max(i.size.x, i.size.z) >= 0.75)
    const small = info.filter((i) => !isPad(i.k.name) && Math.max(i.size.x, i.size.z) < 0.75)
    const groups = new Map<(typeof info)[number], (typeof info)[number][]>()
    mains.forEach((m) => groups.set(m, [m]))
    // every small part (lights, pipes, crates) rides with the main building nearest to it
    for (const part of small) {
      let best: (typeof info)[number] | null = null, bd = 1.6
      for (const m of mains) { const d = Math.hypot(m.centre.x - part.centre.x, m.centre.z - part.centre.z) - Math.max(m.size.x, m.size.z) / 2; if (d < bd) { bd = d; best = m } }
      if (best) groups.get(best)!.push(part)
    }
    const wrap = (members: (typeof info)[number][], keepBase = true): Building => {
      const obj = new THREE.Group()
      const tmp = new THREE.Box3()
      for (const m of members) {
        const c = m.k.clone(true)
        c.applyMatrix4(m.k.matrixWorld)
        c.matrixAutoUpdate = true
        c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1)
        c.matrixAutoUpdate = false
        c.matrix.copy(m.k.matrixWorld)
        c.matrixWorldNeedsUpdate = true
        obj.add(c)
      }
      obj.updateMatrixWorld(true)
      tmp.setFromObject(obj)
      const size = tmp.getSize(new V())
      const holder = new THREE.Group()
      obj.position.set(-(tmp.min.x + tmp.max.x) / 2, keepBase ? -tmp.min.y : 0, -(tmp.min.z + tmp.max.z) / 2)
      holder.add(obj)
      return { obj: holder, size }
    }
    const buildings = [...groups.values()].map((mem) => wrap(mem))
    // a pad carries everything that stands on it
    const padBuildings = pads.map((p) => {
      const on = info.filter((i) => i !== p && Math.abs(i.centre.x - p.centre.x) < p.size.x / 2 + 0.2 && Math.abs(i.centre.z - p.centre.z) < p.size.z / 2 + 0.2)
      return wrap([p, ...on])
    })
    return { buildings, pads: padBuildings }
  })
  return scifi
}
