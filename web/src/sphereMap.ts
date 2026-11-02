import * as THREE from 'three'
import type { SphereLayout } from './sphereLayout'

export type Marker = { id: number; dir: [number, number, number]; name: string }
type Listener = () => void

/** Shared state between the 3D scene (which knows where you are) and the map overlay (plain DOM). */
export const mapStore = {
  layout: null as SphereLayout | null,
  player: { dir: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1), walking: false },
  markers: [] as Marker[],
  stations: [] as { dir: THREE.Vector3; color: string }[],
  listeners: new Set<Listener>(),
  emit() { this.listeners.forEach((l) => l()) },
  key() { return `watchworld:markers:${this.layout?.theme.id ?? 'none'}` },
  load() {
    try { this.markers = JSON.parse(localStorage.getItem(this.key()) ?? '[]') } catch { this.markers = [] }
    this.emit()
  },
  save() { try { localStorage.setItem(this.key(), JSON.stringify(this.markers)) } catch { /* private mode */ } this.emit() },
  add(dir: THREE.Vector3) {
    const id = (this.markers.at(-1)?.id ?? 0) + 1
    this.markers = [...this.markers, { id, dir: [dir.x, dir.y, dir.z], name: `Marker ${id}` }]
    this.save()
  },
  remove(id: number) { this.markers = this.markers.filter((m) => m.id !== id); this.save() },
}

