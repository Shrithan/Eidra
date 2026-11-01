import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

const V = THREE.Vector3
const Y = new V(0, 1, 0)

// Models are CC0 / free packs copied into /public/models: Cube World (Quaternius) and the Nature Kit (Kenney).
const loader = new GLTFLoader()
const cache = new Map<string, Promise<GLTF>>()
export const loadGLTF = (url: string) => {
  let p = cache.get(url)
  if (!p) { p = loader.loadAsync(url); cache.set(url, p) }
  return p
}

export const CUBE = (name: string) => `/models/cube/${name}.gltf`
export const KEN = (name: string) => `/models/kenney/${name}.glb`

/** One mesh of a model, flattened so it can be drawn thousands of times with an InstancedMesh. */
export type BakedPart = { geometry: THREE.BufferGeometry; material: THREE.Material }
export type Baked = { parts: BakedPart[]; height: number; native: THREE.Vector3 } // native = size of the model as authored

const bakedCache = new Map<string, Baked>()

/**
 * Flatten a loaded model: bake each mesh's transform into its geometry, put the origin at the middle of the base,
 * scale it to `height` metres, and (for characters, which glTF draws facing +Z) turn it to face the way our
 * models do (-Z).
 */
export function bake(gltf: GLTF, height: number, faceFix = 0): Baked {
  const scene = gltf.scene
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new V())
  const center = box.getCenter(new V())
  const k = height > 0 ? height / Math.max(1e-6, size.y) : 1 // height 0 keeps the model's own size
  const parts: BakedPart[] = []
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry.clone()
    g.applyMatrix4(m.matrixWorld)
    g.translate(-center.x, -box.min.y, -center.z)
    g.scale(k, k, k)
    if (faceFix) g.rotateY(faceFix)
    g.deleteAttribute('skinIndex')
    g.deleteAttribute('skinWeight')
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material).clone() as THREE.MeshStandardMaterial
    mat.roughness = 1
    mat.metalness = 0
    parts.push({ geometry: g, material: mat })
  })
  const native = size.clone()
  if (Math.abs(Math.sin(faceFix)) > 0.7) native.set(size.z, size.y, size.x) // a quarter turn swaps width and length
  return { parts, height, native }
}

/** Load a model (once) and bake it. Returns null until it is ready. */
export function useBaked(url: string, height: number, faceFix = 0): Baked | null {
  const key = `${url}|${height}|${faceFix}`
  const [baked, setBaked] = useState<Baked | null>(() => bakedCache.get(key) ?? null)
  useEffect(() => {
    let live = true
    const hit = bakedCache.get(key)
    if (hit) { setBaked(hit); return }
    loadGLTF(url)
      .then((g) => {
        const b = bake(g, height, faceFix)
        bakedCache.set(key, b)
        if (live) setBaked(b)
      })
      .catch((e) => console.warn('[models] could not load', url, e))
    return () => { live = false }
  }, [key, url, height, faceFix])
  return baked
}

export type Placement = { pos: THREE.Vector3; up: THREE.Vector3; yaw?: number; scale?: number }

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new V()
export function placementMatrix(out: THREE.Matrix4, p: Placement) {
  _q1.setFromUnitVectors(Y, p.up)
  _q2.setFromAxisAngle(p.up, p.yaw ?? 0)
  _q2.multiply(_q1)
  const s = p.scale ?? 1
  return out.compose(p.pos, _q2, _s.set(s, s, s))
}

/** Many copies of one model, standing on the ground at fixed places. */
export function InstancedModel({ url, height, items, faceFix = 0 }: { url: string; height: number; items: Placement[]; faceFix?: number }) {
  const baked = useBaked(url, height, faceFix)
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  useLayoutEffect(() => {
    if (!baked) return
    const m = new THREE.Matrix4()
    baked.parts.forEach((_, pi) => {
      const mesh = refs.current[pi]
      if (!mesh) return
      items.forEach((it, i) => mesh.setMatrixAt(i, placementMatrix(m, it)))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
  }, [baked, items])
  if (!baked || !items.length) return null
  return (
    <group>
      {baked.parts.map((p, i) => (
        <instancedMesh key={i} ref={(el) => { refs.current[i] = el }} args={[p.geometry, p.material, items.length]} frustumCulled={false} raycast={() => null} />
      ))}
    </group>
  )
}

/** Group placements by model so every kind of model is drawn with a single InstancedMesh per part. */
export type ScatterItem = Placement & { url: string; height: number }
export function Scatter({ items }: { items: ScatterItem[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, { url: string; height: number; items: Placement[] }>()
    for (const it of items) {
      const k = `${it.url}|${it.height}`
      let g = m.get(k)
      if (!g) { g = { url: it.url, height: it.height, items: [] }; m.set(k, g) }
      g.items.push(it)
    }
    return [...m.values()]
  }, [items])
  return (
    <group>
      {groups.map((g) => <InstancedModel key={g.url + g.height} url={g.url} height={g.height} items={g.items} />)}
    </group>
  )
}

/** Load and bake several models at once (at their own size, facing -Z when faceFix is π). Null until all are ready. */
export function useBakedSet(urls: string[], faceFix = 0): Map<string, Baked> | null {
  const key = urls.join(',') + '|' + faceFix
  const [set, setSet] = useState<Map<string, Baked> | null>(null)
  useEffect(() => {
    let live = true
    setSet(null)
    Promise.all(urls.map(async (u) => {
      const k = `${u}|0|${faceFix}`
      let b = bakedCache.get(k)
      if (!b) { b = bake(await loadGLTF(u), 0, faceFix); bakedCache.set(k, b) }
      return [u, b] as const
    })).then((r) => { if (live) setSet(new Map(r)) }).catch((e) => console.warn('[models] could not load a set', e))
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return set
}
