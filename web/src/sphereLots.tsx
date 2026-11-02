import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GROUPS, frontDir, type Plot, type SphereLayout } from './sphereLayout'
import { CUBE, KEN, Scatter, placementMatrix, type ScatterItem } from './sphereModels'

const V = THREE.Vector3

/**
 * The ground around each building: every streamer gets a proper plot, dressed by how big the stream is.
 *   hut        a fenced yard with a campfire and a lamp post carrying the stream's details
 *   cottage    a small farm: a barn, a paddock with animals, a crop patch, hay
 *   house      a garden with a fence, driveway, mailbox and trees
 *   tower      a paved forecourt with two gates, flags, benches and trees
 *   skyscraper a big office plaza with three gated entrances, flags, planters, a guard booth
 * Plots are only built for the buildings near you (everything else stays a plain building), so thousands of them are cheap.
 */

// ------------------------------------------------------------------------------------------------
// what a plot is made of (in the plot's own frame: x right, y up, z towards the front door; metres)

type Box = { x: number; y: number; z: number; w: number; h: number; d: number; c: string; ry?: number; rz?: number }
type Prop = { url: string; height: number; x: number; z: number; ry: number; y?: number }
type Cow = { x: number; z: number; bx: number; bz: number; half: number; dark: boolean; scale: number; th: number; wait: number }
type Dress = { boxes: Box[]; props: Prop[]; sign: { x: number; z: number; big: boolean }; cows?: Cow[] }

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const WOOD = '#8a6a48', DARK = '#3b3f4d', STONE = '#b9bdc6', PAVE = '#a9adb8', PAVE2 = '#8f94a3', GRASS = '#7fb24f', RED = '#b9473f', CREAM = '#efe6d2', GLASS = '#79b8d9', YELLOW = '#e6c24e'

/** A fence along a line from (x1,z1) to (x2,z2), with an opening of `gap` metres centred at `gapAt` (0..1 along the line). */
function fence(out: Box[], x1: number, z1: number, x2: number, z2: number, opts: { gap?: number; gapAt?: number; h?: number; c?: string } = {}) {
  const h = opts.h ?? 1.0, c = opts.c ?? WOOD
  const len = Math.hypot(x2 - x1, z2 - z1)
  const ang = Math.atan2(x2 - x1, z2 - z1)
  const posts = Math.max(1, Math.round(len / 2.2))
  const lo = opts.gap ? (opts.gapAt ?? 0.5) * len - opts.gap / 2 : -1, hi = opts.gap ? (opts.gapAt ?? 0.5) * len + opts.gap / 2 : -1
  for (let i = 0; i <= posts; i++) {
    const t = (i / posts) * len
    if (t > lo && t < hi) continue
    const x = x1 + (x2 - x1) * (t / len), z = z1 + (z2 - z1) * (t / len)
    out.push({ x, y: 0, z, w: 0.22, h: h * 1.1, d: 0.22, c })
  }
  const segs = Math.max(1, Math.round(len / 1.5))
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * len, b = ((i + 1) / segs) * len
    const m = (a + b) / 2
    if (m > lo && m < hi) continue
    const x = x1 + (x2 - x1) * (m / len), z = z1 + (z2 - z1) * (m / len)
    out.push({ x, y: h * 0.28, z, w: 0.1, h: 0.14, d: b - a, c, ry: ang })
    out.push({ x, y: h * 0.7, z, w: 0.1, h: 0.14, d: b - a, c, ry: ang })
  }
}
function ring(out: Box[], cx: number, hx: number, z0: number, z1: number, gap: number, opts: { h?: number; c?: string } = {}) {
  fence(out, cx - hx, z0, cx + hx, z0, opts) // back
  fence(out, cx - hx, z0, cx - hx, z1, opts)
  fence(out, cx + hx, z0, cx + hx, z1, opts)
  fence(out, cx - hx, z1, cx + hx, z1, { ...opts, gap, gapAt: 0.5 }) // front, with the gate
}
const gatePosts = (out: Box[], x: number, z: number, gap: number, c = WOOD) => {
  out.push({ x: x - gap / 2, y: 0, z, w: 0.34, h: 1.7, d: 0.34, c }, { x: x + gap / 2, y: 0, z, w: 0.34, h: 1.7, d: 0.34, c })
  out.push({ x: x - gap / 2, y: 1.7, z, w: 0.5, h: 0.14, d: 0.5, c: YELLOW }, { x: x + gap / 2, y: 1.7, z, w: 0.5, h: 0.14, d: 0.5, c: YELLOW })
}
const flag = (out: Box[], x: number, z: number, c: string, h = 11) => {
  out.push({ x, y: 0, z, w: 0.28, h, d: 0.28, c: '#c9ced8' }, { x: x + 0.9, y: h - 2.1, z, w: 1.7, h: 1.2, d: 0.08, c })
}
const bench = (out: Box[], x: number, z: number, ry = 0) => {
  out.push({ x, y: 0.45, z, w: 1.9, h: 0.12, d: 0.55, c: WOOD, ry }, { x, y: 0, z, w: 1.6, h: 0.45, d: 0.35, c: DARK, ry })
}
const planter = (out: Box[], x: number, z: number, w: number, d: number) => {
  out.push({ x, y: 0, z, w, h: 0.7, d, c: STONE }, { x, y: 0.7, z, w: w - 0.3, h: 0.25, d: d - 0.3, c: GRASS })
}
const hay = (out: Box[], x: number, z: number, ry = 0) => out.push({ x, y: 0, z, w: 1.6, h: 1.0, d: 1.1, c: YELLOW, ry })

function dress(p: Plot, idx: number): Dress {
  const r = rng(idx * 7919 + 13)
  const boxes: Box[] = [], props: Prop[] = []
  const accent = GROUPS[p.group].color
  const bush = (x: number, z: number) => props.push({ url: KEN('plant_bushDetailed'), height: 1.0 + r() * 0.5, x, z, ry: r() * 6.3 })
  const flowers = (x: number, z: number, n = 3) => { for (let i = 0; i < n; i++) props.push({ url: KEN(['flower_redA', 'flower_yellowA', 'flower_purpleA'][Math.floor(r() * 3)]), height: 0.5, x: x + (r() - 0.5) * 2.4, z: z + (r() - 0.5) * 2.4, ry: r() * 6.3 }) }
  const tree = (x: number, z: number, h = 5.5) => props.push({ url: KEN(['tree_default', 'tree_oak', 'tree_detailed'][Math.floor(r() * 3)]), height: h + r() * 1.5, x, z, ry: r() * 6.3 })

  if (p.tier === 0) {
    // hut: a small fenced yard
    const hx = 8.5
    ring(boxes, 0, hx, -8.5, 8.5, 3.4, { h: 0.9 })
    gatePosts(boxes, 0, 8.5, 3.4)
    boxes.push({ x: 0, y: 0.02, z: 6.4, w: 2.6, h: 0.08, d: 4.2, c: STONE }) // path from the gate
    props.push({ url: KEN('campfire_logs'), height: 0.55, x: -5, z: 3.5, ry: 0 })
    props.push({ url: CUBE(r() < 0.5 ? 'Dog' : 'Cat'), height: 0.7, x: -4, z: 4.6, ry: r() * 6.3 })
    props.push({ url: CUBE('Chicken'), height: 0.6, x: 5.2, z: -5.5, ry: r() * 6.3 })
    bush(5.5, 4); bush(-6.2, -6); flowers(6, -2, 4); flowers(-6, 0, 3)
    boxes.push({ x: 5.5, y: 0, z: 1, w: 1.2, h: 0.45, d: 1.2, c: WOOD }) // a crate
    tree(-15, 4, 6); tree(15, 9, 5.5)
    if (r() < 0.5) props.push({ url: CUBE('Sheep'), height: 1.0, x: -11, z: 1, ry: r() * 6.3 })
    return { boxes, props, sign: { x: 5.4, z: 9.6, big: false } }
  }
  if (p.tier === 1) {
    // cottage: a little farm
    ring(boxes, 0, 19, -15, 19, 4.2, { h: 1.0 })
    gatePosts(boxes, 0, 19, 4.2)
    boxes.push({ x: 0, y: 0.02, z: 12, w: 3, h: 0.08, d: 14, c: STONE })
    // barn
    const bx = -11.5, bz = -7.5
    boxes.push({ x: bx, y: 0, z: bz, w: 7, h: 4.2, d: 9, c: RED })
    boxes.push({ x: bx, y: 4.2, z: bz - 2.4, w: 7.4, h: 0.25, d: 5.6, c: DARK, rz: 0.42 }, { x: bx, y: 4.2, z: bz + 2.4, w: 7.4, h: 0.25, d: 5.6, c: DARK, rz: -0.42 })
    boxes.push({ x: bx - 1.7, y: 4.2, z: bz + 4.55, w: 3.4, h: 1.2, d: 0.2, c: RED }, { x: bx, y: 0, z: bz + 4.55, w: 3.4, h: 3, d: 0.2, c: CREAM })
    boxes.push({ x: bx - 1.7, y: 0, z: bz + 4.62, w: 0.2, h: 3, d: 0.1, c: DARK }, { x: bx + 1.7, y: 0, z: bz + 4.62, w: 0.2, h: 3, d: 0.1, c: DARK }, { x: bx, y: 2.9, z: bz + 4.62, w: 3.6, h: 0.2, d: 0.1, c: DARK })
    hay(boxes, bx + 6, bz + 3, 0.3); boxes.push({ x: bx + 6, y: 1.0, z: bz + 3, w: 1.4, h: 0.9, d: 1.0, c: YELLOW, ry: 0.5 })
    // paddock with animals
    ring(boxes, 12, 6.5, -13, 1, 0, { h: 1.0, c: '#a58558' })
    ;['Sheep', 'Sheep', 'Pig', 'Pig', 'Horse'].forEach((a, i) => props.push({ url: CUBE(a), height: a === 'Horse' ? 1.9 : a === 'Sheep' ? 1.0 : 0.85, x: 8.5 + (i % 3) * 3.6, z: -10 + Math.floor(i / 3) * 5, ry: r() * 6.3 }))
    // crops
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) props.push({ url: KEN('crops_wheatStageB'), height: 0.8, x: -16 + i * 1.5, z: 5 + row * 2.2, ry: 0 })
    props.push({ url: KEN('crop_pumpkin'), height: 0.5, x: -14, z: 12, ry: 0 }, { url: KEN('crop_pumpkin'), height: 0.5, x: -12.6, z: 12.6, ry: 1 })
    props.push({ url: CUBE('Chicken'), height: 0.6, x: -6, z: 11, ry: r() * 6.3 }, { url: CUBE('Chick'), height: 0.3, x: -5, z: 11.6, ry: r() * 6.3 })
    tree(14, 12); bush(8, 15); flowers(-3, 15, 4)
    return { boxes, props, sign: { x: 5.6, z: 20.2, big: false } }
  }
  if (p.tier === 2) {
    // house: a garden
    ring(boxes, 0, 14, -13, 14, 4.6, { h: 0.8, c: CREAM })
    boxes.push({ x: 0, y: 0.02, z: 10, w: 3.6, h: 0.1, d: 8, c: DARK }) // driveway
    boxes.push({ x: 0, y: 0.02, z: 3.5, w: 1.6, h: 0.08, d: 5, c: STONE })
    gatePosts(boxes, 0, 14, 4.6, CREAM)
    boxes.push({ x: 4.6, y: 0, z: 13, w: 0.14, h: 1.1, d: 0.14, c: DARK }, { x: 4.6, y: 1.1, z: 13, w: 0.5, h: 0.32, d: 0.7, c: RED }) // mailbox
    tree(-9, 8); tree(10, -7, 6.5); tree(-10, -9)
    bush(7, 8); bush(-7, 11); flowers(-6, 5, 5); flowers(7, 4, 4)
    props.push({ url: CUBE('Dog'), height: 0.8, x: -5, z: 6, ry: r() * 6.3 })
    bench(boxes, 8.5, -2, Math.PI / 2)
    return { boxes, props, sign: { x: 7.2, z: 14.8, big: false } }
  }
  if (p.tier === 3) {
    // tower: a paved forecourt with two gates
    const hs = 22
    boxes.push({ x: 0, y: 0, z: 0, w: hs * 2, h: 0.22, d: hs * 2, c: PAVE })
    boxes.push({ x: 0, y: 0.22, z: 0, w: hs * 2 - 3, h: 0.04, d: hs * 2 - 3, c: PAVE2 })
    for (const gx of [-9, 9]) {
      boxes.push({ x: gx - 2.3, y: 0, z: hs, w: 0.9, h: 4.6, d: 0.9, c: DARK }, { x: gx + 2.3, y: 0, z: hs, w: 0.9, h: 4.6, d: 0.9, c: DARK }, { x: gx, y: 4.6, z: hs, w: 5.5, h: 0.8, d: 1.0, c: accent })
      boxes.push({ x: gx, y: 0.22, z: hs - 5, w: 4.2, h: 0.05, d: 10, c: STONE })
    }
    for (const x of [-hs + 1, hs - 1]) flag(boxes, x, hs - 1, accent, 9)
    for (const x of [-15, 15]) { bench(boxes, x, 12, 0); planter(boxes, x, 17, 6, 1.6) }
    planter(boxes, 0, 15, 6, 1.6)
    for (const sx of [-1, 1]) { tree(sx * 17, -12, 6); tree(sx * 17, 3, 5.5) }
    return { boxes, props, sign: { x: 0, z: hs + 1.2, big: true } }
  }
  // skyscraper: an office plaza with three gated entrances
  const hs = 27
  boxes.push({ x: 0, y: 0, z: 0, w: hs * 2, h: 0.26, d: hs * 2, c: PAVE })
  boxes.push({ x: 0, y: 0.26, z: 0, w: hs * 2 - 4, h: 0.04, d: hs * 2 - 4, c: PAVE2 })
  boxes.push({ x: 0, y: 0.26, z: 11, w: 30, h: 0.05, d: 20, c: '#cfd3dc' }) // the entrance walk
  for (const gx of [-14, 0, 14]) {
    boxes.push({ x: gx - 3.2, y: 0, z: hs, w: 1.2, h: 6.5, d: 1.2, c: DARK }, { x: gx + 3.2, y: 0, z: hs, w: 1.2, h: 6.5, d: 1.2, c: DARK })
    boxes.push({ x: gx, y: 6.5, z: hs, w: 8.2, h: 1.1, d: 1.4, c: accent })
    boxes.push({ x: gx, y: 5.2, z: hs, w: 5.2, h: 0.12, d: 0.9, c: GLASS })
    for (const bx of [-2, 2]) boxes.push({ x: gx + bx, y: 0.26, z: hs - 3, w: 0.24, h: 1.0, d: 0.24, c: YELLOW }) // bollards
    boxes.push({ x: gx - 1.4, y: 0.26, z: hs - 3, w: 2.8, h: 0.14, d: 0.14, c: '#d34f4f' }) // barrier arm
  }
  for (const gx of [-7, 7]) planter(boxes, gx, hs - 1, 6.4, 1.6)
  for (const x of [-hs + 1.5, hs - 1.5]) flag(boxes, x, hs - 1.5, accent, 13)
  flag(boxes, -hs + 1.5, -hs + 1.5, accent, 13); flag(boxes, hs - 1.5, -hs + 1.5, accent, 13)
  boxes.push({ x: -21, y: 0.26, z: 14, w: 4.6, h: 3.1, d: 3.6, c: CREAM }, { x: -21, y: 3.36, z: 14, w: 5.0, h: 0.3, d: 4.0, c: DARK }, { x: -21, y: 1.4, z: 15.82, w: 3.6, h: 1.2, d: 0.08, c: GLASS }) // guard booth
  for (const sx of [-1, 1]) { bench(boxes, sx * 20, 3, 0); bench(boxes, sx * 20, -4, 0); planter(boxes, sx * 22, -12, 1.8, 8) }
  tree(-22, -20, 7); tree(22, -20, 7); tree(-23, 4, 6.5); tree(23, 4, 6.5)
  return { boxes, props, sign: { x: 0, z: hs + 2.2, big: true } }
}


// ------------------------------------------------------------------------------------------------
// countryside: the empty ground around every hut is filled with farms, pastures, orchards and the like

/** Move parts (given around the origin) to (x, z) and turn them as a group by `ry`. */
function group(out: Box[], parts: Box[], x: number, z: number, ry: number) {
  const c = Math.cos(ry), s = Math.sin(ry)
  for (const b of parts) out.push({ ...b, x: x + b.x * c + b.z * s, z: z - b.x * s + b.z * c, ry: (b.ry ?? 0) + ry })
}
const COW_BODY = '#f2efe6', COW_SPOT = '#2b2b2f'
/** A blocky cow standing at the origin facing +z. */
function cowParts(dark: boolean): Box[] {
  return [
    { x: 0, y: 0.55, z: 0, w: 1.0, h: 0.85, d: 1.9, c: dark ? COW_SPOT : COW_BODY },
    { x: 0.2, y: 0.9, z: 0.3, w: 0.62, h: 0.6, d: 0.7, c: dark ? COW_BODY : COW_SPOT },
    { x: 0, y: 0.95, z: 1.15, w: 0.62, h: 0.6, d: 0.7, c: dark ? COW_SPOT : COW_BODY },
    { x: 0, y: 1.0, z: 1.55, w: 0.4, h: 0.28, d: 0.1, c: '#e9a7a0' },
    { x: -0.34, y: 1.5, z: 1.1, w: 0.1, h: 0.25, d: 0.1, c: '#d8d2c0' }, { x: 0.34, y: 1.5, z: 1.1, w: 0.1, h: 0.25, d: 0.1, c: '#d8d2c0' },
    { x: 0, y: 0.7, z: -1.0, w: 0.12, h: 0.7, d: 0.12, c: COW_SPOT },
    ...[[-0.33, -0.7], [0.33, -0.7], [-0.33, 0.7], [0.33, 0.7]].map(([lx, lz]) => ({ x: lx, y: 0, z: lz, w: 0.22, h: 0.6, d: 0.22, c: '#cfc9b6' })),
  ]
}
function barn(out: Box[], x: number, z: number, ry: number, w = 5.4, d = 7) {
  group(out, [
    { x: 0, y: 0, z: 0, w, h: 3.4, d, c: RED },
    { x: 0, y: 3.4, z: -d * 0.27, w: w + 0.4, h: 0.22, d: d * 0.62, c: DARK, rz: 0.45 }, { x: 0, y: 3.4, z: d * 0.27, w: w + 0.4, h: 0.22, d: d * 0.62, c: DARK, rz: -0.45 },
    { x: 0, y: 0, z: d / 2 + 0.05, w: 2.6, h: 2.6, d: 0.15, c: CREAM },
  ], x, z, ry)
}
function silo(out: Box[], x: number, z: number) {
  out.push({ x, y: 0, z, w: 2.8, h: 8.5, d: 2.8, c: '#c9ced8' }, { x, y: 8.5, z, w: 3.2, h: 0.9, d: 3.2, c: RED }, { x, y: 0.3, z: z + 1.45, w: 0.8, h: 1.8, d: 0.1, c: DARK })
}
function windmill(out: Box[], x: number, z: number, ry: number, r: () => number) {
  const a = r() * 3
  const blades: Box[] = [0, 1, 2, 3].map((i) => ({ x: 0, y: 11.2, z: 1.1, w: 0.5, h: 7.4, d: 0.14, c: CREAM, rz: a + (i * Math.PI) / 2 }))
  group(out, [
    { x: 0, y: 0, z: 0, w: 4.2, h: 6, d: 4.2, c: CREAM }, { x: 0, y: 6, z: 0, w: 3.3, h: 4, d: 3.3, c: CREAM }, { x: 0, y: 10, z: 0, w: 3.9, h: 1.7, d: 3.9, c: RED },
    { x: 0, y: 0, z: 2.15, w: 1.2, h: 2.0, d: 0.12, c: DARK }, { x: 0, y: 11.0, z: 1.0, w: 0.5, h: 0.5, d: 0.5, c: DARK }, ...blades,
  ], x, z, ry)
}

type Local = { boxes: Box[]; props: Prop[]; cows: { x: number; z: number; dark: boolean }[]; half: number }

/** One piece of countryside, built around the origin in a 11 x 11 m square (a pasture, field, barn...). */
function piece(r: () => number, allowTall: boolean): Local {
  const boxes: Box[] = [], props: Prop[] = [], cows: Local['cows'] = []
  const roll = r()
  if (roll < 0.17) { // a pasture with cattle (or sheep and horses)
    ring(boxes, 0, 5.5, -5.5, 5.5, 0, { h: 1.0, c: '#a58558' })
    const kind = r()
    if (kind < 0.65) { for (let i = 0; i < 2 + Math.floor(r() * 3); i++) cows.push({ x: (r() - 0.5) * 6, z: (r() - 0.5) * 6, dark: r() < 0.45 }) }
    else for (let i = 0; i < 3; i++) props.push({ url: CUBE(kind < 0.85 ? 'Sheep' : 'Horse'), height: kind < 0.85 ? 1.0 : 1.9, x: (r() - 0.5) * 6.5, z: (r() - 0.5) * 6.5, ry: r() * 6.3 })
  } else if (roll < 0.5) { // a crop field, mostly corn
    const pick = r()
    const crop = pick < 0.5 ? 'crops_cornStageD' : pick < 0.8 ? 'crops_wheatStageB' : 'crop_pumpkin'
    boxes.push({ x: 0, y: 0.03, z: 0, w: 11, h: 0.06, d: 11, c: '#7b5a3c' }) // ploughed earth
    const step = crop === 'crops_cornStageD' ? 1.4 : 1.8
    for (let a = -4; a <= 4; a += step) for (let b = -4; b <= 4; b += step * 1.25) props.push({ url: KEN(crop), height: crop === 'crop_pumpkin' ? 0.55 : crop === 'crops_cornStageD' ? 1.6 : 0.85, x: a, z: b, ry: 0 })
    if (r() < 0.4) boxes.push({ x: 4.8, y: 0, z: -4.8, w: 0.14, h: 1.7, d: 0.14, c: WOOD }, { x: 4.8, y: 1.1, z: -4.8, w: 1.2, h: 0.12, d: 0.12, c: WOOD }) // a scarecrow
  } else if (roll < 0.62) { // an orchard
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) props.push({ url: KEN(r() < 0.5 ? 'tree_default' : 'tree_oak'), height: 3.4 + r() * 0.8, x: -3.6 + a * 3.6, z: -3.6 + b * 3.6, ry: r() * 6.3 })
  } else if (roll < 0.73) { // a barn with hay
    barn(boxes, 0, -0.5, r() < 0.5 ? 0 : Math.PI / 2)
    hay(boxes, 4.2, 3.8, 0.2); hay(boxes, -4.3, 4.3, -0.2)
    props.push({ url: CUBE('Chicken'), height: 0.6, x: 3, z: -4, ry: r() * 6.3 })
  } else if (roll < 0.79) { // a silo and hay
    silo(boxes, 0, 0); hay(boxes, 3.4, 1.5, 0.4); hay(boxes, -3.4, 2, 1)
  } else if (roll < 0.86) { // a pond
    boxes.push({ x: 0, y: 0.02, z: 0, w: 9, h: 0.1, d: 7, c: '#d9c98f' }, { x: 0, y: 0.1, z: 0, w: 7.4, h: 0.08, d: 5.4, c: '#4db3e6' })
    props.push({ url: KEN('lily_large'), height: 0.2, x: 1, z: 0, ry: 0 })
  } else if (roll < 0.89 && allowTall) { // a windmill
    windmill(boxes, 0, 0, 0, r)
  } else if (roll < 0.96) { // a grove
    for (let i = 0; i < 6; i++) props.push({ url: KEN(['tree_pineTallA', 'tree_pineRoundA', 'tree_default'][Math.floor(r() * 3)]), height: 5 + r() * 3, x: (r() - 0.5) * 9, z: (r() - 0.5) * 9, ry: r() * 6.3 })
  } else { // a second field
    boxes.push({ x: 0, y: 0.03, z: 0, w: 11, h: 0.06, d: 11, c: '#8a6a44' })
    for (let a = -4; a <= 4; a += 1.4) for (let b = -4; b <= 4; b += 1.75) props.push({ url: KEN('crops_cornStageD'), height: 1.6, x: a, z: b, ry: 0 })
  }
  return { boxes, props, cows, half: 5.5 }
}

function fillDress(p: Plot, idx: number): Dress {
  const r = rng(idx * 104729 + 7)
  const boxes: Box[] = [], props: Prop[] = [], cows: Cow[] = []
  // the free ground around a hut yard (half-width 8.5): from the yard fence out to the street kerb
  const free = p.cellSize / 2 - 8
  const space = Math.max(6, free - 10)
  const half = Math.min(5.5, space / 2 - 0.2)
  const s = half / 5.5
  const c = 10 + space / 2
  const slots: [number, number][] = [[-c, -c], [c, -c], [-c, c], [c, c]]
  slots.forEach(([X, Z], si) => {
    const l = piece(r, si < 2)
    for (const b of l.boxes) boxes.push({ ...b, x: X + b.x * s, z: Z + b.z * s, y: b.y * s, w: b.w * s, h: b.h * s, d: b.d * s })
    for (const q of l.props) props.push({ ...q, x: X + q.x * s, z: Z + q.z * s, height: q.height * s })
    for (const k of l.cows) cows.push({ x: X + k.x * s, z: Z + k.z * s, bx: X, bz: Z, half: half - 0.9, dark: k.dark, scale: s, th: r() * 6.3, wait: r() * 4 })
  })
  return { boxes, props, cows, sign: { x: 0, z: 0, big: false } }
}

// ------------------------------------------------------------------------------------------------
// building the geometry and the signs

const boxGeo = new Map<string, THREE.BoxGeometry>()
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V(1, 1, 1), _c = new THREE.Color()

type LotData = { geo: THREE.BufferGeometry; items: ScatterItem[]; cows: Cow[]; frame: { C: THREE.Vector3; up: THREE.Vector3; right: THREE.Vector3; front: THREE.Vector3 }; sign: { pos: THREE.Vector3; big: boolean }; plot: Plot }

function frameOf(layout: SphereLayout, p: Plot) {
  const up = p.dir.clone()
  const front = frontDir(p)
  const right = new V().crossVectors(up, front).normalize()
  const C = up.clone().multiplyScalar(layout.R + layout.ground(up))
  return { C, up, right, front }
}

function buildLot(layout: SphereLayout, idx: number, fill = false): LotData {
  const p = layout.plots[idx]
  const R = layout.R
  const dr = fill ? fillDress(p, idx) : dress(p, idx)
  // the plot is scaled to fit its cell (cells are a little smaller near the corners of the cube-sphere grid), and a path joins its gate to the street
  const half = [8.5, 19, 14, 22, 27][p.tier]
  const W = Math.max(8, p.cellSize / 2 - 12.5)
  const k = fill ? 1 : Math.min(1, W / half)
  const boxes: Box[] = dr.boxes.map((b) => ({ ...b, x: b.x * k, y: b.y * k, z: b.z * k, w: b.w * k, h: b.h * k, d: b.d * k }))
  const props: Prop[] = dr.props.map((q) => ({ ...q, x: q.x * k, z: q.z * k, height: q.height * k }))
  const sign = { x: dr.sign.x * k, z: dr.sign.z * k + (W - half * k) * 0.0, big: dr.sign.big }
  if (!fill && W - half * k > 1) boxes.push({ x: 0, y: 0.03, z: (half * k + W + 6) / 2, w: 3.4, h: 0.08, d: W + 6 - half * k, c: STONE })
  const f = frameOf(layout, p)
  const basis = new THREE.Matrix4().makeBasis(f.right, f.up, f.front).setPosition(f.C)
  const tmp = new V(), L = new V(), d = new V()
  /** Move a point from the plot's flat frame onto the curved ground (so a 50 m plaza follows the planet instead of cutting through it). */
  const project = (v: THREE.Vector3) => {
    const h0 = tmp.copy(v).sub(f.C).dot(f.up)
    L.copy(v).addScaledVector(f.up, -h0)
    d.copy(L).normalize()
    return v.copy(d).multiplyScalar(R + layout.ground(d) + h0)
  }
  const geos: THREE.BufferGeometry[] = []
  for (const b of boxes) {
    const segW = Math.max(1, Math.ceil(b.w / 4)), segD = Math.max(1, Math.ceil(b.d / 4))
    const g = new THREE.BoxGeometry(b.w, b.h, b.d, b.w > 6 ? segW : 1, 1, b.d > 6 ? segD : 1)
    g.deleteAttribute('uv')
    g.translate(0, b.h / 2, 0)
    _e.set(0, b.ry ?? 0, b.rz ?? 0, 'YXZ')
    _q.setFromEuler(_e)
    _m.compose(new V(b.x, b.y, b.z), _q, _s).premultiply(basis)
    g.applyMatrix4(_m)
    const flat = g.index ? g.toNonIndexed() : g
    const pos = flat.attributes.position as THREE.BufferAttribute
    const v = new V()
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); project(v); pos.setXYZ(i, v.x, v.y, v.z) }
    flat.computeVertexNormals()
    _c.set(b.c)
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) col.set([_c.r, _c.g, _c.b], i * 3)
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geos.push(flat)
  }
  // lamp post carrying the stream's sign
  const post = (x: number, z: number, big: boolean) => {
    const o: Box[] = [
      { x, y: 0, z, w: 0.26, h: big ? 5.2 : 4.4, d: 0.26, c: DARK },
      { x, y: big ? 5.2 : 4.4, z, w: 0.7, h: 0.4, d: 0.7, c: '#ffe9a6' },
    ]
    return o
  }
  const sp = fill ? [] : post(sign.x, sign.z, sign.big)
  for (const b of sp) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d)
    g.deleteAttribute('uv')
    g.translate(0, b.h / 2, 0)
    _m.compose(new V(b.x, b.y, b.z), _q.identity(), _s).premultiply(basis)
    g.applyMatrix4(_m)
    const flat = g.toNonIndexed()
    const pos = flat.attributes.position as THREE.BufferAttribute
    const v = new V()
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); project(v); pos.setXYZ(i, v.x, v.y, v.z) }
    flat.computeVertexNormals()
    _c.set(b.c)
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) col.set([_c.r, _c.g, _c.b], i * 3)
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geos.push(flat)
  }
  if (!geos.length) { // nothing solid on this plot: keep one degenerate triangle so there is still a geometry to merge
    const g = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'color']) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(9), 3))
    geos.push(g)
  }
  const geo = mergeGeometries(geos, false)!
  geos.forEach((g) => g.dispose())

  const items: ScatterItem[] = props.map((pr) => {
    const w = new V().copy(f.C).addScaledVector(f.right, pr.x).addScaledVector(f.front, pr.z)
    const dd = w.clone().normalize()
    const pos = dd.clone().multiplyScalar(R + layout.ground(dd) + (pr.y ?? 0))
    return { url: pr.url, height: pr.height, pos, up: dd, yaw: p.yaw + pr.ry }
  })
  const signPos = new V().copy(f.C).addScaledVector(f.right, sign.x).addScaledVector(f.front, sign.z)
  const sd = signPos.clone().normalize()
  return { geo, items, cows: dr.cows ?? [], frame: f, sign: { pos: sd.multiplyScalar(R + layout.ground(sd)), big: sign.big }, plot: p }
}

// ---- the sign texture: everything the API tells us about the stream ----

const texCache = new Map<string, THREE.CanvasTexture>()
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
    if (lines.length >= maxLines) break
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…')
  return lines
}
function signTexture(p: Plot): THREE.CanvasTexture {
  const s = p.stream
  const key = s.login + '|' + s.viewers + '|' + s.title
  const hit = texCache.get(key)
  if (hit) return hit
  if (texCache.size > 160) { texCache.forEach((t) => t.dispose()); texCache.clear() }
  const c = document.createElement('canvas')
  c.width = 640; c.height = 400
  const g = c.getContext('2d')!
  const accent = GROUPS[p.group].color
  g.fillStyle = '#12101c'; g.fillRect(0, 0, 640, 400)
  g.fillStyle = accent; g.fillRect(0, 0, 640, 14); g.fillRect(0, 386, 640, 14)
  g.fillStyle = '#ffffff'; g.textBaseline = 'top'
  g.font = '700 54px system-ui, sans-serif'
  g.fillText(s.displayName.slice(0, 22), 28, 34, 584)
  g.fillStyle = accent; g.font = '600 32px system-ui, sans-serif'
  g.fillText((s.game || 'Streaming').slice(0, 34), 28, 100, 584)
  g.fillStyle = '#d9d6e6'; g.font = '400 28px system-ui, sans-serif'
  wrap(g, s.title || '', 584, 2).forEach((l, i) => g.fillText(l, 28, 150 + i * 36, 584))
  g.fillStyle = '#ff5a5a'; g.beginPath(); g.arc(44, 262, 11, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#ffffff'; g.font = '700 34px system-ui, sans-serif'
  g.fillText(`${s.viewers.toLocaleString()} watching`, 64, 246, 540)
  g.fillStyle = '#a9a5bd'; g.font = '400 27px system-ui, sans-serif'
  const bits = [s.avgViewers ? `avg ${Math.round(s.avgViewers).toLocaleString()}` : '', s.language ? s.language.toUpperCase() : '', s.location?.city ?? '', ['Hut', 'Cottage', 'House', 'Tower', 'Skyscraper'][p.tier]].filter(Boolean)
  g.fillText(bits.join('  ·  '), 28, 300, 584)
  g.fillStyle = '#7d7893'; g.font = '400 24px system-ui, sans-serif'
  g.fillText(`twitch.tv/${s.login}`, 28, 342, 584)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  texCache.set(key, t)
  return t
}

/** The board is thicker than the lamp post that carries it, so the post never pokes out of the face. */
function Sign({ lot }: { lot: LotData }) {
  const tex = useMemo(() => signTexture(lot.plot), [lot.plot.stream.viewers, lot.plot.stream.login, lot.plot.stream.title]) // eslint-disable-line react-hooks/exhaustive-deps
  const w = lot.sign.big ? 5.6 : 3.4, h = w * 0.625
  const y = (lot.sign.big ? 5.2 : 4.4) - h / 2 - 0.2
  const m = useMemo(() => {
    const f = lot.frame
    const up = lot.sign.pos.clone().normalize()
    const right = new V().crossVectors(up, f.front).normalize()
    const front = new V().crossVectors(right, up).normalize()
    return new THREE.Matrix4().makeBasis(right, up, front).setPosition(lot.sign.pos)
  }, [lot])
  return (
    <group matrixAutoUpdate={false} matrix={m}>
      <mesh position={[0, y, 0]} raycast={() => null}>
        <boxGeometry args={[w + 0.2, h + 0.2, 0.36]} />
        <meshStandardMaterial color="#1a1826" roughness={1} />
      </mesh>
      <mesh position={[0, y, 0.19]} raycast={() => null}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, y, -0.19]} rotation={[0, Math.PI, 0]} raycast={() => null}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ------------------------------------------------------------------------------------------------

const lotCache = new WeakMap<SphereLayout, Map<number, LotData>>()
function lotOf(layout: SphereLayout, idx: number, fill = false) {
  let m = lotCache.get(layout)
  if (!m) { m = new Map(); lotCache.set(layout, m) }
  const key = fill ? idx + 1e8 : idx
  let l = m.get(key)
  if (!l) {
    if (m.size > 420) { m.forEach((v) => v.geo.dispose()); m.clear() }
    l = buildLot(layout, idx, fill); m.set(key, l)
  }
  return l
}

/** Plots for the buildings near the camera. `near` lists candidate building indices around a point. */
export function Lots({ layout, near }: { layout: SphereLayout; near: (p: THREE.Vector3, fn: (i: number) => void) => void }) {
  const { camera } = useThree()
  const [ids, setIds] = useState<number[]>([])
  const last = useRef(''), clock = useRef(0)
  const pw = useMemo(() => new V(), [])
  useFrame((_, dt) => {
    clock.current += dt
    if (clock.current < 0.35) return
    clock.current = 0
    const R = layout.R
    let list: number[] = []
    if (camera.position.length() - R < 420) {
      const cands: [number, number][] = []
      near(camera.position, (i) => {
        const d = pw.copy(layout.plots[i].dir).multiplyScalar(R).distanceTo(camera.position)
        if (d < 190) cands.push([d, i])
      })
      cands.sort((a, b) => a[0] - b[0])
      list = cands.slice(0, 36).map((c) => c[1]).sort((a, b) => a - b)
    }
    const key = list.join(',')
    if (key !== last.current) { last.current = key; setIds(list) }
  })
  const lots = useMemo(() => ids.map((i) => lotOf(layout, i)), [ids, layout])
  const geo = useMemo(() => (lots.length ? mergeGeometries(lots.map((l) => l.geo), false) : null), [lots])
  useEffect(() => () => { geo?.dispose() }, [geo])
  const items = useMemo(() => lots.flatMap((l) => l.items), [lots])
  if (!lots.length) return null
  return (
    <group>
      {geo && <mesh geometry={geo} raycast={() => null}><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>}
      <Scatter items={items} />
      {lots.slice(0, 24).map((l) => <Sign key={l.plot.stream.login} lot={l} />)}
    </group>
  )
}


/** The countryside around the huts near you (a wider ring than the full plots: fields, farms, cattle, barns). */
export function Countryside({ layout, within }: { layout: SphereLayout; within: (p: THREE.Vector3, r: number, fn: (i: number) => void) => void }) {
  const { camera } = useThree()
  const [ids, setIds] = useState<number[]>([])
  const last = useRef(''), clock = useRef(0)
  const pw = useMemo(() => new V(), [])
  useFrame((_, dt) => {
    clock.current += dt
    if (clock.current < 0.8) return
    clock.current = 0
    const R = layout.R
    let list: number[] = []
    if (camera.position.length() - R < 300) {
      const cands: [number, number][] = []
      within(camera.position, 420, (i) => {
        const pl = layout.plots[i]
        if (pl.tier !== 0) return
        const d = pw.copy(pl.dir).multiplyScalar(R).distanceTo(camera.position)
        if (d < 420) cands.push([d, i])
      })
      cands.sort((a, b) => a[0] - b[0])
      list = cands.slice(0, 130).map((c) => c[1]).sort((a, b) => a - b)
    }
    const key = list.join(',')
    if (key !== last.current) { last.current = key; setIds(list) }
  })
  const lots = useMemo(() => ids.map((i) => lotOf(layout, i, true)), [ids, layout])
  const geo = useMemo(() => (lots.length ? mergeGeometries(lots.map((l) => l.geo), false) : null), [lots])
  useEffect(() => () => { geo?.dispose() }, [geo])
  const items = useMemo(() => lots.flatMap((l) => l.items), [lots])
  const herd = useMemo(() => lots.flatMap((l) => l.cows.map((c) => ({ c, l }))), [lots])
  const cowGeos = useMemo(() => [cowGeometry(false), cowGeometry(true)], [])
  const meshes = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)]
  const place = useMemo(() => ({ m: new THREE.Matrix4(), pos: new V(), up: new V() }), [])
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const n = [0, 0]
    for (const { c, l } of herd) {
      // wander about the pasture: walk, turn a little, stop to graze, and turn back at the fence
      c.wait -= dt
      if (c.wait <= 0) { c.wait = 1.5 + Math.random() * 5; c.th += (Math.random() - 0.5) * 2.4; if (Math.random() < 0.4) c.wait += 4 }
      const grazing = c.wait > 4.5
      if (!grazing) {
        const v = 0.55 * c.scale
        c.x += Math.sin(c.th) * v * dt; c.z += Math.cos(c.th) * v * dt
        if (Math.abs(c.x - c.bx) > c.half || Math.abs(c.z - c.bz) > c.half) { c.th = Math.atan2(c.bx - c.x, c.bz - c.z) + (Math.random() - 0.5) * 0.8; c.x = THREE.MathUtils.clamp(c.x, c.bx - c.half, c.bx + c.half); c.z = THREE.MathUtils.clamp(c.z, c.bz - c.half, c.bz + c.half) }
      }
      const f = l.frame
      place.pos.copy(f.C).addScaledVector(f.right, c.x).addScaledVector(f.front, c.z)
      place.up.copy(place.pos).normalize()
      place.pos.copy(place.up).multiplyScalar(f.C.length())
      const k = c.dark ? 1 : 0
      const mesh = meshes[k].current
      if (!mesh) continue
      mesh.setMatrixAt(n[k]++, placementMatrix(place.m, { pos: place.pos, up: place.up, yaw: l.plot.yaw + c.th, scale: c.scale }))
    }
    meshes.forEach((ref, k) => { const mesh = ref.current; if (mesh) { mesh.count = n[k]; mesh.instanceMatrix.needsUpdate = true } })
  })
  if (!lots.length) return null
  return (
    <group>
      {geo && <mesh geometry={geo} raycast={() => null}><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>}
      <Scatter items={items} />
      {cowGeos.map((g, k) => <instancedMesh key={k} ref={meshes[k]} args={[g, undefined, 1500]} frustumCulled={false} raycast={() => null}><meshStandardMaterial vertexColors roughness={1} flatShading /></instancedMesh>)}
    </group>
  )
}

function cowGeometry(dark: boolean) {
  const parts = cowParts(dark).map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed()
    g.deleteAttribute('uv')
    g.translate(b.x, b.y + b.h / 2, b.z)
    _c.set(b.c)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  })
  const g = mergeGeometries(parts, false)!
  parts.forEach((q) => q.dispose())
  return g
}
