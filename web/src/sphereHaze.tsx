import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COUNTRY_COLORS, type SphereLayout } from './sphereLayout'

type Grid = { near: (p: THREE.Vector3, fn: (i: number) => void) => void }

/**
 * Every game's country is a different colour of smoke hanging over its land, so the borders can be read from orbit
 * without painting the ground itself. The shell follows the terrain and fades to a faint film when you are down in the streets.
 */
export function Haze({ layout, grid }: { layout: SphereLayout; grid: Grid }) {
  const { camera } = useThree()
  const R = layout.R
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 56)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const col = new Float32Array(pos.count * 4)
    const d = new THREE.Vector3(), pw = new THREE.Vector3(), c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize()
      const e = layout.ground(d)
      pos.setXYZ(i, d.x * (R + Math.max(e, 0) + 55), d.y * (R + Math.max(e, 0) + 55), d.z * (R + Math.max(e, 0) + 55))
      let a = 0
      if (e > 0.4) {
        pw.copy(d).multiplyScalar(R)
        let best = -1, bd = Infinity
        grid.near(pw, (idx) => { const q = layout.plots[idx].dir.distanceToSquared(d); if (q < bd) { bd = q; best = idx } })
        if (best >= 0) {
          c.set(COUNTRY_COLORS[layout.plots[best].country])
          a = layout.terrain.cityMask(d)
          // wisps: the smoke thins and thickens across the land
          a *= 0.7 + 0.3 * Math.sin(d.x * 61 + Math.sin(d.y * 47) * 2) * Math.cos(d.z * 53 + d.y * 29)
        }
      }
      col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = a
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4))
    return g
  }, [layout, grid, R])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0.5, side: THREE.FrontSide, toneMapped: false }), [])
  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])
  useFrame(() => {
    const alt = camera.position.length() - R
    mat.opacity = THREE.MathUtils.lerp(0.08, 0.46, THREE.MathUtils.smoothstep(alt, 60, R * 0.5))
    mat.visible = mat.opacity > 0.01
  })
  return <mesh geometry={geo} material={mat} renderOrder={5} raycast={() => null} frustumCulled={false} />
}
