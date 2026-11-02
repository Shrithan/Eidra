import type { Stream } from './api'
import { COUNTRY_COLORS, COUNTRY_LIMIT, GROUPS, groupIndex, sizeViewers } from './sphereLayout'

export type GameHit = { kind: 'game'; game: string; planet: number; country: string; color: string; streams: number; viewers: number }
export type StreamerHit = { kind: 'streamer'; stream: Stream; planet: number; game: string }
export type PlanetHit = { kind: 'planet'; planet: number; name: string; streams: number }
export type Hit = GameHit | StreamerHit | PlanetHit

type Index = {
  count: number
  games: (GameHit & { key: string })[]
  streamers: { s: Stream; login: string; name: string; game: string; title: string; planet: number; w: number }[]
  planets: PlanetHit[]
}
let cache: Index | null = null

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
const FILLER = new Set(['show', 'me', 'find', 'go', 'to', 'take', 'watch', 'the', 'a', 'an', 'of', 'streamer', 'streamers', 'stream', 'streams', 'streaming', 'playing', 'plays', 'play', 'game', 'games', 'country', 'planet', 'world', 'i', 'want', 'looking', 'for', 'some', 'who', 'is', 'are', 'on', 'in', 'live'])

function build(streams: Stream[]): Index {
  if (cache && cache.count === streams.length) return cache
  const perGame = new Map<string, { planet: number; streams: number; viewers: number }>()
  const planetCount = GROUPS.map(() => 0)
  const streamers = streams.map((s) => {
    const planet = groupIndex(s.game)
    planetCount[planet]++
    const g = perGame.get(s.game || 'Unknown') ?? { planet, streams: 0, viewers: 0 }
    g.streams++; g.viewers += sizeViewers(s)
    perGame.set(s.game || 'Unknown', g)
    return { s, login: norm(s.login), name: norm(s.displayName), game: norm(s.game || ''), title: norm(s.title || ''), planet, w: Math.log10(sizeViewers(s) + 10) }
  })
  // rank each planet's games the way the world does, to know which have a country of their own
  const rank = new Map<string, number>()
  GROUPS.forEach((_, p) => {
    ;[...perGame.entries()].filter(([, g]) => g.planet === p).sort((a, b) => b[1].viewers - a[1].viewers).forEach(([name], i) => rank.set(name, i))
  })
  const games = [...perGame.entries()].map(([game, g]) => {
    const r = Math.min(rank.get(game) ?? COUNTRY_LIMIT, COUNTRY_LIMIT)
    return { kind: 'game' as const, key: norm(game), game, planet: g.planet, country: r < COUNTRY_LIMIT ? game : 'Other games', color: COUNTRY_COLORS[r], streams: g.streams, viewers: g.viewers }
  })
  cache = { count: streams.length, games, streamers, planets: GROUPS.map((g, i) => ({ kind: 'planet' as const, planet: i, name: g.name, streams: planetCount[i] })) }
  return cache
}

/** How well one query word matches a piece of text: exact word 5, word start 4, anywhere 2, one typo 1, nothing 0. */
function wordScore(tok: string, text: string): number {
  if (!text) return 0
  if (text === tok) return 6
  const words = text.split(/[^a-z0-9\u0080-￿]+/)
  if (words.includes(tok)) return 5
  if (words.some((w) => w.startsWith(tok))) return 4
  if (text.includes(tok)) return 2
  if (tok.length >= 4) for (const w of words) if (Math.abs(w.length - tok.length) <= 1 && w.length >= 4 && editWithin1(tok, w.slice(0, tok.length + 1))) return 1
  return 0
}
function editWithin1(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** One search box for everything: games (to find their country), streamers, planets. Filler words are ignored. */
export function searchAll(streams: Stream[], query: string): Hit[] {
  const q = norm(query).trim()
  if (!q) return []
  const idx = build(streams)
  let toks = q.split(/\s+/).filter(Boolean)
  const content = toks.filter((t) => !FILLER.has(t))
  if (content.length) toks = content
  const phrase = toks.join(' ')

  const games = idx.games
    .map((g) => {
      let sc = 0
      for (const t of toks) { const w = wordScore(t, g.key); if (!w) { sc = 0; break } sc += w }
      if (g.key === phrase) sc += 20
      return { g, sc: sc ? sc * 10 + Math.log10(g.viewers + 10) : 0 }
    })
    .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 4).map((x) => x.g as GameHit)

  const planets = idx.planets.filter((p) => toks.every((t) => wordScore(t, norm(p.name)) > 0 || (t.length > 2 && norm(GROUPS[p.planet].id).startsWith(t)))).slice(0, 2)

  const people: { h: StreamerHit; sc: number }[] = []
  for (const r of idx.streamers) {
    let sc = 0
    for (const t of toks) {
      const w = Math.max(wordScore(t, r.login) * 3, wordScore(t, r.name) * 3, wordScore(t, r.game) * 1.5, wordScore(t, r.title))
      if (!w) { sc = 0; break }
      sc += w
    }
    if (sc) people.push({ h: { kind: 'streamer', stream: r.s, planet: r.planet, game: r.s.game }, sc: sc * 10 + r.w })
  }
  people.sort((a, b) => b.sc - a.sc)
  return [...games, ...planets, ...people.slice(0, 7).map((p) => p.h)]
}

/** Where a search result should take us: set by the search bar, taken by the world once it is on screen. */
export type Goto = { planet: number; game?: string; login?: string }
let pending: Goto | null = null
const waiting = new Set<() => void>()
export const setGoto = (g: Goto) => { pending = g; waiting.forEach((f) => f()) }
export const takeGoto = () => { const g = pending; pending = null; return g }
export const onGoto = (f: () => void) => { waiting.add(f); return () => { waiting.delete(f) } }
