import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { PlanetData } from './sphereLayout'
import { miniPlanet } from './sphereSystem'

/** A picture of a planet, drawn once with its real terrain and colours. */
function thumbnail(p: PlanetData, size = 220) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  r.setSize(size, size)
  r.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const geo = miniPlanet(p)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))
  mesh.rotation.set(0.35, 2.2, 0)
  scene.add(mesh)
  scene.add(new THREE.AmbientLight('#ffffff', 0.9))
  const sun = new THREE.DirectionalLight('#fff3dc', 2.6)
  sun.position.set(-3, 2, 4)
  scene.add(sun)
  const R = p.layout.R
  const cam = new THREE.PerspectiveCamera(30, 1, 1, R * 12)
  cam.position.set(0, 0, R * 5.2)
  r.render(scene, cam)
  const url = r.domElement.toDataURL('image/png')
  geo.dispose(); (mesh.material as THREE.Material).dispose()
  r.dispose(); r.forceContextLoss()
  return url
}

/** Your own planet, always in the corner of the screen: click it to fly there, or build one if you have none yet. */
export function HomeCard({ planet, name, count, visiting, onFly, onEdit }: { planet: PlanetData | null; name?: string; count?: number; visiting?: boolean; onFly: () => void; onEdit: () => void }) {
  const [img, setImg] = useState('')
  useEffect(() => {
    if (!planet) { setImg(''); return }
    let live = true
    // let the page paint first: building the picture takes a moment
    const t = setTimeout(() => { try { const u = thumbnail(planet); if (live) setImg(u) } catch { /* no picture, the card still works */ } }, 60)
    return () => { live = false; clearTimeout(t) }
  }, [planet])
  if (!planet) {
    return (
      <button className="home-card empty" onClick={onEdit}>
        <span className="home-orb" />
        <span><b>Your own planet</b><small>Pick streamers, play games, invite friends</small></span>
      </button>
    )
  }
  return (
    <div className="home-card">
      <button className="home-orb-btn" onClick={onFly} title="Fly to this planet">
        {img ? <img className="home-orb-img" src={img} alt="" /> : <span className="home-orb" />}
      </button>
      <div className="home-info">
        <b>{name ?? planet.theme.name}</b>
        <small>{visiting ? 'A friend’s planet' : 'My planet'} · {(count ?? planet.layout.plots.length).toLocaleString()} streamers</small>
        <span>
          <button onClick={onFly}>Fly there</button>
          <button className="alt" onClick={onEdit}>{visiting ? 'Options' : 'Edit'}</button>
        </span>
      </div>
    </div>
  )
}
