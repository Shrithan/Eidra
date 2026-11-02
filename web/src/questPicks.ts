import type { Stream } from './api'
import { groupIndex } from './sphereLayout'
import { streamsNow } from './streamStore'

/** Smallest streams are the most likely to be offered, so new channels get found: huts, then cottages, houses, towers, skyscrapers. */
const TIERS = [{ max: 39, weight: 50 }, { max: 99, weight: 25 }, { max: 299, weight: 13 }, { max: 999, weight: 8 }, { max: Infinity, weight: 4 }]
const tierOf = (viewers: number) => TIERS.findIndex((t) => viewers <= t.max)

/** `count` different live streamers from one planet (a genre group index), or from everywhere when `group` is null. */
export function pickStreamers(group: number | null, count = 3): Stream[] {
  const pool = streamsNow().filter((s) => s.viewers > 0 && (group === null || groupIndex(s.game) === group))
  const buckets = TIERS.map(() => [] as Stream[])
  for (const s of pool) buckets[tierOf(s.viewers)].push(s)
  const picked: Stream[] = []
  while (picked.length < count) {
    const open = buckets.map((b, i) => ({ b, w: TIERS[i].weight })).filter((x) => x.b.length)
    const total = open.reduce((n, x) => n + x.w, 0)
    if (!total) break
    let roll = Math.random() * total
    const tier = open.find((x) => (roll -= x.w) < 0) ?? open[open.length - 1]
    picked.push(tier.b.splice(Math.floor(Math.random() * tier.b.length), 1)[0])
  }
  return picked
}
