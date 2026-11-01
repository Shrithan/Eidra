import * as THREE from 'three'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import { THEMES, type Theme } from './sphereThemes'

const NOISE = new ImprovedNoise()
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Fractal noise, roughly in [-0.9, 0.9]. The offsets keep us off the noise lattice's flat integer points. */
export function fbm(x: number, y: number, z: number, octaves: number) {
  let sum = 0, amp = 0.5, f = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * NOISE.noise(x * f + 0.173, y * f + 0.419, z * f + 0.731)
    f *= 2.03
    amp *= 0.5
  }
  return sum
}

/** Height of the flat city ground above sea level, in metres. */
export const CITY_LEVEL = 2.2

/**
 * The land: flat city districts with hills, mountain ranges, lakes and shorelines between them.
 * It is a pure function of direction (no randomness), so every player in the world sees the same land.
 * Heights are metres above the planet's base radius; sea level is 0 and anything below it is water.
 */
export type Terrain = {
  /** How "city-like" a direction is; the busiest districts are placed where this is highest. */
  urban: (d: THREE.Vector3) => number
  /** Set once the districts are chosen: directions with urban() at or above this are city. */
  setThreshold: (t: number) => void
  threshold: () => number
  /** 1 inside a city district, fading to 0 over the foothills around it. */
  cityMask: (d: THREE.Vector3) => number
  elevation: (d: THREE.Vector3) => number
  /** How tall the relief is compared with the biggest planet (small planets get gentler hills and mountains). */
  scale: number
  /** Colour of the bare land at a point of known elevation (cities are tinted separately). */
  color: (d: THREE.Vector3, e: number, out: THREE.Color) => THREE.Color
}

const tmp = new THREE.Color()

export type TerrainOptions = { seed?: number; theme?: Theme; scale?: number }

export function createTerrain(opts: TerrainOptions = {}): Terrain {
  const theme = opts.theme ?? THEMES[0]
  const seed = opts.seed ?? 0
  const k = Math.max(0.3, Math.min(1, opts.scale ?? 1))
  // every planet samples a different region of the same noise field, so no two planets have the same land
  const ox = seed * 13.37, oy = seed * 7.91, oz = seed * 10.53
  const sh = (d: THREE.Vector3) => new THREE.Vector3(d.x + ox, d.y + oy, d.z + oz)
  const P = {
    sand: new THREE.Color(theme.palette.sand), bed: new THREE.Color(theme.palette.bed), grassA: new THREE.Color(theme.palette.grassA),
    grassB: new THREE.Color(theme.palette.grassB), forest: new THREE.Color(theme.palette.forest), rockA: new THREE.Color(theme.palette.rockA),
    rockB: new THREE.Color(theme.palette.rockB), snow: new THREE.Color(theme.palette.snow),
  }
  let T = 0.0
  const urban = (d: THREE.Vector3) => {
    const { x, y, z } = sh(d)
    return fbm(x * 1.9 + 3.1, y * 1.9 + 1.7, z * 1.9 + 5.3, 3) + 0.3 * fbm(x * 5.2, y * 5.2 + 2, z * 5.2, 2)
  }
  const cityMask = (d: THREE.Vector3) => smooth(T - 0.1, T - 0.02, urban(d))

  const elevation = (d: THREE.Vector3) => {
    const u = urban(d)
    const city = smooth(T - 0.1, T - 0.02, u)
    if (city >= 1) return CITY_LEVEL
    const { x, y, z } = sh(d)
    const far = clamp01((T - u) / 0.5) // 0 at the city edge, 1 deep in the wilderness
    const hills = fbm(x * 4.2 + 9, y * 4.2, z * 4.2, 4) * 34 * 0.6 + fbm(x * 11, y * 11 + 3, z * 11, 2) * 7
    const r1 = 1 - Math.abs(NOISE.noise(x * 3.4 + 2.1, y * 3.4 + 0.3, z * 3.4 + 5.2))
    const r2 = 1 - Math.abs(NOISE.noise(x * 7.5 + 0.9, y * 7.5 + 1.3, z * 7.5 + 0.2))
    const ridge = Math.max(0, r1 * 0.72 + r2 * 0.28 - 0.5) / 0.5
    const mountains = Math.pow(ridge, 1.6) * 230 * theme.mountains * smooth(0.12, 0.6, far)
    const basin = smooth(-0.04, 0.24, fbm(x * 4.4 + 7, y * 4.4 + 0.5, z * 4.4 + 2, 3)) * 44 * theme.lakes * smooth(0.03, 0.22, far)
    const nature = (hills + 9 + mountains - basin) * k
    return lerp(nature, CITY_LEVEL, city)
  }

  const color = (d: THREE.Vector3, e: number, out: THREE.Color) => {
    const patch = fbm(d.x * 26 + 4, d.y * 26, d.z * 26 + 1, 2) * 1.2 // -0.6..0.6 patchy variation
    const ee = e < 0 ? e : e / k // heights as if on the biggest planet, so snow lines and rock lines scale with the relief
    if (e < 0) return out.copy(P.bed).multiplyScalar(0.75 + clamp01(1 + e / 40) * 0.25)
    if (e < 2.4) return out.copy(P.sand)
    const grass = tmp.copy(P.grassA).lerp(P.grassB, clamp01(patch + 0.5))
    out.copy(grass)
    out.lerp(P.forest, smooth(20, 55, ee + patch * 12))
    out.lerp(tmp.copy(P.rockA).lerp(P.rockB, clamp01(patch + 0.5)), smooth(80, 105, ee + patch * 14))
    out.lerp(P.snow, smooth(138, 158, ee + patch * 12))
    return out
  }

  return { scale: k, urban, setThreshold: (t) => { T = t }, threshold: () => T, cityMask, elevation, color }
}
