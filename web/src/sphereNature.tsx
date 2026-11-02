import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { frontDir, type SphereLayout } from './sphereLayout'
import type { RoadNet } from './sphereCity'
import { hash1 } from './sphereCity'
import { CUBE, KEN, Scatter, useBaked, type ScatterItem } from './sphereModels'

const V = THREE.Vector3
const Y = new V(0, 1, 0)

type M = { url: string; h: number }
const k = (name: string, h: number): M => ({ url: KEN(name), h })
const c = (name: string, h: number): M => ({ url: CUBE(name), h })

/** What grows and lies around on one planet. Heights are in metres. */
type Kit = {
  trees: M[] // broad trees on the plains and in gardens
  pines: M[] // trees for the slopes
  palms?: M[] // mixed into the plains (tropical planets)
  rocks: M[]
  ground: M[] // flowers, mushrooms, bushes, logs: the small stuff
  camp: M[] // a tent and a fire near the small huts
  palmShare?: number
}

const KITS: Record<string, Kit> = {
  chat: {
    trees: [c('Tree_1', 9), c('Tree_2', 9), c('Tree_3', 9.5), k('tree_default', 8), k('tree_fat', 7)],
    palms: [k('tree_palm', 11), k('tree_palmTall', 14), k('tree_palmShort', 8), k('tree_palmBend', 10)], palmShare: 0.5,
    pines: [k('tree_pineRoundA', 11), k('tree_pineSmallB', 9)],
    rocks: [k('rock_smallA', 1.4), k('stone_largeA', 2.6), k('rock_largeA', 4)],
    ground: [k('flower_redA', 0.8), k('flower_yellowA', 0.8), k('flower_purpleA', 0.8), c('Bush', 1.5), k('plant_bush', 1.4), k('grass_large', 1)],
    camp: [k('tent_smallClosed', 3), k('campfire_logs', 0.9)],
  },
  creative: {
    trees: [c('Tree_1', 9), c('Tree_3', 9.5), k('tree_blocks', 8), k('tree_cone', 9), k('tree_oak_fall', 9)],
    pines: [k('tree_pineSmallA', 9), k('tree_pineRoundB', 11)],
    rocks: [k('rock_smallB', 1.4), k('stone_smallA', 1.2)],
    ground: [c('Flowers_1', 0.9), c('Flowers_2', 0.9), k('flower_redA', 0.8), k('flower_purpleA', 0.8), k('flower_yellowB', 0.8), c('Bush', 1.5)],
    camp: [k('tent_smallClosed', 3), k('campfire_logs', 0.9)],
  },
  strategy: {
    trees: [k('tree_default_dark', 8), k('tree_oak_dark', 9), k('tree_cone_dark', 9)],
    pines: [k('tree_pineTallA', 16), k('tree_pineTallB', 15), k('tree_pineTallC', 17), k('tree_pineTallD', 16), k('tree_pineDefaultA', 12), k('tree_pineRoundB', 11)],
    rocks: [k('rock_largeB', 5), k('rock_tallA', 7), k('stone_largeB', 3), k('rock_tallC', 8)],
    ground: [c('Bush', 1.5), k('plant_bushDetailed', 1.4), k('grass', 0.9), k('stump_old', 1.2)],
    camp: [k('tent_detailedClosed', 3.2), k('campfire_stones', 0.9)],
  },
  rpg: {
    trees: [k('tree_fat', 9), k('tree_oak_dark', 10), k('tree_detailed_dark', 10), c('Tree_2', 9)],
    pines: [k('tree_pineTallA_detailed', 16), k('tree_pineRoundC', 12), k('tree_pineTallC', 17)],
    rocks: [k('rock_tallB', 7), k('rock_largeC', 5), k('stone_tallA', 4), c('Rock1', 3)],
    ground: [k('mushroom_redGroup', 1.2), k('mushroom_tanGroup', 1.2), c('Mushroom', 1.3), k('plant_bushLarge', 1.9), c('Crystal_Small', 1.3)],
    camp: [k('tent_detailedClosed', 3.2), k('campfire_logs', 0.9)],
  },
  sandbox: {
    trees: [c('Tree_1', 9), c('Tree_2', 9), c('Tree_3', 10), k('tree_blocks', 8), k('tree_blocks_fall', 8)],
    pines: [k('tree_pineRoundA', 11), k('tree_pineSmallA', 9)],
    rocks: [c('Rock1', 2.6), c('Rock2', 2.6), k('rock_smallB', 1.4)],
    ground: [c('Flowers_1', 0.9), c('Flowers_2', 0.9), c('Bush', 1.5), c('Grass_Big', 1.1), k('log', 1.1)],
    camp: [k('tent_smallClosed', 3), k('campfire_logs', 0.9)],
  },
  arcade: {
    trees: [k('cactus_tall', 5.5), k('cactus_short', 2.8), c('DeadTree_2', 7)],
    palms: [k('tree_palmShort', 7)], palmShare: 0.25,
    pines: [k('cactus_tall', 6)],
    rocks: [k('rock_tallC', 8), k('rock_tallD', 7), k('rock_largeD', 5), k('rock_tallE', 9), k('stone_tallA', 4)],
    ground: [k('cactus_short', 1.6), k('plant_bushSmall', 1), k('sign', 2.2)],
    camp: [k('tent_detailedOpen', 3.2), k('campfire_stones', 0.9)],
  },
  shooter: {
    trees: [c('DeadTree_1', 8), c('DeadTree_2', 8), c('DeadTree_3', 8), k('tree_cone_fall', 8)],
    pines: [k('tree_pineSmallA', 9), k('tree_pineSmallB', 9)],
    rocks: [k('rock_largeD', 5), k('stone_largeB', 3), k('rock_tallE', 8)],
    ground: [k('log_large', 1.5), k('stump_old', 1.2), k('stump_squareDetailed', 1.1), k('log_stack', 1.3)],
    camp: [k('tent_detailedOpen', 3.2), k('campfire_logs', 0.9), k('sign', 2.2)],
  },
  horror: {
    trees: [c('DeadTree_1', 9), c('DeadTree_2', 9), c('DeadTree_3', 9), k('tree_detailed_dark', 9)],
    pines: [k('tree_cone_dark', 10), k('tree_pineTallB', 15)],
    rocks: [k('rock_tallB', 7), k('stone_tallA', 4), k('rock_largeB', 5)],
    ground: [k('mushroom_red', 1.4), k('mushroom_tan', 1.4), k('mushroom_redGroup', 1.5), c('Crystal_Small', 1.5), c('Crystal_Big', 3.2)],
    camp: [k('tent_detailedClosed', 3.2), k('campfire_stones', 0.9)],
  },
  other: {
    trees: [k('tree_cone_dark', 8), k('plant_bushLarge', 3)],
    pines: [k('tree_pineSmallB', 9)],
    rocks: [k('stone_largeA', 3), k('stone_largeB', 3), k('rock_largeA', 4), k('rock_tallA', 7), c('Rock2', 3)],
    ground: [c('Crystal_Big', 3.2), c('Crystal_Small', 1.5), k('statue_column', 4), k('statue_obelisk', 5)],
    camp: [k('tent_smallClosed', 3), k('campfire_stones', 0.9)],
  },
}

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(list: T[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))]

/**
 * Everything that grows or lies around: forests and scattered rocks in the wilderness, trees, bushes and flowers in the
 * gardens and on the street corners, and a small camp beside the quietest buildings. The models differ per planet.
 * Everything is placed from fixed seeds, so every player sees the same trees in the same places.
 */
export function Nature({ layout, net }: { layout: SphereLayout; net: RoadNet }) {
  const R = layout.R
  const kit = KITS[layout.theme.id] ?? KITS.other
  const items = useMemo(() => {
    const T = layout.terrain
    const rng = seeded(90210 + Math.round(R))
    const out: ScatterItem[] = []
    // the terrain is a coarse mesh, so on slopes it dips under the true ground: stand on the lowest nearby point so nothing floats
    const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tP = new THREE.Vector3()
    const lowest = (dir: THREE.Vector3) => {
      const n = dir.clone().normalize()
      tA.crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize()
      tB.crossVectors(n, tA)
      let e = layout.ground(n)
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        tP.copy(n).addScaledVector(tA, (a * 9) / R).addScaledVector(tB, (b * 9) / R).normalize()
        e = Math.min(e, layout.ground(tP))
      }
      return e
    }
    const onGround = (dir: THREE.Vector3, e?: number) => dir.clone().normalize().multiplyScalar(R + (e !== undefined ? Math.min(e, lowest(dir)) : lowest(dir)) - 0.15)
    const add = (m: M, pos: THREE.Vector3, sMin = 0.85, sMax = 1.25) => {
      out.push({ url: m.url, height: m.h, pos, up: pos.clone().normalize(), yaw: rng() * Math.PI * 2, scale: sMin + rng() * (sMax - sMin) })
    }
    const treeFor = (e: number) => {
      if (e > 38 * T.scale) return pick(kit.pines, rng())
      if (kit.palms && rng() < (kit.palmShare ?? 0)) return pick(kit.palms, rng())
      return pick(kit.trees, rng())
    }

    // wilderness: forests in clumps, rocks and little plants in the open
    const want = Math.round(9000 * layout.theme.forest * Math.min(1, 0.5 + R / 3200))
    const d = new V()
    let tries = 0, trees = 0
    while (trees < want && tries < want * 12) {
      tries++
      d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      const l = d.lengthSq()
      if (l > 1 || l < 0.01) continue
      d.normalize()
      if (T.cityMask(d) > 0.02) continue
      const e = T.elevation(d)
      if (e < 3.5 || e > 118 * T.scale) continue
      const clump = hash1(Math.floor((d.x + 2) * 40) * 977 + Math.floor((d.y + 2) * 40) * 31 + Math.floor((d.z + 2) * 40))
      if (clump < 0.45 && rng() < 0.85) continue // clearings between the woods
      add(treeFor(e), onGround(d, e), 0.8, 1.35)
      trees++
    }
    tries = 0
    let rocks = 0
    const wantRocks = Math.round(1800 * Math.min(1, 0.4 + R / 2600))
    while (rocks < wantRocks && tries < wantRocks * 20) {
      tries++
      d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      const l = d.lengthSq()
      if (l > 1 || l < 0.01) continue
      d.normalize()
      if (T.cityMask(d) > 0.02) continue
      const e = T.elevation(d)
      if (e < 1) continue
      // more rocks the higher and the closer to a shore
      if (rng() > 0.25 + Math.min(0.7, (e / (140 * T.scale)))) continue
      add(pick(kit.rocks, rng()), onGround(d, e), 0.7, 1.6)
      rocks++
      if (rng() < 0.5) add(pick(kit.ground, rng()), onGround(d, e), 0.8, 1.2)
    }

    // gardens around the buildings: the busier the stream, the bigger the garden
    const t1 = new V(), t2 = new V(), p = new V()
    layout.plots.forEach((plot, i) => {
      t1.crossVectors(plot.dir, Y)
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0)
      t1.normalize()
      t2.crossVectors(plot.dir, t1)
      const front = frontDir(plot)
      const count = 1 + plot.tier + Math.floor(hash1(i + 3) * 2)
      for (let n = 0; n < count; n++) {
        const ang = hash1(i * 7 + n) * 6.28
        if (t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang)).dot(front) > 0.35) continue // keep the door clear
        const dist = plot.footprint * 0.5 + 5 + hash1(i * 5 + n + 1) * 8
        p.copy(plot.dir).multiplyScalar(R).addScaledVector(t1, Math.cos(ang) * dist).addScaledVector(t2, Math.sin(ang) * dist)
        const r = hash1(i * 11 + n)
        const m = r < 0.55 ? (kit.palms && r < 0.55 * (kit.palmShare ?? 0) ? pick(kit.palms, r * 17 % 1) : pick(kit.trees, r * 13 % 1)) : pick(kit.ground, r * 19 % 1)
        add(m, onGround(p), 0.75, 1.2)
      }
      // a little camp next to the smallest buildings
      if (plot.tier === 0 && hash1(i + 91) < 0.55) {
        const ang = hash1(i + 17) * 6.28
        p.copy(plot.dir).multiplyScalar(R).addScaledVector(t1, Math.cos(ang) * (plot.footprint * 0.5 + 8)).addScaledVector(t2, Math.sin(ang) * (plot.footprint * 0.5 + 8))
        if (t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang)).dot(front) < 0.35) {
          const base = onGround(p)
          add(kit.camp[0], base, 1, 1)
          add(kit.camp[1], base.clone().addScaledVector(t1, 2.4).normalize().multiplyScalar(base.length()), 1, 1)
        }
      }
    })

    // street corners
    const v = new V(), t = new V()
    net.verts.forEach((vert, i) => {
      const cell = net.cells[i]
      if (!net.valid[i] || !cell.length || hash1(i * 3 + 1) > 0.42) return
      v.copy(vert).multiplyScalar(R)
      const plot = layout.plots[cell[Math.floor(hash1(i + 7) * cell.length) % cell.length]]
      t.copy(plot.dir).multiplyScalar(R).sub(v).normalize()
      const pos = onGround(v.clone().addScaledVector(t, 8.2))
      add(hash1(i + 5) < 0.7 ? pick(kit.trees, hash1(i + 9)) : pick(kit.ground, hash1(i + 11)), pos, 0.85, 1.2)
    })
    return out
  }, [layout, net, kit, R])

  return <Scatter items={items} />
}

// ---------------------------------------------------------------------------------------------------------------------
// animals that wander around the gardens

type Species = { url: string; h: number }
const FAUNA: Record<string, Species[]> = {
  chat: [{ url: CUBE('Chicken'), h: 0.65 }, { url: CUBE('Pig'), h: 0.9 }, { url: CUBE('Dog'), h: 0.8 }, { url: CUBE('Cat'), h: 0.55 }, { url: CUBE('Sheep'), h: 1.0 }],
  creative: [{ url: CUBE('Cat'), h: 0.55 }, { url: CUBE('Dog'), h: 0.8 }, { url: CUBE('Chick'), h: 0.4 }, { url: CUBE('Sheep'), h: 1.0 }],
  strategy: [{ url: CUBE('Wolf'), h: 1.0 }, { url: CUBE('Horse'), h: 2.0 }, { url: CUBE('Sheep'), h: 1.0 }],
  rpg: [{ url: CUBE('Horse'), h: 2.0 }, { url: CUBE('Wolf'), h: 1.0 }, { url: CUBE('Sheep'), h: 1.0 }, { url: CUBE('Raccoon'), h: 0.6 }],
  sandbox: [{ url: CUBE('Pig'), h: 0.9 }, { url: CUBE('Sheep'), h: 1.0 }, { url: CUBE('Chicken'), h: 0.65 }, { url: CUBE('Horse'), h: 2.0 }, { url: CUBE('Dog'), h: 0.8 }],
  arcade: [{ url: CUBE('Horse'), h: 2.0 }, { url: CUBE('Dog'), h: 0.8 }, { url: CUBE('Raccoon'), h: 0.6 }],
  shooter: [{ url: CUBE('Wolf'), h: 1.0 }, { url: CUBE('Dog'), h: 0.8 }, { url: CUBE('Raccoon'), h: 0.6 }],
  horror: [{ url: CUBE('Wolf'), h: 1.0 }, { url: CUBE('Raccoon'), h: 0.6 }, { url: CUBE('Cat'), h: 0.55 }, { url: CUBE('Zombie'), h: 1.9 }, { url: CUBE('Skeleton'), h: 1.9 }],
  other: [{ url: CUBE('Raccoon'), h: 0.6 }, { url: CUBE('Yeti'), h: 2.2 }],
}

type Wanderer = { sp: number; plot: number; r0: number; ang: number; sign: number; speed: number }

function SpeciesMesh({ sp, list, layout, setRef }: { sp: Species; list: Wanderer[]; layout: SphereLayout; setRef: (el: THREE.InstancedMesh[] | null) => void }) {
  const baked = useBaked(sp.url, sp.h, Math.PI)
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  useLayoutEffect(() => { setRef(baked ? (meshes.current.filter(Boolean) as THREE.InstancedMesh[]) : null) }, [baked, setRef])
  if (!baked) return null
  return (
    <group>
      {baked.parts.map((p, i) => (
        <instancedMesh key={i} ref={(el) => { meshes.current[i] = el }} args={[p.geometry, p.material, Math.max(1, list.length)]} frustumCulled={false} raycast={() => null} />
      ))}
    </group>
  )
}

export function Animals({ layout, count = 140 }: { layout: SphereLayout; count?: number }) {
  const R = layout.R
  const species = FAUNA[layout.theme.id] ?? FAUNA.other
  const wanderers = useMemo(() => {
    const n = Math.min(count, Math.max(0, Math.floor(layout.plots.length / 4)))
    return Array.from({ length: n }, (_, i): Wanderer => {
      const plot = Math.floor(hash1(i * 13 + 1) * layout.plots.length)
      return {
        sp: i % species.length, plot, r0: layout.plots[plot].footprint * 0.5 + 9 + hash1(i + 5) * 9, ang: hash1(i + 9) * 6.28,
        sign: hash1(i + 3) < 0.5 ? 1 : -1, speed: 0.6 + hash1(i + 7) * 1.4,
      }
    })
  }, [layout, species.length, count])
  const bySpecies = useMemo(() => species.map((_, s) => wanderers.filter((w) => w.sp === s)), [wanderers, species])
  const meshRefs = useRef<(THREE.InstancedMesh[] | null)[]>([])
  const tmp = useMemo(() => ({ t1: new V(), t2: new V(), c: new V(), pos: new V(), up: new V(), fwd: new V(), right: new V(), back: new V(), m: new THREE.Matrix4() }), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    bySpecies.forEach((list, s) => {
      const meshes = meshRefs.current[s]
      if (!meshes) return
      list.forEach((w, i) => {
        const ang = w.ang + (w.sign * w.speed * t) / w.r0
        const center = layout.plots[w.plot].dir
        tmp.t1.crossVectors(center, Y)
        if (tmp.t1.lengthSq() < 1e-4) tmp.t1.set(1, 0, 0)
        tmp.t1.normalize()
        tmp.t2.crossVectors(center, tmp.t1)
        const cos = Math.cos(ang), sin = Math.sin(ang)
        tmp.c.copy(center).multiplyScalar(R).addScaledVector(tmp.t1, cos * w.r0).addScaledVector(tmp.t2, sin * w.r0)
        tmp.up.copy(tmp.c).normalize()
        const hop = (i + s) % 3 === 0 ? Math.max(0, Math.sin(t * 5 + i) - 0.7) * 0.5 : 0
        tmp.pos.copy(tmp.up).multiplyScalar(R + layout.ground(tmp.up) + hop)
        tmp.fwd.copy(tmp.t1).multiplyScalar(-sin * w.sign).addScaledVector(tmp.t2, cos * w.sign)
        tmp.fwd.addScaledVector(tmp.up, -tmp.fwd.dot(tmp.up)).normalize()
        tmp.right.crossVectors(tmp.fwd, tmp.up).normalize()
        tmp.back.copy(tmp.fwd).negate()
        tmp.m.makeBasis(tmp.right, tmp.up, tmp.back)
        tmp.m.setPosition(tmp.pos)
        meshes.forEach((m) => m.setMatrixAt(i, tmp.m))
      })
      meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true })
    })
  })

  return (
    <group>
      {species.map((sp, s) => (
        <SpeciesMesh key={sp.url} sp={sp} list={bySpecies[s]} layout={layout} setRef={(el) => { meshRefs.current[s] = el }} />
      ))}
    </group>
  )
}
