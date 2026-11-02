import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GROUPS, frontDir, type SphereLayout } from './sphereLayout'
import { hash1, type RoadNet } from './sphereCity'
import { buildRibbons } from './sphereHighways'
import { fbm } from './sphereTerrain'

const V = THREE.Vector3
const Y = new V(0, 1, 0)

export const hashStr = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0 }

// ---------------------------------------------------------------------------------------------------------------------
// the Crossy Road look: everything is made of simple coloured boxes

/** [width, height, length, x, y, z, colour] */
export type Part = [number, number, number, number, number, number, string]

/** Merge coloured boxes into one geometry (colour lives in the vertex colours). */
export function voxel(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(([w, h, l, x, y, z, c]) => {
    const g = new THREE.BoxGeometry(w, h, l)
    g.translate(x, y, z)
    const col = new THREE.Color(c)
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return g
  })
  return mergeGeometries(geos)!
}

const flat = (extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, ...extra })

// ---------------------------------------------------------------------------------------------------------------------
// houses: chunky blocks with a shopfront, windows, awning and roof

function makeHouseMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, flatShading: true })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;\nvarying float vH;\nvarying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vObj = position * isc;
        vObjN = normal;
        vH = isc.y;
        vec3 ip = instanceMatrix[3].xyz;
        vSeed = fract(sin(dot(ip, vec3(12.9898, 78.233, 37.719))) * 43758.5453);`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; varying vec3 vObjN; varying float vH; varying float vSeed;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vec3 base = vColor.rgb;
          #else
          vec3 base = diffuse;
          #endif
          if (abs(vObjN.y) < 0.5) {
            vec2 uv = abs(vObjN.x) > 0.5 ? vObj.zy : vObj.xy;
            vec2 cell = vec2(2.5, 3.0);
            vec2 id = floor(uv / cell);
            vec2 f = fract(uv / cell);
            float band = step(3.6, vObj.y) * step(vObj.y, vH - 1.0);
            vec2 w = smoothstep(0.16, 0.24, f) * (1.0 - smoothstep(0.76, 0.84, f));
            float win = w.x * w.y * band;
            vec3 glass = mix(vec3(0.36, 0.66, 0.92), vec3(0.62, 0.86, 1.0), h21(id + vSeed * 31.0));
            base = mix(base, glass, win);
            base = mix(base, base * 0.72, step(vObj.y, 1.0));
            base = mix(base, base * 1.14, step(vH - 0.7, vObj.y));
          }
          diffuseColor.rgb = base * (0.84 + 0.16 * clamp(vObj.y / vH, 0.0, 1.0));
        }`)
  }
  return m
}

export function Houses({ layout, onPick }: { layout: SphereLayout; onPick: (i: number) => void }) {
  const refs = {
    body: useRef<THREE.InstancedMesh>(null), pitched: useRef<THREE.InstancedMesh>(null), slab: useRef<THREE.InstancedMesh>(null),
    hut: useRef<THREE.InstancedMesh>(null), mast: useRef<THREE.InstancedMesh>(null), door: useRef<THREE.InstancedMesh>(null), awning: useRef<THREE.InstancedMesh>(null),
    chimney: useRef<THREE.InstancedMesh>(null), turret: useRef<THREE.InstancedMesh>(null), turretRoof: useRef<THREE.InstancedMesh>(null), crown: useRef<THREE.InstancedMesh>(null),
  }
  const parts = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    const pyramid = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
    pyramid.rotateY(Math.PI / 4)
    pyramid.translate(0, 0.5, 0)
    const cyl = new THREE.CylinderGeometry(0.5, 0.56, 1, 8)
    cyl.translate(0, 0.5, 0)
    const spire = new THREE.ConeGeometry(0.75, 1, 8)
    spire.translate(0, 0.5, 0)
    const low: number[] = [], tall: number[] = [], masts: number[] = [], chim: number[] = [], turr: number[] = [], crowns: number[] = []
    layout.plots.forEach((p, i) => {
      const id = GROUPS[p.group].id
      if (p.tier <= 2) low.push(i); else tall.push(i) // huts, cottages and houses have pitched roofs; towers and skyscrapers are flat
      if (p.tier >= 3) masts.push(i)
      if (p.tier === 4) crowns.push(i)
      if (p.tier >= 1 && p.tier <= 2 && (id === 'chat' || id === 'sandbox')) chim.push(i)
      if ((id === 'rpg' || id === 'horror') && p.tier >= 2) turr.push(i)
    })
    return { box, pyramid, cyl, spire, low, tall, masts, chim, turr, crowns, house: makeHouseMaterial() }
  }, [layout])

  useLayoutEffect(() => {
    const d = new THREE.Object3D()
    const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q = new THREE.Quaternion()
    const base = new V(), local = new V()
    const wall = new THREE.Color(), roof = new THREE.Color(), tmp = new THREE.Color(), tmp2 = new THREE.Color()
    const R = layout.R
    const orient = (p: SphereLayout['plots'][number]) => {
      q1.setFromUnitVectors(Y, p.dir)
      q2.setFromAxisAngle(p.dir, p.yaw)
      q.copy(q2).multiply(q1)
      base.copy(p.dir).multiplyScalar(R + layout.ground(p.dir))
    }
    const place = (mesh: THREE.InstancedMesh, n: number, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) => {
      local.set(lx, ly, lz).applyQuaternion(q)
      d.position.copy(base).add(local)
      d.quaternion.copy(q)
      d.scale.set(sx, sy, sz)
      d.updateMatrix()
      mesh.setMatrixAt(n, d.matrix)
    }
    layout.plots.forEach((p, i) => {
      orient(p)
      const f = p.footprint, h = p.height
      const pal = layout.theme.houses
      const hi = hashStr(p.category) % pal.length
      wall.set(pal[hi]).multiplyScalar(0.94 + hash1(i + 1) * 0.12)
      if (p.tier === 0) wall.set('#b88a5a').multiplyScalar(0.88 + hash1(i + 1) * 0.2) // huts are plain timber
      if (p.tier === 4) wall.lerp(tmp.set('#9fc4e6'), 0.55) // skyscrapers are glass and steel
      place(refs.body.current!, i, 0, 0, 0, f, h, f)
      refs.body.current!.setColorAt(i, wall)
      if (p.tier === 0) {
        place(refs.door.current!, i, 0, 0, f / 2 + 0.02, 1.1, 1.9, 0.4)
        place(refs.awning.current!, i, 0, 0, 0, 0.001, 0.001, 0.001)
      } else {
        place(refs.door.current!, i, 0, 0, f / 2 + 0.02, 1.9 + f * 0.12, 3.0 + f * 0.08, 0.5)
        place(refs.awning.current!, i, 0, 3.1 + f * 0.08, f / 2 + 0.9, Math.min(f * 0.8, 9), 0.4, 1.9)
      }
      refs.awning.current!.setColorAt(i, tmp.set(pal[(hi + 2) % pal.length]).multiplyScalar(1.0))
    })
    parts.low.forEach((i, n) => {
      const p = layout.plots[i]
      orient(p)
      if (p.tier === 0) {
        // a hut has a steep thatched roof
        place(refs.pitched.current!, n, 0, p.height, 0, p.footprint * 1.3, p.footprint * 0.95, p.footprint * 1.3)
        refs.pitched.current!.setColorAt(n, roof.set('#d6b254').multiplyScalar(0.9 + hash1(i + 4) * 0.2))
      } else {
        place(refs.pitched.current!, n, 0, p.height, 0, p.footprint * 1.12, p.footprint * 0.5, p.footprint * 1.12)
        roof.set(layout.theme.houses[hashStr(p.category) % layout.theme.houses.length]).lerp(tmp.set('#b4513a'), 0.5).multiplyScalar(0.6)
        refs.pitched.current!.setColorAt(n, roof)
      }
    })
    parts.tall.forEach((i, n) => {
      const p = layout.plots[i]
      orient(p)
      const f = p.footprint
      // skyscrapers step in near the top and wear a crown
      const crownH = p.tier === 4 ? p.height * 0.22 : 0
      const topF = p.tier === 4 ? f * 0.66 : f
      place(refs.slab.current!, n, 0, p.height + crownH, 0, topF * 1.08, 0.9, topF * 1.08)
      refs.slab.current!.setColorAt(n, tmp.set('#8b92a3'))
      place(refs.hut.current!, n, topF * 0.18, p.height + crownH + 0.9, -topF * 0.12, topF * 0.34, 1.7, topF * 0.3)
      refs.hut.current!.setColorAt(n, tmp.set('#b9bfcc'))
    })
    parts.crowns.forEach((i, n) => {
      const p = layout.plots[i]
      orient(p)
      place(refs.crown.current!, n, 0, p.height, 0, p.footprint * 0.66, p.height * 0.22, p.footprint * 0.66)
      refs.crown.current!.setColorAt(n, tmp.set(layout.theme.houses[hashStr(p.category) % layout.theme.houses.length]).lerp(tmp2.set('#9fc4e6'), 0.35))
    })
    parts.masts.forEach((i, n) => {
      const p = layout.plots[i]
      orient(p)
      const top = p.height + (p.tier === 4 ? p.height * 0.22 : 0)
      const mh = p.tier === 4 ? 8 : 4
      place(refs.mast.current!, n, -p.footprint * 0.2, top + 0.9, p.footprint * 0.15, 0.3, mh, 0.3)
    })
    parts.chim.forEach((i, n) => {
      const p = layout.plots[i]
      orient(p)
      place(refs.chimney.current!, n, p.footprint * 0.22, p.height + p.footprint * 0.12, -p.footprint * 0.2, 1.1, p.footprint * 0.45, 1.1)
    })
    parts.turr.forEach((i, n) => {
      const p = layout.plots[i]
      orient(p)
      const th = p.height + p.footprint * 0.7
      place(refs.turret.current!, n, p.footprint * 0.5, 0, p.footprint * 0.5, p.footprint * 0.34, th, p.footprint * 0.34)
      refs.turret.current!.setColorAt(n, tmp.set(layout.theme.houses[hashStr(p.category) % layout.theme.houses.length]).lerp(tmp2.set('#d9d4c8'), 0.5))
      place(refs.turretRoof.current!, n, p.footprint * 0.5, th, p.footprint * 0.5, p.footprint * 0.5, p.footprint * 0.62, p.footprint * 0.5)
      refs.turretRoof.current!.setColorAt(n, tmp.set(layout.theme.houses[hashStr(p.category) % layout.theme.houses.length]).multiplyScalar(0.5))
    })
    for (const m of Object.values(refs)) {
      const mesh = m.current!
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [layout, parts])

  const pick = (e: { stopPropagation: () => void; instanceId?: number }, map?: number[]) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    onPick(map ? map[e.instanceId] : e.instanceId)
  }
  const flatStd = (c: string) => <meshStandardMaterial color={c} flatShading roughness={0.9} />
  const n = layout.plots.length
  return (
    <group>
      <instancedMesh ref={refs.body} args={[parts.box, parts.house, n]} onClick={(e) => pick(e)}
        onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = 'auto' }} />
      <instancedMesh ref={refs.pitched} args={[parts.pyramid, undefined, Math.max(1, parts.low.length)]} onClick={(e) => pick(e, parts.low)}>{flatStd('#ffffff')}</instancedMesh>
      <instancedMesh ref={refs.slab} args={[parts.box, undefined, Math.max(1, parts.tall.length)]} onClick={(e) => pick(e, parts.tall)}>{flatStd('#ffffff')}</instancedMesh>
      <instancedMesh ref={refs.hut} args={[parts.box, undefined, Math.max(1, parts.tall.length)]} raycast={() => null}>{flatStd('#ffffff')}</instancedMesh>
      <instancedMesh ref={refs.crown} args={[parts.box, parts.house, Math.max(1, parts.crowns.length)]} onClick={(e) => pick(e, parts.crowns)} />
      <instancedMesh ref={refs.mast} args={[parts.box, undefined, Math.max(1, parts.masts.length)]} raycast={() => null}>{flatStd('#9aa1b0')}</instancedMesh>
      <instancedMesh ref={refs.chimney} args={[parts.box, undefined, Math.max(1, parts.chim.length)]} raycast={() => null}>{flatStd('#a4553f')}</instancedMesh>
      <instancedMesh ref={refs.turret} args={[parts.cyl, undefined, Math.max(1, parts.turr.length)]} raycast={() => null}>{flatStd('#ffffff')}</instancedMesh>
      <instancedMesh ref={refs.turretRoof} args={[parts.spire, undefined, Math.max(1, parts.turr.length)]} raycast={() => null}>{flatStd('#ffffff')}</instancedMesh>
      <instancedMesh ref={refs.door} args={[parts.box, undefined, n]} raycast={() => null}>{flatStd('#4a3022')}</instancedMesh>
      <instancedMesh ref={refs.awning} args={[parts.box, undefined, n]} raycast={() => null}>{flatStd('#ffffff')}</instancedMesh>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// streets (the borders between neighbouring buildings), with kerbs and junction discs

const TAR = new THREE.Color('#565a68'), KERB = new THREE.Color('#e1d9c4'), DIRT = new THREE.Color('#c9ae7c'), DIRT_EDGE = new THREE.Color('#a58e63')

export function Roads({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const R = layout.R
  const discRoad = useRef<THREE.InstancedMesh>(null)
  const discKerb = useRef<THREE.InstancedMesh>(null)
  const disc = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 14), [])
  const usable = useMemo(() => net.edges.map((e, i) => ({ e, i })).filter(({ e: [a, b] }) => net.verts[a].distanceTo(net.verts[b]) * R > 1.5), [net, R])
  const usableVerts = useMemo(() => net.verts.map((_, i) => i).filter((i) => net.valid[i]), [net])
  // streets are ribbons that follow the ground's own curve (sampled every few metres), not straight slabs
  // paved city streets in the middle of each country; narrow dirt tracks where only huts live
  const ribbons = useMemo(() => {
    const seg = (rural: boolean) => usable.filter(({ i }) => !!net.rural[i] === rural).map(({ e: [a, b] }) => [net.verts[a], net.verts[b]] as [THREE.Vector3, THREE.Vector3])
    return { city: buildRibbons(seg(false), layout, 1.3, 9), country: buildRibbons(seg(true), layout, 0.8, 9) }
  }, [usable, net, layout])

  useLayoutEffect(() => {
    const q = new THREE.Quaternion(), p = new V(), sc = new V(), mm = new THREE.Matrix4()
    usableVerts.forEach((vi, i) => {
      const v = net.verts[vi]
      const h = R + Math.max(layout.ground(v), 0.35)
      q.setFromUnitVectors(Y, v)
      p.copy(v).multiplyScalar(h + 0.28)
      const rural = !!net.ruralVert[vi]
      const k = rural ? 0.62 : 1
      mm.compose(p, q, sc.set(5.9 * k, 0.1, 5.9 * k))
      discRoad.current!.setMatrixAt(i, mm)
      discRoad.current!.setColorAt(i, rural ? DIRT : TAR)
      p.copy(v).multiplyScalar(h + 0.2)
      mm.compose(p, q, sc.set(8.4 * k, 0.1, 8.4 * k))
      discKerb.current!.setMatrixAt(i, mm)
      discKerb.current!.setColorAt(i, rural ? DIRT_EDGE : KERB)
    })
    for (const r of [discRoad, discKerb]) {
      r.current!.instanceMatrix.needsUpdate = true
      if (r.current!.instanceColor) r.current!.instanceColor.needsUpdate = true
      r.current!.computeBoundingSphere()
    }
  }, [net, layout, R, usableVerts])

  const std = (c: string) => <meshStandardMaterial color={c} roughness={1} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
  return (
    <group>
      <mesh geometry={ribbons.city[0]} raycast={() => null}>{std('#e1d9c4')}</mesh>
      <mesh geometry={ribbons.city[1]} raycast={() => null}>{std('#565a68')}</mesh>
      <mesh geometry={ribbons.city[2]} raycast={() => null}>{std('#f2e27a')}</mesh>
      <mesh geometry={ribbons.country[0]} raycast={() => null}>{std('#a58e63')}</mesh>
      <mesh geometry={ribbons.country[1]} raycast={() => null}>{std('#c9ae7c')}</mesh>
      <instancedMesh ref={discKerb} args={[disc, undefined, usableVerts.length]} raycast={() => null}>{std('#ffffff')}</instancedMesh>
      <instancedMesh ref={discRoad} args={[disc, undefined, usableVerts.length]} raycast={() => null}>{std('#ffffff')}</instancedMesh>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// street trees and lamp posts on the corners

export function Props({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const R = layout.R
  const trunk = useRef<THREE.InstancedMesh>(null)
  const crown = useRef<THREE.InstancedMesh>(null)
  const pole = useRef<THREE.InstancedMesh>(null)
  const lamp = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    const crownG = voxel([
      [3.4, 1.9, 3.4, 0, 2.7, 0, '#ffffff'],
      [2.4, 1.6, 2.4, 0, 4.4, 0, '#ffffff'],
      [1.3, 1.2, 1.3, 0, 5.7, 0, '#ffffff'],
    ])
    return { box, crownG }
  }, [])
  const spots = useMemo(() => {
    const trees: { pos: THREE.Vector3; up: THREE.Vector3; s: number; color: THREE.Color }[] = []
    const lamps: { pos: THREE.Vector3; up: THREE.Vector3; yaw: number }[] = []
    const greens = [...layout.theme.trees.oak, ...layout.theme.trees.oak]
    const onGround = (dir: THREE.Vector3) => dir.clone().normalize().multiplyScalar(R + layout.ground(dir))
    const v = new V(), p = new V(), t = new V(), t1 = new V(), t2 = new V()
    net.verts.forEach((vert, i) => {
      const cell = net.cells[i]
      if (!net.valid[i] || !cell.length) return
      v.copy(vert).multiplyScalar(R)
      const r = hash1(i * 3 + 1)
      const place = (idx: number, dist: number) => {
        const plot = layout.plots[cell[idx % cell.length]]
        p.copy(plot.dir).multiplyScalar(R)
        t.copy(p).sub(v).normalize()
        return onGround(v.clone().addScaledVector(t, dist))
      }
      if (r < 0.45) {
        const pos = place(Math.floor(hash1(i + 7) * 3), 8.2)
        trees.push({ pos, up: pos.clone().normalize(), s: 0.9 + hash1(i + 11) * 0.7, color: new THREE.Color(greens[Math.floor(hash1(i + 5) * greens.length)]) })
      } else if (r < 0.8) {
        const pos = place(Math.floor(hash1(i + 13) * 3), 7.6)
        lamps.push({ pos, up: pos.clone().normalize(), yaw: hash1(i) * 6.28 })
      }
    })
    // gardens: a few trees around each building
    layout.plots.forEach((plot, i) => {
      t1.crossVectors(plot.dir, Y)
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0)
      t1.normalize()
      t2.crossVectors(plot.dir, t1)
      const count = 2 + Math.floor(hash1(i + 3) * 3)
      const front = frontDir(plot)
      for (let k = 0; k < count; k++) {
        const ang = hash1(i * 7 + k) * 6.28
        // keep the door side clear: that is where people arrive and the camera needs room
        if (t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang)).dot(front) > 0.35) continue
        const dist = plot.footprint * 0.5 + 6 + hash1(i * 5 + k + 1) * 8
        p.copy(plot.dir).multiplyScalar(R).addScaledVector(t1, Math.cos(ang) * dist).addScaledVector(t2, Math.sin(ang) * dist)
        const pos = onGround(p)
        trees.push({ pos, up: pos.clone().normalize(), s: 0.8 + hash1(i * 3 + k) * 0.8, color: new THREE.Color(greens[Math.floor(hash1(i * 11 + k) * greens.length)]) })
      }
    })
    return { trees: [] as typeof trees, lamps } // trees are placed by <Nature> now
  }, [net, layout, R])

  useLayoutEffect(() => {
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m = new THREE.Matrix4(), sc = new V()
    spots.trees.forEach((t, i) => {
      q.setFromUnitVectors(Y, t.up)
      m.compose(t.pos, q, sc.set(t.s, t.s, t.s))
      crown.current!.setMatrixAt(i, m)
      crown.current!.setColorAt(i, t.color)
      m.compose(t.pos, q, sc.set(0.75 * t.s, 2.8 * t.s, 0.75 * t.s))
      trunk.current!.setMatrixAt(i, m)
    })
    spots.lamps.forEach((l, i) => {
      q.setFromUnitVectors(Y, l.up)
      q2.setFromAxisAngle(l.up, l.yaw)
      q.premultiply(q2)
      m.compose(l.pos, q, sc.set(0.28, 6.2, 0.28))
      pole.current!.setMatrixAt(i, m)
      const head = l.pos.clone().addScaledVector(l.up, 6.1)
      m.compose(head, q, sc.set(1.4, 0.4, 0.7))
      lamp.current!.setMatrixAt(i, m)
    })
    for (const r of [trunk, crown, pole, lamp]) {
      r.current!.instanceMatrix.needsUpdate = true
      if (r.current!.instanceColor) r.current!.instanceColor.needsUpdate = true
    }
  }, [spots])

  return (
    <group>
      <instancedMesh ref={trunk} args={[geo.box, undefined, Math.max(1, spots.trees.length)]} raycast={() => null}>
        <meshStandardMaterial color="#7a5232" flatShading roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[geo.crownG, undefined, Math.max(1, spots.trees.length)]} raycast={() => null}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </instancedMesh>
      <instancedMesh ref={pole} args={[geo.box, undefined, Math.max(1, spots.lamps.length)]} raycast={() => null}>
        <meshStandardMaterial color="#6d7383" flatShading roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={lamp} args={[geo.box, undefined, Math.max(1, spots.lamps.length)]} raycast={() => null}>
        <meshBasicMaterial color={[1.4, 1.2, 0.7]} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// traffic on the streets: cars, buses and trucks following the road network

const WHEEL = '#23252e'
const GLASS = '#bfe6ff'
const wheels = (xs: number, zs: number[], y: number, w: number, h: number, l: number): Part[] =>
  zs.flatMap((z) => [-1, 1].map((sx) => [w, h, l, sx * xs, y, z, WHEEL] as Part))
const CAR = {
  paint: voxel([[1.9, 0.9, 4.3, 0, 0.8, 0, '#ffffff'], [1.7, 0.8, 2.2, 0, 1.65, 0.25, '#ffffff']]),
  trim: voxel([[1.74, 0.55, 1.6, 0, 1.66, 0.25, GLASS], [0.4, 0.22, 0.1, -0.6, 0.85, -2.17, '#ffe58a'], [0.4, 0.22, 0.1, 0.6, 0.85, -2.17, '#ffe58a'],
    [0.4, 0.22, 0.1, -0.6, 0.85, 2.17, '#ff4d4d'], [0.4, 0.22, 0.1, 0.6, 0.85, 2.17, '#ff4d4d'], ...wheels(0.97, [-1.4, 1.4], 0.38, 0.35, 0.7, 0.8)]),
}
const BUS = {
  paint: voxel([[2.7, 3.0, 10.6, 0, 2.0, 0, '#ffffff']]),
  trim: voxel([[2.76, 0.95, 9.2, 0, 2.55, 0.2, GLASS], [2.2, 1.05, 0.12, 0, 2.5, -5.33, GLASS], [2.76, 0.3, 10.7, 0, 1.0, 0, '#2d3040'], ...wheels(1.2, [-3.4, 3.4], 0.5, 0.4, 0.9, 1.1)]),
}
const TRUCK = {
  paint: voxel([[2.5, 2.3, 2.5, 0, 1.75, -3.6, '#ffffff']]),
  trim: voxel([[2.7, 2.7, 6.2, 0, 2.05, 1.7, '#f4f1e8'], [2.54, 0.9, 0.12, 0, 2.2, -4.87, GLASS], ...wheels(1.15, [-3.4, 1.2, 3.5], 0.5, 0.4, 0.9, 1.1)]),
}

type Car = { a: number; b: number; t: number; speed: number }

export function Traffic({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const R = layout.R
  const kinds = useMemo(() => [
    { geo: CAR, n: 150, speed: [9, 15], colors: ['#ff5a5a', '#ffd23f', '#3d9cff', '#ffffff', '#5ad17a', '#ff9a3c', '#b36bff', '#2d3040'] },
    { geo: BUS, n: 36, speed: [7, 10], colors: ['#ff6b3d', '#3aa0ff', '#ffd23f', '#5ad17a'] },
    { geo: TRUCK, n: 26, speed: [6, 10], colors: ['#ff5a5a', '#3aa0ff', '#ff9a3c', '#8d5bff'] },
  ], [])
  const sim = useMemo(() => {
    const wv = net.verts.map((v) => v.clone().multiplyScalar(R + layout.ground(v)))
    if (!net.edges.length) return { wv, cars: kinds.map(() => [] as Car[]) }
    const cars = kinds.map((k) => Array.from({ length: k.n }, (): Car => {
      const e = net.edges[Math.floor(Math.random() * net.edges.length)]
      const flip = Math.random() < 0.5
      return { a: flip ? e[0] : e[1], b: flip ? e[1] : e[0], t: Math.random(), speed: k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]) }
    }))
    return { wv, cars }
  }, [net, R, kinds, layout])
  const paintRef = useRef<(THREE.InstancedMesh | null)[]>([])
  const trimRef = useRef<(THREE.InstancedMesh | null)[]>([])
  const mats = useMemo(() => ({ paint: flat({ roughness: 0.6 }), trim: flat() }), [])
  const tmp = useMemo(() => ({ A: new V(), B: new V(), p: new V(), up: new V(), dir: new V(), right: new V(), back: new V(), m: new THREE.Matrix4() }), [])

  useLayoutEffect(() => {
    const c = new THREE.Color()
    kinds.forEach((k, ki) => {
      sim.cars[ki].forEach((_, i) => paintRef.current[ki]!.setColorAt(i, c.set(k.colors[Math.floor(Math.random() * k.colors.length)])))
      if (paintRef.current[ki]!.instanceColor) paintRef.current[ki]!.instanceColor!.needsUpdate = true
    })
  }, [kinds, sim])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const { wv, cars } = sim
    kinds.forEach((_, ki) => {
      cars[ki].forEach((c, i) => {
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
        tmp.m.setPosition(tmp.p)
        paintRef.current[ki]!.setMatrixAt(i, tmp.m)
        trimRef.current[ki]!.setMatrixAt(i, tmp.m)
      })
      paintRef.current[ki]!.instanceMatrix.needsUpdate = true
      trimRef.current[ki]!.instanceMatrix.needsUpdate = true
    })
  })

  if (!net.edges.length) return null
  return (
    <group>
      {kinds.map((k, ki) => (
        <group key={ki}>
          <instancedMesh ref={(el) => { paintRef.current[ki] = el }} args={[k.geo.paint, mats.paint, k.n]} frustumCulled={false} raycast={() => null} />
          <instancedMesh ref={(el) => { trimRef.current[ki] = el }} args={[k.geo.trim, mats.trim, k.n]} frustumCulled={false} raycast={() => null} />
        </group>
      ))}
    </group>
  )
}

/** From orbit the normal streets are far too thin to see, so a much wider copy of the street grid is drawn that only shows from a distance. */
export function RoadLines({ net, layout }: { net: RoadNet; layout: SphereLayout }) {
  const { camera } = useThree()
  const group = useRef<THREE.Group>(null)
  const geos = useMemo(() => {
    const seg = (rural: boolean) => net.edges.filter((_, i) => !!net.rural[i] === rural).map(([a, b]) => [net.verts[a], net.verts[b]] as [THREE.Vector3, THREE.Vector3])
    return { city: buildRibbons(seg(false), layout, 3.2, 14), country: buildRibbons(seg(true), layout, 2, 14) }
  }, [net, layout])
  useEffect(() => () => { [...geos.city, ...geos.country].forEach((g) => g.dispose()) }, [geos])
  useFrame(() => { if (group.current) group.current.visible = camera.position.length() > layout.R * 1.3 })
  const colors = ['#f1e7c9', '#4a4f60', '#f2e27a']
  const mat = (i: number) => <meshStandardMaterial color={colors[i % 3]} roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
  return (
    <group ref={group}>
      {geos.country.map((g, i) => <mesh key={`c${i}`} geometry={g} raycast={() => null} frustumCulled={false}>{mat(i)}</mesh>)}
      {geos.city.map((g, i) => <mesh key={`t${i}`} geometry={g} raycast={() => null} frustumCulled={false}>{mat(i)}</mesh>)}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// elevated railways that circle the planet, with trains

const RAIL_ALT = 76

export function Railways({ R, ground }: { R: number; ground: (d: THREE.Vector3) => number }) {
  const rings = useMemo(() => {
    const axes = [new V(1, 0.15, 0.3), new V(0.2, 1, 0.1), new V(0.1, 0.35, 1), new V(1, -1, 0.7)].map((a) => a.normalize())
    return axes.map((axis) => {
      const b0 = new V().crossVectors(axis, Math.abs(axis.y) < 0.9 ? Y : new V(1, 0, 0)).normalize()
      const b1 = new V().crossVectors(axis, b0).normalize()
      return { axis, b0, b1 }
    })
  }, [])
  const SEG = 10
  const segs = Math.ceil((2 * Math.PI * (R + RAIL_ALT)) / SEG)
  const pillarsPerRing = Math.ceil(segs / 5)
  const railRef = useRef<THREE.InstancedMesh>(null)
  const pillarRef = useRef<THREE.InstancedMesh>(null)
  const geos = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const col = new THREE.BoxGeometry(1, 1, 1)
    col.translate(0, 0.5, 0)
    return { box, col }
  }, [])
  const carGeo = useMemo(() => ({
    paint: voxel([[3.0, 2.8, 9.2, 0, 1.9, 0, '#ffffff']]),
    trim: voxel([[3.06, 1.0, 8.0, 0, 2.4, 0, GLASS], [3.1, 0.28, 9.3, 0, 3.4, 0, '#e8eaf0'], [2.2, 0.5, 2.0, 0, 0.4, -3, '#2d3040'], [2.2, 0.5, 2.0, 0, 0.4, 3, '#2d3040']]),
  }), [])
  const trains = useMemo(() => {
    const palette = ['#ff5a5a', '#3aa0ff', '#ffd23f', '#5ad17a', '#ff9a3c', '#b36bff', '#ff6bb5', '#2fd4c4']
    const list: { ring: number; theta: number; dir: number; speed: number; color: string; cars: number }[] = []
    rings.forEach((_, ring) => {
      for (let k = 0; k < 2; k++) list.push({ ring, theta: Math.random() * Math.PI * 2, dir: k === 0 ? 1 : -1, speed: 26 + Math.random() * 8, color: palette[(ring * 2 + k) % palette.length], cars: 7 })
    })
    return list
  }, [rings])
  const total = trains.reduce((n, t) => n + t.cars, 0)
  const paintRef = useRef<THREE.InstancedMesh>(null)
  const trimRef = useRef<THREE.InstancedMesh>(null)
  const mats = useMemo(() => ({ paint: flat({ roughness: 0.55 }), trim: flat() }), [])
  const tmp = useMemo(() => ({ p: new V(), up: new V(), fwd: new V(), right: new V(), back: new V(), m: new THREE.Matrix4() }), [])

  const ringPoint = (r: (typeof rings)[number], th: number, out: THREE.Vector3) => out.copy(r.b0).multiplyScalar(Math.cos(th)).addScaledVector(r.b1, Math.sin(th))
  const ringTangent = (r: (typeof rings)[number], th: number, out: THREE.Vector3) => out.copy(r.b0).multiplyScalar(-Math.sin(th)).addScaledVector(r.b1, Math.cos(th))

  useLayoutEffect(() => {
    const dth = (2 * Math.PI) / segs
    const A = new V(), B = new V(), M = new V(), fwd = new V(), up = new V(), right = new V(), mm = new THREE.Matrix4(), s = new THREE.Matrix4()
    rings.forEach((r, ri) => {
      for (let i = 0; i < segs; i++) {
        ringPoint(r, i * dth, A); ringPoint(r, (i + 1) * dth, B)
        M.copy(A).add(B).normalize()
        fwd.copy(B).sub(A).normalize()
        up.copy(M)
        right.crossVectors(up, fwd).normalize()
        mm.makeBasis(right, up, fwd)
        s.makeScale(4.2, 0.7, SEG + 0.3)
        mm.multiply(s)
        mm.setPosition(M.clone().multiplyScalar(R + RAIL_ALT))
        railRef.current!.setMatrixAt(ri * segs + i, mm)
        if (i % 5 === 0) {
          // a pillar from the ground up to the track; where a mountain is higher than the track, the train runs through a tunnel
          const g = ground(M)
          mm.makeBasis(right, up, fwd)
          s.makeScale(2.2, Math.max(0.001, g > RAIL_ALT - 4 ? 0.001 : RAIL_ALT - g), 2.2)
          mm.multiply(s)
          mm.setPosition(M.clone().multiplyScalar(R + g))
          pillarRef.current!.setMatrixAt(ri * pillarsPerRing + i / 5, mm)
        }
      }
    })
    railRef.current!.instanceMatrix.needsUpdate = true
    pillarRef.current!.instanceMatrix.needsUpdate = true
    const c = new THREE.Color()
    let n = 0
    trains.forEach((t) => { for (let k = 0; k < t.cars; k++) paintRef.current!.setColorAt(n++, c.set(k === 0 ? '#f6f3ea' : t.color)) })
    if (paintRef.current!.instanceColor) paintRef.current!.instanceColor.needsUpdate = true
  }, [rings, segs, trains, R, pillarsPerRing, ground])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    let n = 0
    trains.forEach((t) => {
      t.theta += (t.dir * t.speed * dt) / (R + RAIL_ALT)
      const r = rings[t.ring]
      for (let k = 0; k < t.cars; k++) {
        const th = t.theta - (t.dir * (k * 10.4)) / (R + RAIL_ALT)
        ringPoint(r, th, tmp.up)
        ringTangent(r, th, tmp.fwd).multiplyScalar(t.dir)
        tmp.p.copy(tmp.up).multiplyScalar(R + RAIL_ALT + 0.4)
        tmp.right.crossVectors(tmp.fwd, tmp.up).normalize()
        tmp.back.copy(tmp.fwd).negate()
        tmp.m.makeBasis(tmp.right, tmp.up, tmp.back)
        tmp.m.setPosition(tmp.p)
        paintRef.current!.setMatrixAt(n, tmp.m)
        trimRef.current!.setMatrixAt(n, tmp.m)
        n++
      }
    })
    paintRef.current!.instanceMatrix.needsUpdate = true
    trimRef.current!.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={railRef} args={[geos.box, undefined, segs * rings.length]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color="#8a90a0" flatShading roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={pillarRef} args={[geos.col, undefined, pillarsPerRing * rings.length]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color="#b8bcc8" flatShading roughness={1} />
      </instancedMesh>
      <instancedMesh ref={paintRef} args={[carGeo.paint, mats.paint, total]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={trimRef} args={[carGeo.trim, mats.trim, total]} frustumCulled={false} raycast={() => null} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// sky life: blocky clouds and planes that circle the planet

type Orbiter = { axis: THREE.Vector3; b0: THREE.Vector3; alt: number; rate: number; phase: number; scale: number; shape: number }

function useOrbiters(count: number, R: number, alt: [number, number], speed: [number, number], shapes = 1): Orbiter[] {
  return useMemo(() => Array.from({ length: count }, () => {
    const axis = new V(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
    const b0 = new V().crossVectors(axis, Math.abs(axis.y) < 0.9 ? Y : new V(1, 0, 0)).normalize()
    const a = alt[0] + Math.random() * (alt[1] - alt[0])
    const mps = speed[0] + Math.random() * (speed[1] - speed[0])
    return { axis, b0, alt: a, rate: (mps / (R + a)) * (Math.random() < 0.5 ? 1 : -1), phase: Math.random() * Math.PI * 2, scale: 0.8 + Math.random() * 0.8, shape: Math.floor(Math.random() * shapes) }
  }), [count, R, alt, speed, shapes])
}

type OrbitTmp = { p: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3; back: THREE.Vector3; m: THREE.Matrix4 }
function orbitMatrix(o: Orbiter, t: number, R: number, tmp: OrbitTmp) {
  const a = o.phase + o.rate * t
  tmp.p.copy(o.b0).applyAxisAngle(o.axis, a)
  tmp.fwd.crossVectors(o.axis, tmp.p).normalize()
  if (o.rate < 0) tmp.fwd.negate()
  tmp.right.crossVectors(tmp.fwd, tmp.p).normalize()
  tmp.back.copy(tmp.fwd).negate()
  tmp.m.makeBasis(tmp.right, tmp.p, tmp.back)
  tmp.m.setPosition(tmp.p.clone().multiplyScalar(R + o.alt))
  return tmp.m
}

const CLOUD_SHAPES = [
  voxel([[14, 5, 8, 0, 0, 0, '#ffffff'], [9, 6, 7, -3, 4, 0, '#ffffff'], [8, 5, 7, 5, 3, 0, '#ffffff']]),
  voxel([[10, 4, 7, 0, 0, 0, '#ffffff'], [14, 4, 6, 2, 3, 0, '#ffffff'], [6, 4, 6, -4, 5, 0, '#ffffff']]),
  voxel([[18, 4, 8, 0, 0, 0, '#ffffff'], [8, 5, 6, 2, 4, 0, '#ffffff']]),
]

export function Clouds({ R, count = 70 }: { R: number; count?: number }) {
  const orb = useOrbiters(count, R, [280, 430], [1.5, 4], 3)
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const idx = useMemo(() => CLOUD_SHAPES.map((_, s) => orb.map((o, i) => (o.shape === s ? i : -1)).filter((i) => i >= 0)), [orb])
  const tmp = useMemo(() => ({ p: new V(), fwd: new V(), right: new V(), back: new V(), m: new THREE.Matrix4(), s: new THREE.Matrix4() }), [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    idx.forEach((list, s) => {
      list.forEach((oi, n) => {
        const o = orb[oi]
        const m = orbitMatrix(o, t, R, tmp)
        tmp.s.makeScale(o.scale * 2.4, o.scale * 2.4, o.scale * 2.4)
        m.multiply(tmp.s)
        refs.current[s]!.setMatrixAt(n, m)
      })
      refs.current[s]!.instanceMatrix.needsUpdate = true
    })
  })
  return (
    <group>
      {CLOUD_SHAPES.map((g, s) => (
        <instancedMesh key={s} ref={(el) => { refs.current[s] = el }} args={[g, undefined, Math.max(1, idx[s].length)]} frustumCulled={false} raycast={() => null}>
          <meshStandardMaterial vertexColors flatShading roughness={1} emissive="#ffffff" emissiveIntensity={0.5} />
        </instancedMesh>
      ))}
    </group>
  )
}

const PLANE = {
  paint: voxel([[1.7, 1.7, 9, 0, 0, 0, '#ffffff'], [0.4, 2.4, 1.8, 0, 1.6, 3.6, '#ffffff']]),
  trim: voxel([[11, 0.3, 2.4, 0, -0.1, 0.4, '#f0f2f7'], [4, 0.25, 1.4, 0, 0.9, 3.9, '#f0f2f7'], [1.72, 0.45, 5, 0, 0.35, -0.5, GLASS]]),
}

export function Planes({ R, count = 7 }: { R: number; count?: number }) {
  const orb = useOrbiters(count, R, [330, 440], [40, 55])
  const paint = useRef<THREE.InstancedMesh>(null)
  const trim = useRef<THREE.InstancedMesh>(null)
  const mats = useMemo(() => ({ paint: flat({ roughness: 0.5 }), trim: flat() }), [])
  const tmp = useMemo(() => ({ p: new V(), fwd: new V(), right: new V(), back: new V(), m: new THREE.Matrix4() }), [])
  useLayoutEffect(() => {
    const c = new THREE.Color()
    const pal = ['#ff5a5a', '#3aa0ff', '#ffd23f', '#5ad17a', '#ff9a3c', '#b36bff', '#ffffff']
    orb.forEach((_, i) => paint.current!.setColorAt(i, c.set(pal[i % pal.length])))
    if (paint.current!.instanceColor) paint.current!.instanceColor.needsUpdate = true
  }, [orb])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    orb.forEach((o, i) => { const m = orbitMatrix(o, t, R, tmp); paint.current!.setMatrixAt(i, m); trim.current!.setMatrixAt(i, m) })
    paint.current!.instanceMatrix.needsUpdate = true
    trim.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={paint} args={[PLANE.paint, mats.paint, count]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={trim} args={[PLANE.trim, mats.trim, count]} frustumCulled={false} raycast={() => null} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// ground, sky, atmosphere

export function makeGroundMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
}

/** Bright daytime sky around you; deep space with stars when the whole planet is in view. `space` is 0 on the ground, 1 in orbit. */
export function SkyDome({ R, up, space, zenith, horizon }: { R: number; up: React.MutableRefObject<THREE.Vector3>; space: React.MutableRefObject<number>; zenith: string; horizon: string }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uUp: { value: new V(0, 1, 0) }, uSpace: { value: 0 }, uZenith: { value: new THREE.Color(zenith) }, uHorizon: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uUp; uniform float uSpace; uniform vec3 uZenith; uniform vec3 uHorizon;
      void main() {
        vec3 d = normalize(vDir);
        float t = dot(d, uUp);
        vec3 day = mix(uHorizon, uZenith, smoothstep(0.0, 0.75, t));
        day = mix(day, uHorizon * 0.9, smoothstep(0.0, -0.3, t));
        vec3 space = vec3(0.012, 0.014, 0.04) + vec3(0.04, 0.02, 0.09) * pow(max(dot(d, normalize(vec3(0.5, 0.3, -0.8))), 0.0), 5.0);
        gl_FragColor = vec4(mix(day, space, uSpace), 1.0);
      }`,
  }), [zenith, horizon])
  useFrame(() => { material.uniforms.uUp.value.copy(up.current); material.uniforms.uSpace.value = space.current })
  return (
    <mesh renderOrder={-10} material={material} frustumCulled={false}>
      <sphereGeometry args={[R * 16, 32, 24]} />
    </mesh>
  )
}

export function Atmosphere({ R, color = '#66b8ff' }: { R: number; color?: string }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uColor;
      void main() { float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.6); gl_FragColor = vec4(uColor * f * 1.3, f); }`,
  }), [color])
  return (
    <mesh material={material} raycast={() => null}>
      <sphereGeometry args={[R * 1.1, 64, 48]} />
    </mesh>
  )
}

export { frontDir }

// ---------------------------------------------------------------------------------------------------------------------
// landscape: forests, sea, waterfalls

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Woods in the wilderness: round trees on the plains, pines on the slopes. The same trees for everyone (seeded). */
export function Forest({ layout, count = 9000 }: { layout: SphereLayout; count?: number }) {
  const R = layout.R
  const trunk = useRef<THREE.InstancedMesh>(null)
  const oak = useRef<THREE.InstancedMesh>(null)
  const pine = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    return {
      box,
      oak: voxel([[3.6, 2.0, 3.6, 0, 2.8, 0, '#ffffff'], [2.6, 1.7, 2.6, 0, 4.6, 0, '#ffffff'], [1.4, 1.2, 1.4, 0, 5.9, 0, '#ffffff']]),
      pine: voxel([[3.8, 1.3, 3.8, 0, 2.2, 0, '#ffffff'], [3.0, 1.4, 3.0, 0, 3.4, 0, '#ffffff'], [2.2, 1.4, 2.2, 0, 4.7, 0, '#ffffff'], [1.4, 1.4, 1.4, 0, 6.0, 0, '#ffffff'], [0.6, 1.0, 0.6, 0, 7.2, 0, '#ffffff']]),
    }
  }, [])
  const trees = useMemo(() => {
    const T = layout.terrain
    const rng = seeded(424242)
    const d = new V()
    const out: { pos: THREE.Vector3; up: THREE.Vector3; s: number; pine: boolean; color: THREE.Color }[] = []
    const oakCols = layout.theme.trees.oak
    const pineCols = layout.theme.trees.pine
    const want = Math.round(count * layout.theme.forest)
    let tries = 0
    while (out.length < want && tries < want * 12) {
      tries++
      d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      const l = d.lengthSq()
      if (l > 1 || l < 0.01) continue
      d.normalize()
      if (T.cityMask(d) > 0.02) continue
      const e = T.elevation(d)
      if (e < 3.5 || e > 118 * T.scale) continue
      if (fbm(d.x * 13 + 3, d.y * 13, d.z * 13 + 8, 2) < -0.04 && rng() < 0.85) continue // clumps, with clearings
      const isPine = e > 38 * T.scale || rng() < 0.3
      const pos = d.clone().multiplyScalar(R + e)
      const color = new THREE.Color(isPine ? pineCols[Math.floor(rng() * pineCols.length)] : oakCols[Math.floor(rng() * oakCols.length)])
      if (e > 95 * T.scale) color.lerp(new THREE.Color('#ffffff'), 0.45)
      out.push({ pos, up: d.clone(), s: 0.9 + rng() * 1.0, pine: isPine, color })
    }
    return out
  }, [layout, R, count])

  useLayoutEffect(() => {
    const q = new THREE.Quaternion(), m = new THREE.Matrix4(), sc = new V()
    let o = 0, p = 0
    trees.forEach((t, i) => {
      q.setFromUnitVectors(Y, t.up)
      m.compose(t.pos, q, sc.set(0.8 * t.s, 2.6 * t.s, 0.8 * t.s))
      trunk.current!.setMatrixAt(i, m)
      m.compose(t.pos, q, sc.set(t.s, t.s, t.s))
      const mesh = t.pine ? pine.current! : oak.current!
      const idx = t.pine ? p++ : o++
      mesh.setMatrixAt(idx, m)
      mesh.setColorAt(idx, t.color)
    })
    oak.current!.count = o
    pine.current!.count = p
    for (const r of [trunk, oak, pine]) {
      r.current!.instanceMatrix.needsUpdate = true
      if (r.current!.instanceColor) r.current!.instanceColor.needsUpdate = true
    }
  }, [trees])

  const n = Math.max(1, trees.length)
  return (
    <group>
      <instancedMesh ref={trunk} args={[geo.box, undefined, n]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color="#7a5232" flatShading roughness={1} />
      </instancedMesh>
      <instancedMesh ref={oak} args={[geo.oak, undefined, n]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </instancedMesh>
      <instancedMesh ref={pine} args={[geo.pine, undefined, n]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </instancedMesh>
    </group>
  )
}

/** One sea level for the whole planet: every dip in the land below 0 m becomes a lake or a sea. */
export function Water({ R, color = '#4db8ee' }: { R: number; color?: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  // seen from far away the sea sits a little higher above the land, so the shoreline does not flicker
  useFrame(() => {
    if (!ref.current) return
    const h = Math.max(0, camera.position.length() - R)
    const s = (R + 0.1 + Math.min(h * 0.0006, 1.6)) / (R + 0.1)
    ref.current.scale.setScalar(s)
  })
  return (
    <mesh ref={ref} raycast={() => null}>
      <sphereGeometry args={[R + 0.1, 160, 110]} />
      <meshStandardMaterial color={color} transparent opacity={0.84} roughness={0.2} metalness={0.05} />
    </mesh>
  )
}

/** Waterfalls where steep ground drops into a lake. */
export function Waterfalls({ layout }: { layout: SphereLayout }) {
  const R = layout.R
  const fall = useRef<THREE.InstancedMesh>(null)
  const mist = useRef<THREE.InstancedMesh>(null)
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64; c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#8fd3ff'
    g.fillRect(0, 0, 64, 256)
    const rng = seeded(99)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.45 + rng() * 0.5})`
      g.fillRect(rng() * 60, rng() * 256, 2 + rng() * 5, 30 + rng() * 90)
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const falls = useMemo(() => {
    const T = layout.terrain
    const rng = seeded(777)
    const d = new V(), t1 = new V(), t2 = new V(), probe = new V()
    const out: { top: THREE.Vector3; base: THREE.Vector3 }[] = []
    let tries = 0
    while (out.length < 26 && tries < 14000) {
      tries++
      d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      const l = d.lengthSq()
      if (l > 1 || l < 0.01) continue
      d.normalize()
      if (T.cityMask(d) > 0.02) continue
      const e0 = T.elevation(d)
      if (e0 < 20 * T.scale || e0 > 125 * T.scale) continue
      t1.crossVectors(d, Y)
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0)
      t1.normalize()
      t2.crossVectors(d, t1)
      const h = 14 / R
      const el = (a: number, b: number) => T.elevation(probe.copy(d).addScaledVector(t1, a * h).addScaledVector(t2, b * h).normalize())
      const gx = (el(1, 0) - el(-1, 0)) / 28, gy = (el(0, 1) - el(0, -1)) / 28
      const slope = Math.hypot(gx, gy)
      if (slope < 0.45 * Math.max(0.5, T.scale)) continue
      const dx = -gx / slope, dy = -gy / slope // straight downhill
      let reached = -1
      for (let step = 1; step <= 16; step++) {
        const dist = step * 8
        probe.copy(d).addScaledVector(t1, (dx * dist) / R).addScaledVector(t2, (dy * dist) / R).normalize()
        if (T.elevation(probe) < 0.3) { reached = dist; break }
      }
      if (reached < 0) continue
      if (out.some((o) => o.top.clone().normalize().angleTo(d) * R < 320)) continue
      out.push({ top: d.clone().multiplyScalar(R + e0), base: probe.clone().multiplyScalar(R + 0.3) })
    }
    return out
  }, [layout, R])
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), s = new THREE.Matrix4()
    const mid = new V(), dir = new V(), up = new V(), x = new V(), y = new V()
    falls.forEach((f, i) => {
      mid.copy(f.top).add(f.base).multiplyScalar(0.5)
      up.copy(mid).normalize()
      dir.copy(f.base).sub(f.top)
      const len = dir.length()
      dir.normalize()
      x.crossVectors(up, dir).normalize()
      y.crossVectors(dir, x).normalize()
      m.makeBasis(x, y, dir)
      s.makeScale(6, 1.1, len + 2)
      const mat = m.clone().multiply(s)
      mat.setPosition(mid.clone().addScaledVector(y, 1.0))
      fall.current!.setMatrixAt(i, mat)
      const b = f.base.clone().normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(Y, b)
      mist.current!.setMatrixAt(i, new THREE.Matrix4().compose(f.base.clone().addScaledVector(b, 1.2), q, new V(11, 2.2, 11)))
    })
    fall.current!.instanceMatrix.needsUpdate = true
    mist.current!.instanceMatrix.needsUpdate = true
  }, [falls])

  useFrame((_, dt) => { tex.offset.y -= Math.min(dt, 0.1) * 1.3 })
  const n = Math.max(1, falls.length)
  return (
    <group>
      <instancedMesh ref={fall} args={[geo, undefined, n]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial map={tex} transparent opacity={0.92} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={mist} args={[geo, undefined, n]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
