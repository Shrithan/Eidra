import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { mapStore } from './sphereMap'

const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m / 10) * 10} m`)

/** Bearing from you to a pin relative to the way you face, in radians (0 = straight ahead). */
function relativeBearing(dir: THREE.Vector3) {
  const { dir: P, fwd } = mapStore.player
  const u = dir.clone().addScaledVector(P, -dir.dot(P))
  if (u.lengthSq() < 1e-10) return 0
  u.normalize()
  const f = fwd.clone().addScaledVector(P, -fwd.dot(P)).normalize()
  const right = new THREE.Vector3().crossVectors(f, P).negate().normalize()
  return Math.atan2(u.dot(right), u.dot(f))
}

/** Your pins: how far each one is, which way, a button to fly there. Pins are dropped on the planet itself. */
export function Pins() {
  const [, bump] = useState(0)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const l = () => bump((n) => n + 1)
    mapStore.listeners.add(l)
    const t = setInterval(l, 250)
    return () => { mapStore.listeners.delete(l); clearInterval(t) }
  }, [])
  const layout = mapStore.layout
  if (!layout) return null
  const pins = mapStore.markers
    .map((m) => { const d = new THREE.Vector3(...m.dir); return { m, d: mapStore.player.dir.angleTo(d) * layout.R, b: relativeBearing(d) } })
    .sort((a, b) => a.d - b.d)
  const next = pins[0]
  return (
    <>
      {next && (
        <div className="map-chip" title="Nearest pin">
          <span style={{ transform: `rotate(${next.b}rad)` }}>➤</span>
          <b>{next.m.name}</b> {fmt(next.d)}
        </div>
      )}
      <div className="map-box pins">
        <div className="map-bar">
          <b>Pins{pins.length ? ` · ${pins.length}` : ''}</b>
          <button onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</button>
        </div>
        {open && (
          <>
            <ul className="map-list">
              {pins.length === 0 && <li>No pins yet.</li>}
              {pins.map(({ m, d }) => (
                <li key={m.id}>
                  <b>{m.name}</b> <span>{fmt(d)}</span>
                  <button onClick={() => window.dispatchEvent(new CustomEvent('watchsphere:travel', { detail: m.dir }))}>Fly</button>
                  <button onClick={() => mapStore.remove(m.id)} aria-label="Remove pin">✕</button>
                </li>
              ))}
            </ul>
            <small className="pin-hint">Right-click the planet to pin · X pins your spot</small>
          </>
        )}
      </div>
    </>
  )
}
