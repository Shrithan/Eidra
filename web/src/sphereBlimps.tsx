import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { SphereLayout } from './sphereLayout'

const FONT = "'Inter', system-ui, sans-serif"
const boxArt = (name: string) => `https://static-cdn.jtvnw.net/ttv-boxart/${encodeURIComponent(name)}-144x192.jpg`
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n))

/** The tag hanging under a blimp: the category's Twitch box art, its name and how many are watching. */
function tagTexture(name: string, color: string, viewers: number, streams: number) {
  const W = 640, H = 220
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const g = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  let art: HTMLImageElement | null = null
  const draw = () => {
    g.clearRect(0, 0, W, H)
    const r = 34
    g.fillStyle = 'rgba(14,12,26,0.9)'
    g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, r); g.fill()
    g.lineWidth = 8; g.strokeStyle = color
    g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, r); g.stroke()
    // box art, or a colour tile with the initial while it loads
    const ax = 26, ay = 24, aw = 124, ah = H - 48
    g.save(); g.beginPath(); g.roundRect(ax, ay, aw, ah, 16); g.clip()
    if (art) g.drawImage(art, ax, ay, aw, ah)
    else { g.fillStyle = color; g.fillRect(ax, ay, aw, ah); g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = `700 80px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name.slice(0, 1).toUpperCase(), ax + aw / 2, ay + ah / 2) }
    g.restore()
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    let size = 64
    g.font = `700 ${size}px ${FONT}`
    while (g.measureText(name).width > W - 190 - 36 && size > 30) { size -= 4; g.font = `700 ${size}px ${FONT}` }
    g.fillStyle = '#ffffff'
    g.fillText(name, 176, 96)
    g.font = `500 36px ${FONT}`
    g.fillStyle = color
    g.fillText(`${compact(viewers)} watching`, 176, 150)
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.font = `500 28px ${FONT}`
    g.fillText(`${streams.toLocaleString()} streams`, 176, 190)
    tex.needsUpdate = true
  }
  draw()
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { art = img; draw() }
  img.src = boxArt(name)
  void document.fonts?.load(`700 48px Inter`).then(draw).catch(() => {})
  return tex
}

function blimpGeometry(color: string) {
  const c = new THREE.Color(color), light = c.clone().lerp(new THREE.Color('#ffffff'), 0.55), dark = c.clone().multiplyScalar(0.55)
  const paint = (g: THREE.BufferGeometry, col: THREE.Color) => {
    const out = g.index ? g.toNonIndexed() : g
    const n = out.getAttribute('position').count, a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b }
    out.setAttribute('color', new THREE.BufferAttribute(a, 3))
    out.deleteAttribute('uv')
    return out
  }
  const body = new THREE.SphereGeometry(1, 18, 12).scale(1, 0.36, 0.36)
  const stripe = new THREE.SphereGeometry(1, 18, 12).scale(0.5, 0.375, 0.375)
  const fin = (ry: number, rz: number) => new THREE.BoxGeometry(0.22, 0.34, 0.03).rotateX(rz).rotateY(ry).translate(-0.86, 0, 0)
  const parts = [
    paint(body, c), paint(stripe, light),
    paint(fin(0, 0), dark), paint(fin(Math.PI / 2, 0), dark),
    paint(new THREE.BoxGeometry(0.34, 0.1, 0.12).translate(0.04, -0.4, 0), dark),
  ]
  return mergeGeometries(parts, false)!
}

type Item = { index: number; name: string; color: string; centroid: THREE.Vector3; viewers: number; streams: number; phase: number; east: THREE.Vector3; north: THREE.Vector3 }

/** One blimp per game country, cruising above its land and trailing a tag with the game's Twitch box art. */
export function Blimps({ layout, onPick }: { layout: SphereLayout; onPick?: (country: number) => void }) {
  const { camera } = useThree()
  const R = layout.R
  // on your own planet every section gets a blimp, however small
  const items = useMemo<Item[]>(() => layout.countries.filter((c) => c.count >= (layout.theme.id === 'home' ? 1 : 3)).map((c, i) => {
    const up = c.centroid.clone().normalize()
    const east = new THREE.Vector3(0, 1, 0).cross(up)
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0)
    east.normalize()
    const north = new THREE.Vector3().crossVectors(up, east)
    return { index: c.index, name: c.name, color: c.color, centroid: up, viewers: c.viewers, streams: c.count, phase: i * 1.7, east, north }
  }), [layout])
  const geos = useMemo(() => items.map((it) => blimpGeometry(it.color)), [items])
  const tags = useMemo(() => items.map((it) => tagTexture(it.name, it.color, it.viewers, it.streams)), [items])
  useEffect(() => () => { geos.forEach((g) => g.dispose()); tags.forEach((t) => t.dispose()) }, [geos, tags])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }), [])
  const bodies = useRef<(THREE.Mesh | null)[]>([])
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), up: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4() }), [])
  useFrame((st) => {
    const alt = camera.position.length() - R
    const grow = 1 + 2.6 * Math.min(1, R / 1200) * THREE.MathUtils.smoothstep(alt, R * 0.08, R * 0.7) // larger from orbit so they can still be read
    const length = THREE.MathUtils.clamp(R * 0.075, 28, 130) * grow // blimps scale with the planet they fly over, so a small world is not swamped by them
    items.forEach((it, i) => {
      const body = bodies.current[i], tag = sprites.current[i]
      if (!body || !tag) return
      const th = st.clock.elapsedTime * 0.045 + it.phase, loop = R * 0.07
      tmp.p.copy(it.centroid).multiplyScalar(R).addScaledVector(it.east, Math.cos(th) * loop).addScaledVector(it.north, Math.sin(th) * loop)
      tmp.up.copy(tmp.p).normalize()
      tmp.t.copy(it.east).multiplyScalar(-Math.sin(th)).addScaledVector(it.north, Math.cos(th))
      tmp.t.addScaledVector(tmp.up, -tmp.t.dot(tmp.up)).normalize()
      const hover = THREE.MathUtils.clamp(R * 0.12, 45, 190) + THREE.MathUtils.clamp(R * 0.03, 8, 40) * Math.sin(st.clock.elapsedTime * 0.6 + it.phase)
      tmp.p.copy(tmp.up).multiplyScalar(R + Math.max(0, layout.ground(tmp.up)) + hover * Math.min(2.4, grow))
      tmp.z.crossVectors(tmp.t, tmp.up)
      tmp.m.makeBasis(tmp.t, tmp.up, tmp.z)
      body.quaternion.setFromRotationMatrix(tmp.m)
      body.position.copy(tmp.p)
      body.scale.setScalar(length / 2)
      tag.position.copy(tmp.p).addScaledVector(tmp.up, -length * 0.5)
      tag.scale.set(length * 2.4, length * 2.4 * (220 / 640), 1)
    })
  })
  return (
    <group>
      {items.map((it, i) => (
        <group key={i}>
          <mesh ref={(el) => { bodies.current[i] = el }} geometry={geos[i]} material={mat} frustumCulled={false}
            onClick={(e) => { e.stopPropagation(); onPick?.(it.index) }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }} />
          <sprite ref={(el) => { sprites.current[i] = el }} frustumCulled={false}
            onClick={(e) => { e.stopPropagation(); onPick?.(it.index) }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
            <spriteMaterial map={tags[i]} transparent depthWrite={false} />
          </sprite>
        </group>
      ))}
    </group>
  )
}
