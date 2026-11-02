import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { SphereLayout } from './sphereLayout'
import { frame } from './stations/placement'

type Part = THREE.BufferGeometry

const geoOf = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, ry = 0): Part => {
  const out = g.index ? g.toNonIndexed() : g
  if (ry) out.rotateY(ry)
  out.translate(x, y, z)
  const c = new THREE.Color(color), n = out.getAttribute('position').count, col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.deleteAttribute('uv')
  return out
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string, ry = 0) => geoOf(new THREE.BoxGeometry(w, h, d), c, x, y, z, ry)
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, c: string, seg = 12) => geoOf(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z)
const cone = (r: number, h: number, x: number, y: number, z: number, c: string, seg = 12, ry = 0) => geoOf(new THREE.ConeGeometry(r, h, seg), c, x, y, z, ry)
const ball = (r: number, x: number, y: number, z: number, c: string) => geoOf(new THREE.SphereGeometry(r, 10, 7), c, x, y, z)

export type WonderId = 'pyramids' | 'eiffel' | 'colosseum' | 'taj' | 'liberty' | 'chichen' | 'christ' | 'wall'
export const WONDERS: { id: WonderId; name: string; height: number }[] = [
  { id: 'pyramids', name: 'Great Pyramid of Giza', height: 110 },
  { id: 'eiffel', name: 'Eiffel Tower', height: 190 },
  { id: 'colosseum', name: 'Colosseum', height: 56 },
  { id: 'taj', name: 'Taj Mahal', height: 80 },
  { id: 'chichen', name: 'Chichen Itza', height: 90 },
  { id: 'christ', name: 'Christ the Redeemer', height: 130 },
  { id: 'wall', name: 'Great Wall of China', height: 30 },
]

function build(id: WonderId): THREE.BufferGeometry {
  const p: Part[] = []
  const slab = (s: number, c = '#8a9468') => p.push(box(s, 12, s, 0, -5, 0, c))
  switch (id) {
    case 'pyramids':
      slab(210)
      p.push(cone(92, 110, 0, 55, 0, '#dbb56b', 4, Math.PI / 4))
      p.push(cone(54, 64, -78, 32, 62, '#d2ab62', 4, Math.PI / 4))
      p.push(cone(40, 48, 70, 24, 70, '#d2ab62', 4, Math.PI / 4))
      p.push(box(22, 14, 40, 78, 7, -64, '#c79d56'), box(10, 10, 12, 78, 17, -80, '#c79d56'))
      break
    case 'eiffel':
      slab(130, '#7d8a63')
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        for (let i = 0; i < 7; i++) p.push(box(11 - i * 0.9, 12, 11 - i * 0.9, sx * (46 - i * 5.4), 6 + i * 11, sz * (46 - i * 5.4), '#6f5f4e'))
      p.push(box(70, 5, 70, 0, 80, 0, '#7d6c59'), box(58, 3, 58, 0, 84, 0, '#8a7863'))
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        for (let i = 0; i < 6; i++) p.push(box(7 - i * 0.6, 14, 7 - i * 0.6, sx * (18 - i * 2.5), 90 + i * 14, sz * (18 - i * 2.5), '#6f5f4e'))
      p.push(box(26, 4, 26, 0, 170, 0, '#7d6c59'), cone(6, 50, 0, 198, 0, '#6f5f4e', 6))
      break
    case 'colosseum': {
      slab(200)
      const n = 40
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = Math.cos(a) * 78, z = Math.sin(a) * 78
        const h = i % 9 === 0 ? 30 : 52
        p.push(box(20.5, h, 7, x, h / 2, z, '#cdbb94', -a + Math.PI / 2))
        for (const lv of [10, 28]) if (lv < h) p.push(box(8, 11, 1.2, x + Math.cos(a) * 3.6, lv, z + Math.sin(a) * 3.6, '#4a3f33', -a + Math.PI / 2))
        p.push(box(20.5, 2, 9, x, h + 1, z, '#b9a77f', -a + Math.PI / 2))
      }
      p.push(cyl(52, 52, 1.2, 0, 0.6, 0, '#c8a96a', 24))
      break
    }
    case 'taj':
      slab(210)
      p.push(box(120, 8, 120, 0, 4, 0, '#f1ece0'))
      p.push(box(56, 34, 56, 0, 25, 0, '#f6f2e8'), box(18, 24, 3, 0, 22, 28.5, '#c7bfb0'))
      p.push(ball(26, 0, 70, 0, '#f6f2e8'), cone(2, 16, 0, 98, 0, '#e6c14a', 6))
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        p.push(cyl(3.4, 4.2, 60, sx * 58, 38, sz * 58, '#f6f2e8', 10), ball(5, sx * 58, 70, sz * 58, '#f6f2e8'))
        p.push(ball(8, sx * 32, 48, sz * 32, '#f6f2e8'))
      }
      p.push(box(14, 0.6, 90, 0, 8.4, 76, '#4aa3d8'))
      break
    case 'liberty':
      slab(110, '#8a9468')
      p.push(box(60, 16, 60, 0, 6, 0, '#9a9690'), box(44, 12, 44, 0, 20, 0, '#a9a49a'), box(26, 40, 26, 0, 46, 0, '#c9c4b8'))
      p.push(cyl(9, 13, 44, 0, 88, 0, '#6fb5a0', 10), ball(8, 0, 117, 0, '#6fb5a0'))
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI; p.push(box(2, 12, 2, Math.cos(a) * 8, 125 + Math.sin(a) * 5, 0, '#6fb5a0', 0)) }
      p.push(box(5, 40, 5, 14, 125, 0, '#6fb5a0'), cone(4, 12, 14, 152, 0, '#ffd84d', 8), box(4, 14, 10, -12, 100, 8, '#5fa592'))
      break
    case 'chichen':
      slab(210)
      for (let i = 0; i < 5; i++) p.push(box(150 - i * 24, 14, 150 - i * 24, 0, 7 + i * 14, 0, i % 2 ? '#b2a888' : '#bdb494'))
      p.push(box(32, 20, 32, 0, 80, 0, '#c9c0a1'), box(14, 12, 2, 0, 76, 16.5, '#4a3f33'))
      for (let i = 0; i < 9; i++) p.push(box(18, 2, 8, 0, 2 + i * 7.5, 82 - i * 9, '#aea585'))
      break
    case 'christ':
      p.push(cone(130, 70, 0, 30, 0, '#6e8f52', 14))
      p.push(box(24, 26, 24, 0, 74, 0, '#d8d6cc'))
      p.push(cyl(8, 14, 46, 0, 110, 0, '#eeeee8', 10), ball(6, 0, 140, 0, '#eeeee8'))
      p.push(box(76, 5, 7, 0, 128, 0, '#eeeee8'), box(10, 14, 8, -34, 120, 0, '#eeeee8'), box(10, 14, 8, 34, 120, 0, '#eeeee8'))
      break
    case 'wall': {
      slab(260, '#7f8a63')
      const pts: [number, number][] = [[-110, -40], [-60, 20], [-10, -30], [40, 25], [90, -20], [120, 35]]
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz)
        p.push(box(len + 6, 16, 9, (x1 + x2) / 2, 8, (z1 + z2) / 2, '#a09681', -Math.atan2(dz, dx)))
        p.push(box(len + 6, 3, 11, (x1 + x2) / 2, 17, (z1 + z2) / 2, '#8c826c', -Math.atan2(dz, dx)))
      }
      for (const [x, z] of pts) p.push(box(20, 30, 20, x, 15, z, '#a39a85'), box(24, 4, 24, x, 32, z, '#b04a3a'), cone(15, 14, x, 41, z, '#b04a3a', 4, Math.PI / 4))
      break
    }
  }
  return mergeGeometries(p, false)!
}

/** Seven world wonders per planet, each on a reserved plot of open ground inside the city, with a beam you can see from orbit. */
export function Wonders({ layout }: { layout: SphereLayout }) {
  const { camera } = useThree()
  const R = layout.R
  const spots = useMemo(() => {
    let h = 2166136261
    for (const ch of layout.theme.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    const rand = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296 }
    const order = [...WONDERS].sort(() => rand() - 0.5)
    // the seven sites the layout kept free inside the city, one wonder on each
    return layout.sites.map((site, i) => ({ dir: site.dir.clone(), radius: site.radius, wonder: order[i % order.length] }))
  }, [layout])
  if (import.meta.env.DEV) (window as unknown as { __wonders: unknown }).__wonders = spots
  const geos = useMemo(() => new Map(WONDERS.map((w) => [w.id, build(w.id)])), [])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  const beam = useRef<THREE.Group>(null)
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd84d', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  const gemMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0 }), [])
  useFrame((st) => {
    const alt = camera.position.length() - R
    const k = THREE.MathUtils.smoothstep(alt, R * 0.12, R * 0.6)
    beamMat.opacity = 0.6 * k
    gemMat.opacity = k
    beam.current?.children.forEach((g, i) => { g.rotation.y = st.clock.elapsedTime * 0.8 + i })
  })
  const mats = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }), [])
  const H = R * 0.2
  return (
    <>
      {spots.map(({ dir, wonder, radius }, i) => {
        const pos = dir.clone().multiplyScalar(R + layout.ground(dir))
        const q = frame(dir).rotation
        return (
          <group key={i} position={pos} quaternion={q}>
            <mesh geometry={geos.get(wonder.id)} material={mats} scale={0.68 * (radius / 95)} />
            <mesh position={[0, H / 2 + 60, 0]} material={beamMat} raycast={() => null}>
              <cylinderGeometry args={[R * 0.0035, R * 0.0035, H, 8, 1, true]} />
            </mesh>
          </group>
        )
      })}
      <group ref={beam}>
        {spots.map(({ dir }, i) => (
          <mesh key={i} position={dir.clone().multiplyScalar(R + layout.ground(dir) + H + 120)} material={gemMat} raycast={() => null}>
            <octahedronGeometry args={[R * 0.012, 0]} />
          </mesh>
        ))}
      </group>
    </>
  )
}
