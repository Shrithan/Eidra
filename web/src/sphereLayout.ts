import * as THREE from 'three'
import type { Stream } from './api'
import { createTerrain, type Terrain } from './sphereTerrain'
import { makeLattice, roadSides, type Lattice } from './sphereLattice'
import { THEMES, type Theme } from './sphereThemes'

/** Genre groups ("continents"). The order is the order they appear along the space-filling curve, so neighbours are related. */
export type Group = { id: string; name: string; color: string; test: RegExp }

export const GROUPS: Group[] = [
  { id: 'chat', name: 'Chat Isles', color: '#ff9f6b', test: /just chatting|talk show|podcast|\birl\b|pools|hot tub|travel|outdoors|food|cooking|asmr|special events|slots|gambling|casino|crypto|politics|co-working|study|always on|sleep|vrchat|watch ?party|reaction|stream ?together/i },
  { id: 'creative', name: 'Creator Coast', color: '#f56bd6', test: /music|\bdjs?\b|^art$|\bart\b|creative|science|technology|software|game development|makers|crafting|beauty|body art|fitness|just dance|karaoke|writing|animals|aquarium|drawing|painting|singing|guitar|piano|coding|programming/i },
  { id: 'strategy', name: 'Strategy Heights', color: '#5aa9ff', test: /league of legends|dota|teamfight|hearthstone|chess|starcraft|age of empires|civilization|marvel snap|magic: the gathering|runeterra|poker|bridge|auto chess|clash|brawl stars|mobile legends|smite|heroes of|total war|stellaris|xcom|tactics|strategy|card|board|shadowverse|slay the spire|yu-gi-oh|pok[eé]mon tcg|deckbuilder|lorcana|backpack battles|balatro|rimworld|crusader kings|hearts of iron|europa universalis|\\banno\\b|warcraft|frostpunk|they are billions|northgard/i },
  { id: 'rpg', name: 'Realm of Quests', color: '#a98bff', test: /world of warcraft|elden ring|genshin|diablo|final fantasy|baldur|lost ark|runescape|path of exile|new world|skyrim|cyberpunk|dark souls|black desert|dragon|pok[eé]mon|zelda|honkai|star rail|mmo|rpg|lineage|tibia|guild wars|monster hunter|fallout|witcher|mass effect|persona|destiny|\bonline\b|aion|maplestory|crimson desert|phantom blade|nikke|goddess of victory|torchlight|epic seven|arknights|umamusume|ragnarok|throne and liberty|fire emblem|xenoblade|kingdom hearts|nier|tales of|bloodborne|sekiro|lies of p|wuthering|zenless|blue protocol|tower of fantasy|grim dawn|last epoch|warhammer|vampire|souls|knight|castlevania|ghost of tsushima|quest|soulslike|\\bys\\b|trails/i },
  { id: 'sandbox', name: 'Sandbox Lands', color: '#6bdc8b', test: /minecraft|roblox|grand theft|\bgta\b|\brust\b|ark:|terraria|palworld|sims|stardew|satisfactory|factorio|fall guys|among us|7 days|valheim|\braft\b|subnautica|no man|v rising|core keeper|animal crossing|garry|survival|craft|simulator|farming|simulation|cities|truck|dayz|project zomboid|once human|enshrouded|star citizen|\bpeak\b|palia|sea of thieves|the isle|red dead|euro truck|forza horizon|planet zoo|planet coaster|house flipper|powerwash|cooking simulator|skyblock|the forest|green hell|the long dark|astroneer|space engineers|kerbal|dyson sphere|oxygen not included|lego|fortnite creative|hello neighbor|content warning|schedule i|cult of the lamb|dave the diver|webfishing|jackbox|party pack|marbles on stream|games \+ demos/i },
  { id: 'arcade', name: 'Arcade & Sports', color: '#ffd84d', test: /street fighter|tekken|mortal kombat|smash|mario|rocket league|ea sports|\bfc ?\d|fifa|nba|madden|nhl|mlb|\bf1\b|formula|gran turismo|forza|racing|fighting|sonic|retro|arcade|platformer|rhythm|\bosu\b|tetris|sports|football|soccer|basketball|baseball|boxing|wrestling|ufc|wwe|golf|tennis|bowling|splatoon|brawlhalla|guilty gear|contest of champions|hollow knight|celeste|geometry dash|cuphead|super|kart|pinball|dance|beat saber|guitar hero|clone hero|rhythm doctor|speedrun|trackmania|assetto|iracing|rally|wrc|motogp|nascar|burnout|need for speed|the crew|gran|mini ?golf|pummel|party animals|stumble|gang beasts|overcooked|it takes two|moon sweepers/i },
  { id: 'shooter', name: 'Battlefront', color: '#ff5a5a', test: /valorant|counter-strike|call of duty|warzone|apex|fortnite|overwatch|rainbow six|pubg|battlefield|halo|tarkov|the finals|marvel rivals|deadlock|splitgate|team fortress|quake|\bdoom\b|delta force|arc raiders|helldivers|payday|left 4 dead|back 4 blood|shooter|\bfps\b|battle royale|crossfire|siege|gears of war|hunt: showdown|wardogs|gray zone|arena breakout|warframe|world of tanks|world of warships|war thunder|the division|ghosts of tabor|stalzone|stalker|\\barma\\b|insurgency|squad|ready or not|sniper|ghost recon|far cry|borderlands|titanfall|bodycam|rogue company|spectre divide|xdefiant|paladins|apex|combat|warfare|gunfire|\\bmetro\\b|bioshock|cs2|cs:go|black ops|modern warfare|battlebit|hell let loose|post scriptum|escape from|zombies|dead ?rising|killing floor|vermintide|darktide|deep rock|overkill|mercenaries|mercenary/i },
  { id: 'horror', name: 'Haunted Hollow', color: '#18d6c4', test: /resident evil|silent hill|outlast|hellraiser|mortuary assistant|phasmophobia|dead by daylight|lethal company|r\.e\.p\.o|halloween|amnesia|alien: isolation|until dawn|visage|madison|demonologist|devour|fears to fathom|backrooms|don't scream|horror|five nights|poppy playtime|dark deception|dead space|evil|nightmare|haunt|scream|terror|dread|fear|fatal frame|the quarry|little nightmares|layers of fear|alan wake|the evil within|clive barker|voices of the void|shift at midnight|\\bvampir\\b|silver pines|mouthwashing|killer frequency|reanimal|labyrinthine|slay the princess|my friendly neighborhood|tenebris|creep|demon|paranormal|abandoned|mimic|mannequin|dying light|the callisto|scorn|soma|cry of fear|slender|ritual|exorcis/i },
  { id: 'other', name: 'Frontier', color: '#9aa0aa', test: /./ },
]

// Several keywords overlap (Fortnite is a shooter and a sandbox), so the first match in this order wins.
const PRIORITY = ['shooter', 'horror', 'rpg', 'strategy', 'sandbox', 'arcade', 'creative', 'chat', 'other']
const BY_ID = new Map(GROUPS.map((g, i) => [g.id, i]))
// Twitch's own non-game categories are decided before any keyword guessing
const NON_GAMES = /^(just chatting|always on|irl|asmr|special events|talk shows? & podcasts|pools, hot tubs & beaches|i'm only sleeping|vrchat|music|djs|art|science & technology|software and game development|makers & crafting|sports|fitness & health|food & drink|travel & outdoors|animals, aquariums, & zoos)$/i
const CHAT_LIKE = /^(just chatting|always on|irl|asmr|special events|talk shows? & podcasts|pools, hot tubs & beaches|i'm only sleeping|vrchat|sports|fitness & health|food & drink|travel & outdoors)$/i

export function groupIndex(game: string | undefined): number {
  const name = game || ''
  if (NON_GAMES.test(name)) return BY_ID.get(CHAT_LIKE.test(name) ? 'chat' : 'creative')!
  for (const id of PRIORITY) {
    const g = GROUPS[BY_ID.get(id)!]
    if (g.id !== 'other' && g.test.test(name)) return BY_ID.get(id)!
  }
  return BY_ID.get('other')!
}

/**
 * Five building tiers by how many people are watching right now: the busiest streams get skyscrapers,
 * the quietest get huts. Cut-offs were picked from the real distribution of the top 5,000 streams
 * (median 60 viewers, top 5% over 590, top 1% over 2,100).
 */
export type Tier = { id: string; name: string; min: number; footprint: [number, number]; height: [number, number] }
export const TIERS: Tier[] = [
  { id: 'hut', name: 'Hut', min: 0, footprint: [5, 6.5], height: [3.4, 4.2] },
  { id: 'cottage', name: 'Cottage', min: 40, footprint: [7, 9], height: [6, 8] },
  { id: 'house', name: 'House', min: 100, footprint: [10, 12.5], height: [10, 14] },
  { id: 'tower', name: 'Tower', min: 300, footprint: [13, 16], height: [20, 30] },
  { id: 'skyscraper', name: 'Skyscraper', min: 1000, footprint: [17, 20], height: [38, 52] },
]

/** What a stream's building is sized by: its usual audience, not this minute's spike. */
export const sizeViewers = (s: Stream) => s.avgViewers ?? s.viewers

export function tierOf(viewers: number): number {
  let t = 0
  for (let i = 0; i < TIERS.length; i++) if (viewers >= TIERS[i].min) t = i
  return t
}

/** Where a stream sits inside its tier (0 = the quietest of the tier, 1 = the busiest), on a log scale. */
function tierPosition(viewers: number, tier: number): number {
  const lo = Math.max(1, TIERS[tier].min)
  const hi = tier + 1 < TIERS.length ? TIERS[tier + 1].min : lo * 20
  return Math.min(1, Math.max(0, (Math.log(Math.max(viewers, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))))
}

export type Plot = {
  stream: Stream
  tier: number // index into TIERS
  group: number
  category: string
  dir: THREE.Vector3 // unit vector from the planet's centre to the building
  footprint: number // metres
  height: number // metres
  yaw: number
  cell: number // index of the lattice cell this plot stands on
  cellSize: number // metres across that cell
  country: number // index into COUNTRY_COLORS: one of the 12 biggest games on the planet, or COUNTRY_LIMIT for "other games"
}

/** Only the busiest games get a country of their own, so they can be told apart from orbit; every other game shares one. */
export const COUNTRY_LIMIT = 12
export const COUNTRY_COLORS = ['#e6194b', '#f58231', '#ffe119', '#bfef45', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4', '#f032e6', '#fabed4', '#9a6324', '#aaffc3', '#8c91a0']
export type Country = { index: number; name: string; color: string; centroid: THREE.Vector3; count: number; viewers: number }

export type Territory = { group: number; category: string | null; centroid: THREE.Vector3; count: number; viewers: number; country: number }

export type SphereLayout = {
  R: number
  detail: number // subdivisions of the ground mesh
  spacing: number
  terrain: Terrain
  theme: Theme
  /** Metres above the base radius at a direction: sea level 0, flat cities, hills and mountains. */
  ground: (d: THREE.Vector3) => number
  lattice: Lattice
  plots: Plot[]
  groups: Territory[]
  categories: Territory[]
  countries: Country[]
  byLogin: Map<string, number>
}

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** Hilbert curve index of (x, y) in a 2^order grid. */
function hilbert(order: number, x: number, y: number) {
  const n = 1 << order
  let d = 0
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0
    const ry = (y & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (ry === 0) {
      if (rx === 1) { x = n - 1 - x; y = n - 1 - y }
      const t = x; x = y; y = t
    }
  }
  return d
}

const ORDER = 9 // 512 x 512 cells per cube face
// A path through the six cube faces where each face touches the next: +Y, +X, +Z, -X, -Z, -Y
const FACE_ORDER = ['+y', '+x', '+z', '-x', '-z', '-y']

/** Position of a point along a curve that visits the whole sphere, so nearby positions in the curve are nearby on the sphere. */
function curveKey(p: THREE.Vector3) {
  const ax = Math.abs(p.x), ay = Math.abs(p.y), az = Math.abs(p.z)
  let face: string, u: number, v: number
  if (ay >= ax && ay >= az) { face = (p.y > 0 ? '+' : '-') + 'y'; u = p.x / ay; v = p.z / ay }
  else if (ax >= az) { face = (p.x > 0 ? '+' : '-') + 'x'; u = p.z / ax; v = p.y / ax }
  else { face = (p.z > 0 ? '+' : '-') + 'z'; u = p.x / az; v = p.y / az }
  const size = 1 << ORDER
  const gx = Math.min(size - 1, Math.floor(((u + 1) / 2) * size))
  const gy = Math.min(size - 1, Math.floor(((v + 1) / 2) * size))
  return FACE_ORDER.indexOf(face) * size * size + hilbert(ORDER, gx, gy)
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Turns a list of streams into a world. Order: genre group -> game (category) -> viewers. That one list is laid along
 * a space-filling curve over the city districts, so every genre is a continent and every game a country, with
 * wilderness (mountains, lakes, forests) between the districts. Points are jittered, so streets are organic, not a grid.
 */
/** The yaw that turns a building's front door towards one of the streets around its cell. */
function doorYaw(lattice: Lattice, cellIdx: number, pick: number) {
  const c = lattice.cells[cellIdx]
  const sides = roadSides(c)
  const open = [0, 1, 2, 3].filter((k) => sides[k])
  const k = open[Math.floor(pick * open.length) % open.length]
  const mid = lattice.corners[c.corners[k]].clone().add(lattice.corners[c.corners[(k + 1) % 4]]).normalize()
  const up = c.centre
  const t = mid.clone().sub(up.clone().multiplyScalar(mid.dot(up))).normalize()
  const ref = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up))
  return Math.atan2(new THREE.Vector3().crossVectors(ref, t).dot(up), ref.dot(t))
}

export function layoutSphere(streams: Stream[], spacing = 60, theme: Theme = THEMES[0], seed = 0): SphereLayout {
  const buckets = GROUPS.map(() => new Map<string, Stream[]>())
  for (const s of streams) {
    const g = groupIndex(s.game)
    const cat = s.game || 'Unknown'
    const m = buckets[g]
    if (!m.has(cat)) m.set(cat, [])
    m.get(cat)!.push(s)
  }
  const flat: { stream: Stream; group: number; category: string; country: number }[] = []
  buckets.forEach((cats, group) => {
    const ordered = [...cats.entries()]
      .map(([category, list]) => ({ category, list: list.sort((a, b) => sizeViewers(b) - sizeViewers(a)), total: list.reduce((n, s) => n + sizeViewers(s), 0) }))
      .sort((a, b) => b.total - a.total)
    ordered.forEach((c, rank) => { for (const stream of c.list) flat.push({ stream, group, category: c.category, country: Math.min(rank, COUNTRY_LIMIT) }) })
  })

  const n = flat.length
  // a bit under 40% of the planet is city, the rest is sea, beaches and mountains, so there are about 2.6 times as many cells as buildings
  const N = Math.max(2, 2 * Math.ceil(Math.sqrt((n * 2.6) / 6) / 2))
  const M = 6 * N * N
  const R = Math.max(260, Math.sqrt((M * spacing * spacing) / (4 * Math.PI)))
  // every planet's ground mesh has facets about the same size, and a mountain shelf about as tall as a facet is wide, so mountains look alike everywhere
  const detail = Math.min(190, Math.max(120, Math.round(R / 13.5)))
  const facet = (R * 1.05) / (detail + 1)
  const terrain = createTerrain({ seed, theme, scale: R / 1580, step: Math.max(16, facet * 1.1) })
  const lattice = makeLattice(N, R)

  // the n most "urban" cells become the city districts; the rest of the planet stays wild
  const scored = lattice.cells.map((c, idx) => ({ idx, p: c.centre, u: terrain.urban(c.centre) })).sort((a, b) => b.u - a.u).slice(0, n)
  terrain.setThreshold(n ? scored[n - 1].u : 0)
  const keyed = scored.map(({ p, idx }) => ({ p, idx, k: curveKey(p) })).sort((a, b) => a.k - b.k)

  // inside each game's district the busiest streams take the middle and the smallest the outskirts, like a city growing from its centre
  const spot = keyed.slice()
  for (let a = 0; a < n;) {
    let b = a
    while (b < n && flat[b].group === flat[a].group && flat[b].category === flat[a].category) b++
    if (b - a > 2) {
      const mid = new THREE.Vector3()
      for (let k = a; k < b; k++) mid.add(keyed[k].p)
      mid.normalize()
      const ring = keyed.slice(a, b).sort((x, y) => y.p.dot(mid) - x.p.dot(mid))
      for (let k = a; k < b; k++) spot[k] = ring[k - a]
    }
    a = b
  }

  const plots: Plot[] = flat.map((f, i) => {
    const tier = tierOf(sizeViewers(f.stream))
    const pos = tierPosition(sizeViewers(f.stream), tier)
    const T = TIERS[tier]
    return {
      stream: f.stream,
      tier,
      group: f.group,
      category: f.category,
      dir: spot[i].p,
      footprint: Math.min(spacing * 0.36, T.footprint[0] + (T.footprint[1] - T.footprint[0]) * pos),
      height: T.height[0] + (T.height[1] - T.height[0]) * pos,
      yaw: doorYaw(lattice, spot[i].idx, hash(f.stream.login)),
      cell: spot[i].idx,
      cellSize: lattice.cells[spot[i].idx].size,
      country: f.country,
    }
  })

  const centroidOf = (idx: number[]) => {
    const c = new THREE.Vector3()
    for (const i of idx) c.add(plots[i].dir)
    return c.lengthSq() < 1e-6 ? plots[idx[0]].dir.clone() : c.normalize()
  }
  const groupIdx = new Map<number, number[]>()
  const catIdx = new Map<string, number[]>()
  plots.forEach((p, i) => {
    if (!groupIdx.has(p.group)) groupIdx.set(p.group, [])
    groupIdx.get(p.group)!.push(i)
    const key = p.group + '|' + p.category
    if (!catIdx.has(key)) catIdx.set(key, [])
    catIdx.get(key)!.push(i)
  })
  const groups: Territory[] = [...groupIdx.entries()].map(([group, idx]) => ({
    group, category: null, centroid: centroidOf(idx), count: idx.length, viewers: idx.reduce((s, i) => s + plots[i].stream.viewers, 0), country: -1,
  }))
  const categories: Territory[] = [...catIdx.entries()].map(([, idx]) => ({
    group: plots[idx[0]].group, category: plots[idx[0]].category, centroid: centroidOf(idx), count: idx.length,
    viewers: idx.reduce((s, i) => s + plots[i].stream.viewers, 0), country: plots[idx[0]].country,
  }))
  const countryIdx = new Map<number, number[]>()
  plots.forEach((p, i) => { if (!countryIdx.has(p.country)) countryIdx.set(p.country, []); countryIdx.get(p.country)!.push(i) })
  const countries: Country[] = [...countryIdx.entries()].sort((a, b) => a[0] - b[0]).map(([index, idx]) => ({
    index, color: COUNTRY_COLORS[index], centroid: centroidOf(idx), count: idx.length, viewers: idx.reduce((s, i) => s + plots[i].stream.viewers, 0),
    name: index >= COUNTRY_LIMIT ? 'Other games' : plots[idx[0]].category,
  }))
  categories.sort((a, b) => b.viewers - a.viewers)

  return { R, detail, spacing, terrain, lattice, theme, ground: (d) => terrain.elevation(d), plots, groups, categories, countries, byLogin: new Map(plots.map((p, i) => [p.stream.login, i])) }
}

/** The tangent direction the front door of a building faces (buildings are rotated by `yaw` about their own up). */
export function frontDir(plot: Plot): THREE.Vector3 {
  const q1 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), plot.dir)
  const q2 = new THREE.Quaternion().setFromAxisAngle(plot.dir, plot.yaw)
  return new THREE.Vector3(0, 0, 1).applyQuaternion(q1).applyQuaternion(q2).normalize()
}

export type PlanetData = { index: number; group: (typeof GROUPS)[number]; theme: Theme; layout: SphereLayout }

/** The whole system: one planet per genre group, each laid out and sculpted separately. */
export function layoutSystem(streams: Stream[]): PlanetData[] {
  const byGroup = GROUPS.map(() => [] as Stream[])
  for (const s of streams) byGroup[groupIndex(s.game)].push(s)
  return GROUPS.map((group, index) => {
    const theme = THEMES.find((t) => t.id === group.id) ?? THEMES[THEMES.length - 1]
    return { index, group, theme, layout: layoutSphere(byGroup[index], 60, theme, index + 1) }
  })
}
