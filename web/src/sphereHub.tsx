import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Stream } from './api'
import { GROUPS, groupIndex } from './sphereLayout'
import { loadGLTF } from './sphereModels'

/** Streamers with at least this many viewers live on the island at the centre of the system. */
export const ELITE_VIEWERS = 3000

/** If a downloaded island model is dropped at /models/hub/island.glb it is used as the island itself. */
function useIslandModel() {
  const [model, setModel] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    let live = true
    loadGLTF('/models/hub/island.glb').then((g) => {
      if (!live) return
      const root = g.scene.clone(true)
      const box = new THREE.Box3().setFromObject(root)
      const size = box.getSize(new THREE.Vector3())
      const k = (ISLAND_R * 2.3) / Math.max(size.x, size.z)
      root.scale.setScalar(k)
      root.position.set(-(box.min.x + size.x / 2) * k, 90 - box.max.y * k, -(box.min.z + size.z / 2) * k)
      setModel(root)
    }).catch(() => {})
    return () => { live = false }
  }, [])
  return model
}
const ISLAND_R = 2100

/**
 * The centre of the system: a floating high-tech island that hosts only the streamers with 10,000 or more viewers.
 * One tower per streamer, the biggest in the middle, glowing in the colour of its genre. Click a tower to go to it.
 */
export function TechIsland({ elite, selected, onPickStream, onPickIsland }: { elite: Stream[]; selected?: string; onPickStream: (s: Stream) => void; onPickIsland?: () => void }) {

  const towers = useMemo(() => {
    const max = Math.max(ELITE_VIEWERS + 1, ...elite.map((s) => s.viewers))
    const golden = Math.PI * (3 - Math.sqrt(5))
    return elite.map((s, i) => {
      const norm = Math.sqrt((s.viewers - ELITE_VIEWERS) / (max - ELITE_VIEWERS))
      const r = Math.sqrt((i + 0.6) / Math.max(1, elite.length)) * ISLAND_R * 0.56
      const a = i * golden
      const w = 62 + norm * 80
      return { s, x: Math.cos(a) * r, z: Math.sin(a) * r, w, h: 150 + norm * 620, color: new THREE.Color(GROUPS[groupIndex(s.game)].color) }
    })
  }, [elite])

  const bodies = useRef<THREE.InstancedMesh>(null)
  const caps = useRef<THREE.InstancedMesh>(null)
  const rings = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)
  const [hover, setHover] = useState(-1)
  const model = useIslandModel()

  useEffect(() => {
    const b = bodies.current, c = caps.current
    if (!b || !c) return
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    towers.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 120 + t.h / 2, t.z), q, s.set(t.w, t.h, t.w))
      b.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(t.x, 120 + t.h + 9, t.z), q, s.set(t.w * 1.08, 18, t.w * 1.08))
      c.setMatrixAt(i, m)
      c.setColorAt(i, t.color.clone().multiplyScalar(2.2))
    })
    b.count = c.count = towers.length
    b.instanceMatrix.needsUpdate = c.instanceMatrix.needsUpdate = true
    if (c.instanceColor) c.instanceColor.needsUpdate = true
    b.computeBoundingSphere()
  }, [towers])

  useFrame((state, dt) => {
    if (rings.current) { rings.current.rotation.y += dt * 0.08; rings.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.04 }
    if (core.current) { core.current.rotation.y += dt * 0.6; core.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.05) }
  })

  const glow = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128)
    grad.addColorStop(0, 'rgba(210,250,255,1)'); grad.addColorStop(0.3, 'rgba(90,200,255,0.5)'); grad.addColorStop(1, 'rgba(60,120,255,0)')
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  }, [])
  const pad = useMemo(() => new THREE.CylinderGeometry(ISLAND_R * 0.7, ISLAND_R * 0.74, 60, 8), [])
  const hot = hover >= 0 ? towers[hover] : null
  const pick = selected ? towers.find((t) => t.s.login === selected) : undefined

  return (
    <group>
      {model && <primitive object={model} />}
      {/* the slab and the rock under it */}
      {!model && <>
      <mesh position={[0, 0, 0]} onClick={(e) => { e.stopPropagation(); onPickIsland?.() }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <cylinderGeometry args={[ISLAND_R, ISLAND_R * 0.9, 160, 12]} />
        <meshStandardMaterial color="#1c2136" roughness={0.55} metalness={0.5} flatShading />
      </mesh>
      <mesh position={[0, -880, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null}>
        <coneGeometry args={[ISLAND_R * 0.9, 1600, 12, 1, true]} />
        <meshStandardMaterial color="#2a2744" roughness={1} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={core} position={[0, -1050, 0]} raycast={() => null}>
        <octahedronGeometry args={[260, 0]} />
        <meshBasicMaterial color={[0.4, 1.8, 2.6]} toneMapped={false} />
      </mesh>
      </>}
      {/* the landing pad the towers stand on */}
      <mesh geometry={pad} position={[0, 100, 0]} raycast={() => null}>
        <meshStandardMaterial color="#262c47" roughness={0.5} metalness={0.4} flatShading />
      </mesh>
      {/* glowing edges */}
      <mesh position={[0, 82, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[ISLAND_R * 0.99, 14, 6, 12]} />
        <meshBasicMaterial color={[0.3, 1.9, 2.6]} toneMapped={false} />
      </mesh>
      <mesh position={[0, 134, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[ISLAND_R * 0.71, 9, 6, 8]} />
        <meshBasicMaterial color={[1.6, 0.5, 2.6]} toneMapped={false} />
      </mesh>
      <group ref={rings}>
        {[1.18, 1.34].map((k, i) => (
          <mesh key={i} rotation={[Math.PI / 2 + (i ? 0.25 : -0.18), 0, 0]} raycast={() => null}>
            <torusGeometry args={[ISLAND_R * k, 6, 5, 48]} />
            <meshBasicMaterial color={i ? [0.9, 0.6, 2.6] : [0.3, 1.8, 2.6]} toneMapped={false} transparent opacity={0.7} />
          </mesh>
        ))}
      </group>
      {/* the towers: one per streamer with 10k+ viewers */}
      <instancedMesh ref={bodies} args={[undefined, undefined, Math.max(1, towers.length)]}
        onPointerOver={(e) => { e.stopPropagation(); if (e.instanceId !== undefined) { setHover(e.instanceId); document.body.style.cursor = 'pointer' } }}
        onPointerOut={() => { setHover(-1); document.body.style.cursor = 'auto' }}
        onClick={(e) => { e.stopPropagation(); if (e.instanceId !== undefined && towers[e.instanceId]) onPickStream(towers[e.instanceId].s) }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#323b5c" roughness={0.35} metalness={0.6} flatShading />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, Math.max(1, towers.length)]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      {/* a spire at the very middle and the glow that replaces the sun */}
      <mesh position={[0, 120 + 1500, 0]} raycast={() => null}>
        <coneGeometry args={[34, 3000, 6]} />
        <meshBasicMaterial color={[0.5, 1.8, 2.6]} toneMapped={false} transparent opacity={0.55} />
      </mesh>
      <sprite scale={[ISLAND_R * 6, ISLAND_R * 6, 1]} raycast={() => null}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.8} />
      </sprite>
      {pick && (
        <mesh position={[pick.x, 120 + pick.h + 700, pick.z]} raycast={() => null}>
          <cylinderGeometry args={[10, 26, 1400, 10, 1, true]} />
          <meshBasicMaterial color={[2.4, 2.4, 0.8]} toneMapped={false} transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {hot && (
        <Html position={[hot.x, 120 + hot.h + 120, hot.z]} center style={{ pointerEvents: 'none' }}>
          <div style={{ background: '#0b0e1af0', border: '1px solid #5ad7ff', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 13, whiteSpace: 'nowrap' }}>
            <b>{hot.s.displayName}</b><br /><span style={{ opacity: 0.75 }}>{hot.s.game} · {hot.s.viewers.toLocaleString()} watching</span>
          </div>
        </Html>
      )}
    </group>
  )
}
