import { StationLayer } from './stations/StationLayer'
import { Wonders } from './sphereWonders'
import { Blimps } from './sphereBlimps'
import { Pins } from './MiniMap'
import { Crowds } from './sphereCrowds'
import { IslandScene } from './sphereIsland'
import { HomePanel } from './HomePanel'
import { HomeCard } from './HomeCard'
import { BOTS } from './net'
import { getHome, subscribeHome, homeStreams, homeCode, homeShard, hashOf, toggleStream, onMyPlanet } from './homePlanet'
import { mapStore } from './sphereMap'
import { Haze } from './sphereHaze'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import './sphere.css'
import { type Stream } from './api'
import { loadAllStreams, onStreams, streamsNow } from './streamStore'
import { onGoto, takeGoto } from './sphereSearch'
import { Countryside, Lots } from './sphereLots'
import { ELITE_VIEWERS } from './sphereHub'
import { Signals, Traffic } from './sphereTraffic'
import { COUNTRY_COLORS, GROUPS, TIERS, frontDir, groupIndex, layoutSphere, layoutSystem, type PlanetData, type SphereLayout } from './sphereLayout'
import { homeTheme } from './sphereThemes'
import { SystemScene } from './sphereSystem'
import { buildRoadNet } from './sphereCity'
import { Atmosphere, Props, Railways, RoadLines, Roads, SkyDome, Water, Waterfalls, hashStr, makeGroundMaterial } from './sphereVisuals'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import BlockyCharacter from './BlockyCharacter'
import type { Appearance } from './Rewards'
import { Animals, Nature } from './sphereNature'
import { Boats, ModelHouses } from './sphereCityModels'
import { Highways } from './sphereHighways'
import { Residents, WorldChat, useWorldPeople, type WorldPeople } from './sphereResidents'

const WALK_SPEED = 7 // m/s
const RUN_SPEED = 22
const GRAVITY = 24
const JUMP_SPEED = 7.6
const ENTER_RADIUS = 26 // how close to a building before you can walk in
const V = THREE.Vector3
const Y = new V(0, 1, 0)

type Mode = 'orbit' | 'travel' | 'walk'

type Props = {
  selected: Stream | null
  onSelect: (s: Stream) => void
  onEnter: (s: Stream) => void
  name?: string
  appearance: Appearance
}

/** Where we are: looking at the whole solar system, or standing on one genre planet. */
type View =
  | { kind: 'system'; from: number | null; fly: number | null }
  | { kind: 'planet'; index: number; entry: THREE.Vector3 | null; nonce?: number; focus?: string | null }
  | { kind: 'island' }

/**
 * All of Twitch as a solar system: every genre is its own planet, every game a country on it, every stream a building.
 * Click a planet to fly down to it, or pick any stream in the list and we take you to its planet.
 */
/** The planet you were standing on when you went into a theatre, so leaving the theatre puts you back there. */
let lastPlanetId: string | null = null

export default function WatchSphere({ selected, onSelect, onEnter, name, appearance }: Props) {
  const [guest] = useState(() => `Guest${Math.floor(Math.random() * 900 + 100)}`)
  const myName = name || guest
  const chatInput = useRef<HTMLInputElement>(null)
  const [basePlanets, setPlanets] = useState<PlanetData[] | null>(null)
  const [home, setHome] = useState(getHome())
  const [homeOpen, setHomeOpen] = useState(false)
  useEffect(() => subscribeHome(() => setHome(getHome())), [])
  // your own planet sits after the nine genre planets, laid out the same way from the streamers you picked
  const planets = useMemo(() => {
    if (!basePlanets) return null
    if (!home) return basePlanets
    const list = homeStreams(home, streamsNow())
    if (!list.length) return basePlanets
    const theme = homeTheme(home.name)
    const layout = layoutSphere(list, 60, theme, 9)
    layout.copyBase = hashOf(homeCode(home)) * 1000
    const group = { id: 'home', name: home.name, color: theme.color, test: /./ }
    return [...basePlanets, { index: basePlanets.length, group, theme, layout }]
  }, [basePlanets, home])
  const visited = useRef(false)
  if (import.meta.env.DEV) (window as unknown as { __planets: unknown }).__planets = planets
  const planetsRef = useRef(planets)
  planetsRef.current = planets
  // deleting your planet while you are on it sends you back to the system
  useEffect(() => {
    if (!planets) return
    setView((v) => (v.kind === 'planet' && !planets[v.index]) || (v.kind === 'system' && v.fly !== null && v.fly >= 0 && !planets[v.fly]) ? { kind: 'system', from: null, fly: null } : v)
  }, [planets])
  const [view, setView] = useState<View>({ kind: 'system', from: null, fly: null })
  const [error, setError] = useState('')
  const [elite, setElite] = useState<Stream[]>([])
  const [mode, setMode] = useState<Mode>('orbit')
  const [nearIdx, setNearIdx] = useState(-1)
  const [missing, setMissing] = useState(false)
  const [warp, setWarp] = useState<string | null>(null)
  const [country, setCountry] = useState<number | null>(null)
  const [islandNear, setIslandNear] = useState<Stream | null>(null)
  const [islandMode, setIslandMode] = useState<'orbit' | 'travel' | 'walk'>('orbit')
  useEffect(() => { setCountry(null) }, [view.kind, view.kind === 'planet' ? view.index : -1])

  useEffect(() => {
    let live = true
    // the busiest page lands first so the world appears quickly; the rest rebuild it with every live streamer
    const lay = () => {
      if (!live || !streamsNow().length) return
      const all = streamsNow()
      // streamers with 3,000+ viewers live on the island at the centre, not on their planets
      setElite(all.filter((s) => s.viewers >= ELITE_VIEWERS).sort((a, b) => b.viewers - a.viewers))
      setPlanets(layoutSystem(all.filter((s) => s.viewers < ELITE_VIEWERS)))
    }
    const off = onStreams(lay)
    loadAllStreams().catch((e) => { if (live) setError(String(e?.message ?? e)) })
    if (streamsNow().length) lay()
    return () => { live = false; off() }
  }, [])

  // the search bar can send us to a planet, or to the country of a game
  useEffect(() => {
    if (!planets) return
    const go = () => {
      const g = takeGoto()
      if (!g) return
      const lay = planets[g.planet].layout
      const t = g.game ? lay.categories.find((c) => c.category === g.game) : null
      const entry = (t ?? lay.groups[0])?.centroid.clone() ?? null
      setView((v) => {
        if (v.kind !== 'planet' || v.index !== g.planet) { setWarp(planets[g.planet].theme.name); setTimeout(() => setWarp(null), 900) }
        return { kind: 'planet', index: g.planet, entry, nonce: (v.kind === 'planet' ? (v.nonce ?? 0) : 0) + 1, focus: t?.category ?? null }
      })
    }
    const off = onGoto(go)
    go()
    return off
  }, [planets])

  useEffect(() => { setMissing(false) }, [selected?.login])
  // opening a friend's invite link takes you straight to their planet
  useEffect(() => {
    if (!planets || !home?.visiting || visited.current || planets.length < 10) return
    visited.current = true
    setView({ kind: 'system', from: null, fly: planets.length - 1 })
    window.dispatchEvent(new CustomEvent('watchsphere:toast', { detail: `Visiting ${home.name}` }))
  }, [planets, home])

  const layout = planets && view.kind === 'planet' ? planets[view.index].layout : null
  // the quest book offers streamers from the planet you are standing on
  const questGroup = planets && view.kind === 'planet' && planets[view.index]?.theme.id !== 'home' ? planets[view.index].index : null
  useEffect(() => { window.dispatchEvent(new CustomEvent('watchsphere:planet', { detail: questGroup })) }, [questGroup])
  const people = useWorldPeople(layout, myName, view.kind === 'planet' ? (planets?.[view.index].theme.id === 'home' && home ? homeShard(home) : planets?.[view.index].theme.id) : view.kind === 'island' ? 'island' : undefined, view.kind === 'island', JSON.stringify(appearance))

  // picking a stream anywhere takes you to the planet it lives on
  const viewRef = useRef(view)
  viewRef.current = view
  const firstView = useRef(true)
  useEffect(() => {
    if (view.kind === 'planet') lastPlanetId = planets?.[view.index]?.theme.id ?? null
    else if (!firstView.current) lastPlanetId = null // you chose to leave the planet; only the first look after a theatre resumes it
    firstView.current = false
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected || !planets) return
    const v = viewRef.current
    if (selected.viewers >= ELITE_VIEWERS) { // the elite live on the island: go to the centre
      if (v.kind !== 'island') setView({ kind: 'system', from: null, fly: -1 })
      return
    }
    if (v.kind === 'island') { setView({ kind: 'system', from: null, fly: groupIndex(selected.game) }); return }
    // coming back from a theatre: land on the planet you left (your own planet, say), not on the streamer's genre planet
    const back = lastPlanetId ? planets.findIndex((p) => p.theme.id === lastPlanetId && p.layout.byLogin.has(selected.login)) : -1
    if (v.kind === 'system' && back >= 0) { setView({ kind: 'planet', index: back, entry: null }); return }
    const pi = groupIndex(selected.game)
    if (v.kind === 'system') setView({ kind: 'system', from: null, fly: pi })
    else if (v.index !== pi && !planets[v.index].layout.byLogin.has(selected.login)) {
      setWarp(planets[pi].theme.name)
      setView({ kind: 'planet', index: pi, entry: null })
      setTimeout(() => setWarp(null), 900)
    }
  }, [selected?.login, planets])

  const goPlanet = (i: number) => {
    if (!planets) return
    // your own planet is not in the solar system: you go straight to it
    if (planets[i].theme.id === 'home') { setView({ kind: 'planet', index: i, entry: new V(0.3, 0.5, 1).normalize() }); return }
    if (view.kind !== 'planet') setView({ kind: 'system', from: null, fly: i })
    else if (view.index !== i) {
      setWarp(planets[i].theme.name)
      setView({ kind: 'planet', index: i, entry: new V(0.3, 0.5, 1).normalize() })
      setTimeout(() => setWarp(null), 900)
    }
  }
  useEffect(() => {
    const toSystem = () => setView((v) => (v.kind === 'planet' ? { kind: 'system', from: planetsRef.current?.[v.index]?.theme.id === 'home' ? null : v.index, fly: null } : v.kind === 'island' ? { kind: 'system', from: null, fly: -1 } : v))
    window.addEventListener('watchsphere:system', toSystem)
    return () => window.removeEventListener('watchsphere:system', toSystem)
  }, [])
  useEffect(() => {
    // T opens the world chat from anywhere
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key.toLowerCase() === 't') { e.preventDefault(); chatInput.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [toastText, setToastText] = useState('')
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const on = (e: Event) => { setToastText(String((e as CustomEvent).detail)); clearTimeout(timer); timer = setTimeout(() => setToastText(''), 2600) }
    window.addEventListener('watchsphere:toast', on)
    return () => { window.removeEventListener('watchsphere:toast', on); clearTimeout(timer) }
  }, [])

  const board = useMemo(() => {
    if (!planets) return null
    const top = (list: Stream[]) => list.slice().sort((a, b) => b.viewers - a.viewers).slice(0, 5)
    if (view.kind === 'island') return { title: 'Central island', sub: `Channels with ${ELITE_VIEWERS.toLocaleString()}+ viewers`, color: '#58e1ff', rows: top(elite) }
    if (view.kind === 'planet') {
      const pl = planets[view.index]
      if (country !== null) {
        const c = pl.layout.countries.find((x) => x.index === country)
        return { title: c?.name ?? 'Country', sub: pl.theme.name, color: c?.color ?? '#fff', rows: top(pl.layout.plots.filter((p) => p.country === country).map((p) => p.stream)) }
      }
      return { title: pl.theme.name, sub: 'Top streamers on this planet', color: pl.theme.color, rows: top([...pl.layout.plots.map((p) => p.stream), ...elite.filter((s) => groupIndex(s.game) === view.index)]) }
    }
    return { title: 'Solar system', sub: 'Top streamers right now', color: '#9146ff', rows: top([...new Map([...elite, ...planets.flatMap((p) => p.layout.plots.map((q) => q.stream))].map((x) => [x.login, x])).values()]) }
  }, [planets, view, country, elite])

  const addToPlanet = (login: string, display: string) => {
    const r = toggleStream(login)
    const msg = r === 'added' ? `${display} added to your planet` : r === 'removed' ? `${display} removed from your planet` : "You're visiting a friend's planet: keep a copy first to edit it"
    window.dispatchEvent(new CustomEvent('watchsphere:toast', { detail: msg }))
  }
  // H adds the streamer whose building you are standing at
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || e.repeat || e.key.toLowerCase() !== 'h') return
      const pl = layout && nearIdx >= 0 ? layout.plots[nearIdx] : null
      if (view.kind === 'island' && islandNear) addToPlanet(islandNear.login, islandNear.displayName)
      else if (pl) addToPlanet(pl.stream.login, pl.stream.displayName)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const near = layout && nearIdx >= 0 ? layout.plots[nearIdx] : null
  const here = planets && view.kind === 'planet' ? planets[view.index] : null
  return (
    <div className="sphere">
      {planets ? (
        <Canvas camera={{ fov: 50, near: 20, far: 700000, position: [0, 24000, 40000] }} dpr={[1, 2]}>
          {view.kind === 'system' ? (
            <SystemScene
              planets={planets}
              from={view.from}
              fly={view.fly}
              onPick={(i) => setView({ kind: 'system', from: null, fly: i })}
              onLand={(i, entry) => setView({ kind: 'planet', index: i, entry })}
              onPickStream={onSelect}
              onPickIsland={() => setView({ kind: 'system', from: null, fly: -2 })}
              onLandIsland={() => setView({ kind: 'island' })}
              elite={elite}
              selectedLogin={selected?.login}
            />
          ) : view.kind === 'island' ? (
            <IslandScene people={people} elite={elite} appearance={appearance} onNear={setIslandNear} onEnter={onEnter} onMode={(m) => setIslandMode(m)} onExit={() => window.dispatchEvent(new Event('watchsphere:system'))} />
          ) : (
            <Scene
              key={`${view.index}:${view.nonce ?? 0}`}
              layout={planets[view.index].layout}
              focus={view.focus ?? null}
              entry={view.entry}
              selected={selected}
              onSelect={onSelect}
              onEnter={onEnter}
              onMode={setMode}
              onNear={setNearIdx}
              onMissing={() => setMissing(true)}
              onCountry={(c) => setCountry((cur) => (cur === c ? null : c))}
              people={people}
              appearance={appearance}
            />
          )}
        </Canvas>
      ) : (
        <div className="sphere-loading">{error ? `Could not load streams: ${error}` : 'Building the solar system…'}</div>
      )}

      {planets && (
        <>
          <div className="sphere-hud">
            {view.kind === 'system' && <span><b>Drag</b> to look around the system · <b>scroll</b> to zoom · <b>click a planet</b> to fly there</span>}
            {view.kind === 'system' && <button onClick={() => setView({ kind: 'system', from: null, fly: -2 })}>Fly to the central island</button>}
            {view.kind === 'island' && islandMode === 'orbit' && <span><b>Central island</b> · drag to spin · scroll to zoom · click the ground or a building to fly down</span>}
            {view.kind === 'island' && islandMode === 'travel' && <span>Flying…</span>}
            {view.kind === 'island' && islandMode === 'walk' && <span><b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>drag</b> to look · <b>O</b> back to orbit</span>}
            {view.kind === 'island' && islandMode !== 'orbit' && <button onClick={() => window.dispatchEvent(new Event('island:orbit'))}>Back to orbit</button>}
            {view.kind === 'island' && <button className="alt" onClick={() => window.dispatchEvent(new Event('watchsphere:system'))}>Solar system</button>}
            {view.kind === 'planet' && mode === 'orbit' && <span><b>{here?.theme.name}</b> · drag to spin · scroll to zoom · click anywhere on land, a building, or pick a stream to fly down</span>}
            {view.kind === 'planet' && mode === 'travel' && <span>Flying…</span>}
            {view.kind === 'planet' && mode === 'walk' && (
              <span><b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>drag</b> to look · <b>O</b> back to orbit</span>
            )}
            {view.kind === 'planet' && mode === 'walk' && <span>Stations · E near a kiosk to play · Esc to leave</span>}
            {view.kind === 'planet' && mode !== 'orbit' && <button onClick={() => window.dispatchEvent(new Event('watchsphere:orbit'))}>Back to orbit</button>}
            {view.kind === 'planet' && <button className="alt" onClick={() => window.dispatchEvent(new Event('watchsphere:system'))}>Solar system</button>}
          </div>
          {view.kind === 'island' && islandMode === 'walk' && islandNear && (
            <div className="sphere-near">
              <b>{islandNear.displayName}</b>
              <span>{islandNear.game} · {islandNear.viewers.toLocaleString()} watching</span>
              <span className="tier">Central island · {ELITE_VIEWERS / 1000}k+ channel</span>
              <button className="near-enter" onClick={() => onEnter(islandNear)}>Enter theatre (E)</button>
              {!home?.visiting && (
                <button className="near-add" onClick={() => addToPlanet(islandNear.login, islandNear.displayName)}>
                  {onMyPlanet(islandNear.login) ? '✓ On my planet · remove (H)' : '+ Add to my planet (H)'}
                </button>
              )}
            </div>
          )}
          {near && view.kind === 'planet' && mode === 'walk' && (
            <div className="sphere-near">
              <b>{near.stream.displayName}</b>
              <span>{near.category} · {near.stream.viewers.toLocaleString()} watching</span>
              <span className="tier">Tier {near.tier + 1} · {TIERS[near.tier].name}</span>
              <button className="near-enter" onClick={() => near && onEnter(near.stream)}>Enter theatre (E)</button>
              {!home?.visiting && (
                <button className="near-add" onClick={() => addToPlanet(near.stream.login, near.stream.displayName)}>
                  {onMyPlanet(near.stream.login) ? '✓ On my planet · remove (H)' : '+ Add to my planet (H)'}
                </button>
              )}
            </div>
          )}
          <div className="sphere-left">
          {board && (
            <div className="board" style={{ borderColor: board.color }}>
              <div className="board-head">
                <b>{board.title}</b>
                {country !== null && <button onClick={() => setCountry(null)} aria-label="Back to planet">✕</button>}
              </div>
              <small>{country !== null ? `Country on ${board.sub}` : board.sub}</small>
              {board.rows.map((s, i) => (
                <button key={s.login} className={selected?.login === s.login ? 'on' : ''} onClick={() => onSelect(s)}>
                  <i>{i + 1}</i><span><b>{s.displayName}</b><em>{s.game}</em></span><small>{s.viewers >= 1000 ? `${(s.viewers / 1000).toFixed(s.viewers >= 10000 ? 0 : 1)}k` : s.viewers}</small>
                </button>
              ))}
              {view.kind === 'planet' && country === null && <small className="board-hint">Click a blimp to see a country's top 5</small>}
            </div>
          )}
          {view.kind === 'planet' && layout && planets?.[view.index]?.theme.id === 'home' && <PlanetSearch streams={layout.plots.map((p) => p.stream)} selectedLogin={selected?.login} onPick={onSelect} />}
          {view.kind === 'planet' && <Pins />}
          </div>
          <HomeCard
            planet={planets.find((p) => p.theme.id === 'home') ?? null}
            name={home?.name}
            count={planets.find((p) => p.theme.id === 'home')?.layout.plots.length}
            visiting={!!home?.visiting}
            onFly={() => { const i = planets.findIndex((p) => p.theme.id === 'home'); if (i >= 0) goPlanet(i) }}
            onEdit={() => setHomeOpen(true)}
          />
          {homeOpen && <HomePanel onClose={() => setHomeOpen(false)} onFly={() => planets && planets.length > 9 && setView({ kind: 'system', from: null, fly: planets.length - 1 })} />}
          {toastText && <div className="sphere-toast">{toastText}</div>}
          {view.kind !== 'system' && <WorldChat world={people} inputRef={chatInput} name={myName} />}
          {missing && <div className="sphere-note">That stream has no building yet (it may have just gone live).</div>}
          {warp && <div className="sphere-warp">Travelling to {warp}…</div>}
          <div className="sphere-right">
          <div className="sphere-legend">
            <div className="sphere-legend-title">Planets · {planets.reduce((n, p) => n + p.layout.plots.length, 0).toLocaleString()} live streams</div>
            {planets.map((p, i) => (
              <button key={p.theme.id} className={here?.index === i ? 'on' : ''} onClick={() => goPlanet(i)}>
                <i style={{ background: p.theme.color }} />{p.theme.name}<small>{p.layout.plots.length.toLocaleString()}</small>
              </button>
            ))}
            <button className={view.kind === 'island' ? 'on' : ''} onClick={() => setView({ kind: 'system', from: null, fly: -2 })}><i style={{ background: '#58e1ff' }} />Central island<small>{elite.length.toLocaleString()}</small></button>
          </div>
          <div className="sphere-tiers">
            <div className="sphere-legend-title">Buildings by viewers</div>
            {TIERS.slice().reverse().map((t, k, arr) => (
              <div key={t.id}>
                <b>{t.name}</b>
                <span>{t.min >= 1000 ? `${t.min.toLocaleString()}+` : k === 0 ? `${t.min}+` : `${t.min}–${(arr[k - 1].min - 1).toLocaleString()}`}</span>
                <small>{planets.reduce((n, p) => n + p.layout.plots.filter((pl) => pl.tier === TIERS.indexOf(t)).length, 0).toLocaleString()}</small>
              </div>
            ))}
            <button className="home-btn" onClick={() => setHomeOpen(true)}>{home ? (home.visiting ? 'Visiting a friend · options' : 'My planet · edit') : '+ Build my own planet'}</button>
          </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// spatial grid: which buildings are close to a point

class Grid {
  private cells = new Map<number, number[]>()
  constructor(private size: number) {}
  private key(ix: number, iy: number, iz: number) { return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512) }
  add(i: number, p: THREE.Vector3) {
    const k = this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size), Math.floor(p.z / this.size))
    const l = this.cells.get(k)
    if (l) l.push(i); else this.cells.set(k, [i])
  }
  within(p: THREE.Vector3, r: number, fn: (i: number) => void) {
    const n = Math.ceil(r / this.size)
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size), cz = Math.floor(p.z / this.size)
    for (let x = cx - n; x <= cx + n; x++) for (let y = cy - n; y <= cy + n; y++) for (let z = cz - n; z <= cz + n; z++) {
      const l = this.cells.get(this.key(x, y, z))
      if (l) for (const i of l) fn(i)
    }
  }
  near(p: THREE.Vector3, fn: (i: number) => void) {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size), cz = Math.floor(p.z / this.size)
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      const l = this.cells.get(this.key(x, y, z))
      if (l) for (const i of l) fn(i)
    }
  }
}

function useGrid(layout: SphereLayout) {
  return useMemo(() => {
    const g = new Grid(layout.spacing * 1.4)
    const p = new V()
    layout.plots.forEach((pl, i) => g.add(i, p.copy(pl.dir).multiplyScalar(layout.R)))
    return g
  }, [layout])
}

// ---------------------------------------------------------------------------------------------------------------------
// the planet, buildings, labels

const COUNTRYSIDE = new THREE.Color('#7db04f'), PAVED = new THREE.Color('#a4a7b3')

function Planet({ layout, grid }: { layout: SphereLayout; grid: Grid }) {
  const material = useMemo(() => makeGroundMaterial(), [])
  const geometry = useMemo(() => {
    const R = layout.R, T = layout.terrain
    // build on shared vertices so each point of land is evaluated once, then split into flat-shaded facets
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(R, layout.detail)
    geo.deleteAttribute('normal')
    geo.deleteAttribute('uv')
    geo = mergeVertices(geo, 1e-3)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const d = new V(), pw = new V()
    const c = new THREE.Color(), nat = new THREE.Color(), tint = new THREE.Color(), cityGround = new THREE.Color()
    const grass = new THREE.Color(layout.theme.palette.grassA)
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize()
      const e = T.elevation(d)
      pos.setXYZ(i, d.x * (R + e), d.y * (R + e), d.z * (R + e))
      T.color(d, e, nat)
      if (e >= 0.4) {
        // the countries are told apart by the coloured haze above them (see Haze), the ground keeps its natural colours;
        // countryside around the huts is greener and the paved centres of the cities greyer
        pw.copy(d).multiplyScalar(R)
        let best = -1, bestD = Infinity
        grid.near(pw, (idx) => {
          const dist = layout.plots[idx].dir.distanceToSquared(d)
          if (dist < bestD) { bestD = dist; best = idx }
        })
        if (best >= 0) {
          const tier = layout.plots[best].tier
          tint.copy(nat)
          if (tier === 0) tint.lerp(COUNTRYSIDE, 0.35)
          else if (tier >= 2) tint.lerp(PAVED, 0.3)
          const peak = e / layout.terrain.scale
          nat.lerp(tint, T.cityMask(d) * (1 - Math.min(1, Math.max(0, (peak - 60) / 40))))
        }
      }
      c.copy(nat)
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const flat = geo.toNonIndexed()
    flat.computeVertexNormals() // one normal per triangle: the low-poly, faceted look
    // one colour per facet too, so every face is a flat patch of colour instead of a gradient
    const col = flat.attributes.color as THREE.BufferAttribute
    const fp = flat.attributes.position as THREE.BufferAttribute, fn = flat.attributes.normal as THREE.BufferAttribute
    const cliff = new THREE.Color('#7b5a43')
    for (let i = 0; i + 2 < col.count; i += 3) {
      let r = (col.getX(i) + col.getX(i + 1) + col.getX(i + 2)) / 3, g = (col.getY(i) + col.getY(i + 1) + col.getY(i + 2)) / 3, b = (col.getZ(i) + col.getZ(i + 1) + col.getZ(i + 2)) / 3
      // steep faces become brown cliff walls (flat tops stay green), like stacked blocks
      const cx = fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2), cy = fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2), cz = fp.getZ(i) + fp.getZ(i + 1) + fp.getZ(i + 2)
      const up = (fn.getX(i) * cx + fn.getY(i) * cy + fn.getZ(i) * cz) / Math.max(1e-6, Math.hypot(cx, cy, cz))
      const hgt = Math.hypot(cx, cy, cz) / 3 - R
      if (hgt > 3.5 && up < 0.9) {
        const k = Math.min(1, (0.9 - up) / 0.12)
        const wall = 0.78 + 0.22 * (1 - Math.min(1, hgt / 120))
        r += (cliff.r * wall - r) * k; g += (cliff.g * wall - g) * k; b += (cliff.b * wall - b) * k
      }
      for (let j = 0; j < 3; j++) col.setXYZ(i + j, r, g, b)
    }
    return flat
  }, [layout, grid])
  return (
    <mesh geometry={geometry}>
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function labelTexture(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const draw = () => {
    const g = c.getContext('2d')!
    g.clearRect(0, 0, 1024, 256)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = 124
    g.font = `700 ${size}px 'Inter', system-ui, sans-serif`
    while (g.measureText(text).width > 960 && size > 40) { size -= 6; g.font = `700 ${size}px 'Inter', system-ui, sans-serif` }
    g.lineJoin = 'round'
    g.lineWidth = 26
    g.strokeStyle = 'rgba(20,12,44,0.9)'
    g.strokeText(text, 512, 132)
    g.fillStyle = color
    g.shadowColor = 'rgba(0,0,0,0.5)'
    g.shadowBlur = 12
    g.fillText(text, 512, 132)
    t.needsUpdate = true
  }
  draw()
  void document.fonts?.load('700 48px Inter').then(draw).catch(() => {})
  return t
}

/** Continent and country names floating over their land. Country names fade in as you get close. */
function Labels({ layout }: { layout: SphereLayout }) {
  const { camera } = useThree()
  const items = useMemo(() => {
    const out: { text: string; color: string; pos: THREE.Vector3; w: number; kind: 'group' | 'cat' }[] = []
    for (const g of layout.groups) out.push({ text: GROUPS[g.group].name, color: '#ffffff', pos: g.centroid.clone().multiplyScalar(layout.R + 330), w: layout.R * 0.55, kind: 'group' })
    return out.map((o) => ({ ...o, texture: labelTexture(o.text, o.color) }))
  }, [layout])
  const refs = useRef<(THREE.Sprite | null)[]>([])
  useFrame(() => {
    items.forEach((it, i) => {
      const s = refs.current[i]
      if (!s) return
      const d = camera.position.distanceTo(it.pos)
      const mat = s.material as THREE.SpriteMaterial
      mat.opacity = it.kind === 'group' ? THREE.MathUtils.clamp((d - layout.R * 0.5) / (layout.R * 0.6), 0, 1) : THREE.MathUtils.clamp((d - layout.R * 0.1) / (layout.R * 0.25), 0, 1)
    })
  })
  return (
    <group>
      {items.map((it, i) => (
        <sprite key={i} ref={(el) => { refs.current[i] = el }} position={it.pos} scale={[it.w, it.w / 4, 1]} raycast={() => null}>
          <spriteMaterial map={it.texture} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

/** Streets are only worth drawing close up; from orbit they just clutter the colours of the countries. */
function NearOnly({ R, children }: { R: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const { camera } = useThree()
  useFrame(() => { if (ref.current) ref.current.visible = camera.position.length() < R * 1.45 })
  return <group ref={ref}>{children}</group>
}

function Stars({ R }: { R: number }) {
  const positions = useMemo(() => {
    const a = new Float32Array(3000 * 3)
    for (let i = 0; i < 3000; i++) {
      const v = new V(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(R * 12)
      a.set([v.x, v.y, v.z], i * 3)
    }
    return a
  }, [R])
  return (
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#ffffff" size={1.8} sizeAttenuation={false} fog={false} />
    </points>
  )
}

/** Light pillars over the pins you dropped on the map, so you can see where you are headed. */
function Markers3D({ layout }: { layout: SphereLayout }) {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump((n) => n + 1); mapStore.listeners.add(l); return () => { mapStore.listeners.delete(l) } }, [])
  const R = layout.R
  return (
    <group>
      {mapStore.markers.map((m) => {
        const d = new V(...m.dir), q = new THREE.Quaternion().setFromUnitVectors(Y, d)
        return (
          <group key={m.id} position={d.clone().multiplyScalar(R + Math.max(0, layout.ground(d)))} quaternion={q}>
            <mesh position={[0, R * 0.06, 0]} raycast={() => null}>
              <cylinderGeometry args={[Math.max(2.5, R * 0.0015), Math.max(2.5, R * 0.0015), R * 0.12, 10, 1, true]} />
              <meshBasicMaterial color="#ff3b5c" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
            <mesh position={[0, R * 0.125, 0]} raycast={() => null}>
              <octahedronGeometry args={[Math.max(18, R * 0.008), 0]} />
              <meshBasicMaterial color="#ff8aa0" toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** A tall pillar of light over the country of a searched game. */
function CountryBeacon({ layout, game }: { layout: SphereLayout; game: string }) {
  const t = layout.categories.find((c) => c.category === game)
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(Y, t?.centroid ?? Y), [t])
  if (!t) return null
  const color = COUNTRY_COLORS[t.country]
  return (
    <mesh position={t.centroid.clone().multiplyScalar(layout.R + layout.R * 0.3)} quaternion={q} raycast={() => null}>
      <cylinderGeometry args={[layout.R * 0.012, layout.R * 0.03, layout.R * 0.6, 14, 1, true]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Beacon({ layout, idx }: { layout: SphereLayout; idx: number }) {
  const p = layout.plots[idx]
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(Y, p.dir), [p])
  return (
    <mesh position={p.dir.clone().multiplyScalar(layout.R + 220)} quaternion={q}>
      <cylinderGeometry args={[2.2, 4.5, 440, 12, 1, true]} />
      <meshBasicMaterial color={[1.4, 0.55, 3]} toneMapped={false} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// the player

type Travel = { t0: number; dur: number; P0: THREE.Vector3; F0: THREE.Vector3; alt0: number; P1: THREE.Vector3; F1: THREE.Vector3 }

function Scene({ layout, focus, entry, selected, onSelect, onEnter, onMode, onNear, onMissing, onCountry, people, appearance }: {
  layout: SphereLayout
  entry: THREE.Vector3 | null
  focus: string | null
  selected: Stream | null
  onSelect: (s: Stream) => void
  onEnter: (s: Stream) => void
  onMode: (m: Mode) => void
  onNear: (i: number) => void
  onMissing: () => void
  onCountry: (country: number) => void
  people: WorldPeople
  appearance: Appearance
}) {
  const { camera, gl, scene } = useThree()
  const skyUp = useRef(new V(0, 1, 0))
  const space = useRef(1)
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const stars = useRef<THREE.Group>(null)
  const net = useMemo(() => (layout.plots.length > 3 ? buildRoadNet(layout) : { verts: [], edges: [], adj: [], cells: [], valid: [], rural: [], ruralVert: [] }), [layout])
  const R = layout.R
  const grid = useGrid(layout)
  useEffect(() => {
    mapStore.layout = layout
    mapStore.load()
    return () => { if (mapStore.layout === layout) mapStore.layout = null }
  }, [layout, grid])
  const [selIdx, setSelIdx] = useState(-1)

  const S = useRef({
    mode: 'orbit' as Mode,
    P: new V(0, 1, 0), F: new V(0, 0, -1), vel: new V(), alt: 0, vy: 0, pitch: -0.25,
    oy: 0.6, op: 0.4, od: R * 2.6,
    keys: {} as Record<string, boolean>, jumpBuf: 0, coyote: 0, phase: 0, walk: 0,
    travel: null as Travel | null, nearIdx: -1, nearAt: 0, locked: false,
  })
  const callbacks = useRef({ onSelect, onEnter, onMode, onNear, onCountry })
  callbacks.current = { onSelect, onEnter, onMode, onNear, onCountry }
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.near = 0.3; cam.far = R * 22; cam.fov = 60
    cam.up.set(0, 1, 0)
    cam.updateProjectionMatrix()
    const s = S.current
    const dir = entry ?? new V(0.3, 0.5, 1).normalize()
    s.oy = Math.atan2(dir.x, dir.z)
    s.op = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
    // arriving at a planet always starts in orbit, looking at it from afar
    s.mode = 'orbit'
    camera.position.copy(dir).multiplyScalar(R * 2.6)
    camera.lookAt(0, 0, 0)
    callbacks.current.onMode('orbit')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // the further out the camera is, the further it keeps its near plane, so surfaces that sit close together stay apart in the depth buffer
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera
    const h = Math.max(0, cam.position.length() - R)
    const near = THREE.MathUtils.clamp(h * 0.06, 0.3, R * 0.4)
    if (Math.abs(near - cam.near) > cam.near * 0.05) { cam.near = near; cam.updateProjectionMatrix() }
  })
  const avatar = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)

  const setMode = (m: Mode) => {
    if (S.current.mode === m) return
    S.current.mode = m
    callbacks.current.onMode(m)
  }

  // temporaries, to avoid allocating every frame
  const t = useMemo(() => ({ a: new V(), b: new V(), c: new V(), right: new V(), want: new V(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4(), pw: new V(), cam: new V(), head: new V() }), [])

  const beginTravel = (P1: THREE.Vector3, F1: THREE.Vector3) => {
    const s = S.current
    let P0: THREE.Vector3, F0: THREE.Vector3, alt0: number
    if (s.mode === 'orbit') {
      P0 = camera.position.clone().normalize()
      alt0 = camera.position.length() - (R + layout.ground(P0))
      F0 = new V().crossVectors(Y, P0)
      if (F0.lengthSq() < 1e-4) F0.set(1, 0, 0)
      F0.normalize()
    } else {
      P0 = s.P.clone(); F0 = s.F.clone(); alt0 = s.alt
    }
    const angle = Math.acos(THREE.MathUtils.clamp(P0.dot(P1), -1, 1))
    s.travel = { t0: performance.now(), dur: Math.min(6, 2.4 + angle * 2.2) * 1000, P0, F0, alt0, P1, F1 }
    s.P.copy(P0); s.F.copy(F0); s.alt = alt0; s.vel.set(0, 0, 0); s.vy = 0; s.pitch = -0.4
    setMode('travel')
  }

  const startTravel = (idx: number) => {
    wonderView.current = false
    const plot = layout.plots[idx]
    // land on the pavement right in front of the door, looking at it
    const door = frontDir(plot)
    let P1 = plot.dir.clone().multiplyScalar(R).addScaledVector(door, plot.footprint / 2 + 9).normalize()
    // never arrive in the water: come in closer to the building if the pavement out front is wet
    for (const back of [6, 3, 0]) {
      if (layout.ground(P1) > 0.8) break
      P1 = plot.dir.clone().multiplyScalar(R).addScaledVector(door, plot.footprint / 2 + back).normalize()
    }
    const F1 = door.clone().negate()
    F1.addScaledVector(P1, -F1.dot(P1)).normalize()
    beginTravel(P1, F1)
  }

  /** Click anywhere on the planet from orbit: drop down there, never into the sea. */
  const pickedAt = useRef(0)
  const wonderView = useRef(false)
  const dropRef = useRef<(x: number, y: number) => void>(() => {})
  /** The point on the planet under a screen position: the first real surface along the ray (ground, a wonder, a building). */
  const pickDir = (cx: number, cy: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), camera)
    const o = ray.ray.origin, d = ray.ray.direction
    let hit: THREE.Vector3 | null = null
    const solid = ray.intersectObjects(scene.children, true).find((h) => {
      const obj = h.object as THREE.Object3D & { isSprite?: boolean; isPoints?: boolean; isLine?: boolean }
      return !obj.isSprite && !obj.isPoints && !obj.isLine && h.point.length() > R * 0.5
    })
    if (solid) hit = solid.point.clone()
    else {
      let r = R
      for (let i = 0; i < 3; i++) {
        const b = o.dot(d), c = o.lengthSq() - r * r, disc = b * b - c
        if (disc < 0) { hit = null; break }
        const tt = -b - Math.sqrt(disc)
        if (tt < 0) { hit = null; break }
        hit = o.clone().addScaledVector(d, tt)
        r = R + layout.ground(hit.clone().normalize())
      }
    }
    return hit ? hit.normalize() : null
  }
  dropRef.current = (cx, cy) => {
    const dir = pickDir(cx, cy)
    if (!dir) { toast('Click on the planet to fly there'); return }
    landRef.current(dir)
  }
  /** Drop a pin on the planet, or lift the one that is already there. */
  const pinAt = (dir: THREE.Vector3) => {
    const near = mapStore.markers.find((m) => new V(...m.dir).angleTo(dir) * R < Math.max(30, camera.position.length() - R) * 0.06)
    if (near) mapStore.remove(near.id)
    else mapStore.add(dir)
  }
  const pinRef = useRef(pinAt)
  pinRef.current = pinAt
  useEffect(() => {
    const canvas = gl.domElement
    const menu = (e: MouseEvent) => {
      e.preventDefault()
      const dir = pickDir(e.clientX, e.clientY)
      if (dir) pinRef.current(dir)
    }
    const key = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || e.repeat) return
      if (e.key.toLowerCase() === 'x' && S.current.mode === 'walk') pinRef.current(S.current.P.clone())
    }
    canvas.addEventListener('contextmenu', menu)
    window.addEventListener('keydown', key)
    return () => { canvas.removeEventListener('contextmenu', menu); window.removeEventListener('keydown', key) }
  }, [gl])
  const toast = (text: string) => window.dispatchEvent(new CustomEvent('watchsphere:toast', { detail: text }))
  /** Fly to a point on the planet (from a click, the map or a marker); water and buildings are stepped around. */
  const landRef = useRef<(dir: THREE.Vector3) => void>(() => {})
  landRef.current = (dir) => {
    const dry = (p: THREE.Vector3) => layout.ground(p) > 0.8
    let P1 = dir.clone().normalize()
    // a click on a wonder takes you to the front of it, a good way back, so you can take the whole thing in
    let faceTo: THREE.Vector3 | null = null
    const site = layout.sites.find((q) => q.dir.angleTo(P1) * R < q.radius)
    if (site) {
      const from = (S.current.mode === 'orbit' ? camera.position : S.current.P).clone().normalize()
      const away = from.clone().addScaledVector(site.dir, -from.dot(site.dir))
      if (away.lengthSq() < 1e-8) away.crossVectors(Y, site.dir)
      away.normalize()
      P1 = site.dir.clone().multiplyScalar(R).addScaledVector(away, site.radius * 3.5).normalize()
      faceTo = site.dir
    }
    if (!dry(P1)) {
      // nearest dry land within ~2 km, else say so
      const e = new V().crossVectors(Y, P1)
      if (e.lengthSq() < 1e-4) e.set(1, 0, 0)
      e.normalize()
      const n = new V().crossVectors(P1, e)
      let found: THREE.Vector3 | null = null
      for (let rad = 25; rad <= 2000 && !found; rad += rad < 400 ? 25 : 100)
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2
          const q = P1.clone().addScaledVector(e, Math.cos(a) * rad / R).addScaledVector(n, Math.sin(a) * rad / R).normalize()
          if (dry(q)) { found = q; break }
        }
      if (!found) { toast("That's open sea. Pick a spot on land."); return }
      P1 = found
    }
    // step off any building
    const pw = P1.clone().multiplyScalar(R)
    for (let pass = 0; pass < 2; pass++)
      grid.near(pw, (i) => {
        const pl = layout.plots[i]
        const c = pl.dir.clone().multiplyScalar(R), off = pw.clone().sub(c), len = off.length(), rad = pl.footprint * 0.62 + 4
        if (len < rad) pw.copy(c).addScaledVector(len > 1e-3 ? off.divideScalar(len) : new V().crossVectors(Y, pl.dir).normalize(), rad)
      })
    P1 = pw.normalize()
    if (!dry(P1)) { toast("Can't land there."); return }
    const s = S.current
    const P0 = s.mode === 'orbit' ? camera.position.clone().normalize() : s.P.clone()
    const F1 = faceTo ? new V().subVectors(faceTo, P1) : new V().subVectors(P1, P0)
    F1.addScaledVector(P1, -F1.dot(P1))
    if (F1.lengthSq() < 1e-8) F1.crossVectors(Y, P1)
    F1.normalize()
    setSelIdx(-1)
    wonderView.current = !!faceTo
    beginTravel(P1, F1)
  }
  useEffect(() => {
    const go = (e: Event) => {
      const d = (e as CustomEvent<number[]>).detail
      if (Array.isArray(d)) landRef.current(new V(d[0], d[1], d[2]))
    }
    window.addEventListener('watchsphere:travel', go)
    return () => window.removeEventListener('watchsphere:travel', go)
  }, [])

  // a stream picked anywhere (list, card, building) flies us there
  useEffect(() => {
    if (!selected) { setSelIdx(-1); return }
    const idx = layout.byLogin.get(selected.login)
    if (idx === undefined) {
      setSelIdx(-1)
      // a stream that lives on another planet is not "missing": we are about to fly there
      if (selected.viewers < ELITE_VIEWERS && GROUPS[groupIndex(selected.game)].id === layout.theme.id) onMissing()
      return
    }
    setSelIdx(idx)
    startTravel(idx)
  }, [selected?.login])

  // ---- input ----
  useEffect(() => {
    const s = S.current
    const canvas = gl.domElement
    const typing = (e: Event) => ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
    const goOrbit = () => {
      s.oy = Math.atan2(s.P.x, s.P.z); s.op = Math.asin(THREE.MathUtils.clamp(s.P.y, -1, 1)) * 0.8; s.od = R * 2.6
      s.travel = null; s.vel.set(0, 0, 0)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      setMode('orbit')
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      const k = e.key.toLowerCase()
      if (s.mode !== 'orbit' && (k === ' ' || k.startsWith('arrow'))) e.preventDefault()
      s.keys[k] = true
      if (e.repeat) return
      if (k === ' ') s.jumpBuf = 0.15
      if (k === 'o') goOrbit()
      if (k === 'e' && s.mode === 'walk' && s.nearIdx >= 0) callbacks.current.onEnter(layout.plots[s.nearIdx].stream)
    }
    const up = (e: KeyboardEvent) => { s.keys[e.key.toLowerCase()] = false }
    const blur = () => { s.keys = {} }
    let drag = false
    let down0 = [0, 0]
    const pd = (e: PointerEvent) => { drag = true; down0 = [e.clientX, e.clientY] }
    const pu = () => { drag = false }
    const pm = (e: PointerEvent) => {
      const looking = (drag && e.buttons) || document.pointerLockElement === canvas
      if (!looking) return
      if (s.mode === 'orbit') {
        s.oy -= e.movementX * 0.005
        s.op = THREE.MathUtils.clamp(s.op + e.movementY * 0.005, -1.45, 1.45)
      } else {
        const k = document.pointerLockElement === canvas ? 0.0022 : 0.005
        t.q.setFromAxisAngle(s.P, -e.movementX * k)
        s.F.applyQuaternion(t.q)
        s.pitch = THREE.MathUtils.clamp(s.pitch - e.movementY * k, -1.2, 1.4)
      }
    }
    const wheel = (e: WheelEvent) => {
      if (s.mode !== 'orbit') return
      e.preventDefault()
      s.od = THREE.MathUtils.clamp(s.od * Math.exp(e.deltaY * 0.001), R * 1.35, R * 7)
    }
    const click = (e: MouseEvent) => {
      if (s.mode === 'orbit') {
        if (Math.hypot(e.clientX - down0[0], e.clientY - down0[1]) > 14) return
        // a building under the cursor handles its own click
        setTimeout(() => { if (performance.now() - pickedAt.current > 200 && s.mode === 'orbit') dropRef.current(e.clientX, e.clientY) }, 40)
        return
      }
      if (s.mode !== 'walk' || document.pointerLockElement === canvas) return
      try { Promise.resolve(canvas.requestPointerLock()).catch(() => {}) } catch { /* drag-to-look still works */ }
    }
    const orbit = () => goOrbit()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointermove', pm)
    window.addEventListener('watchsphere:orbit', orbit)
    canvas.addEventListener('pointerdown', pd)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('click', click)
    if (import.meta.env.DEV) (window as any).__sphere = { S, layout, scene, gl, camera }
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('watchsphere:orbit', orbit)
      canvas.removeEventListener('pointerdown', pd)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('click', click)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [gl, layout])

  /** Walk into a stream building to enter it; keep the player outside buildings while airborne. */
  const resolve = (P: THREE.Vector3, alt: number) => {
    t.pw.copy(P).multiplyScalar(R)
    let entered = false
    for (let pass = 0; pass < 2; pass++) {
      grid.near(t.pw, (i) => {
        if (entered) return
        const pl = layout.plots[i]
        if (alt > pl.height - 0.2) return
        t.a.copy(pl.dir).multiplyScalar(R)
        t.b.copy(t.pw).sub(t.a)
        const rad = pl.footprint * 0.62 + 0.5
        const d = t.b.length()
        if (d < rad) {
          if (d < 1e-4) t.b.crossVectors(pl.dir, Y)
          if (!entered) t.pw.copy(t.a).addScaledVector(t.b.normalize(), rad)
        }
      })
      if (entered) return true
    }
    // the wonders are solid: you can walk around them but not into them
    for (const site of layout.sites) {
      t.a.copy(site.dir).multiplyScalar(R)
      t.b.copy(t.pw).sub(t.a)
      const d = t.b.length(), rad = site.radius * 0.84
      if (d < rad) {
        if (d < 1e-4) t.b.crossVectors(site.dir, Y)
        t.pw.copy(t.a).addScaledVector(t.b.normalize(), rad)
      }
    }
    P.copy(t.pw).normalize()
    return false
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const s = S.current
    const k = s.keys
    s.jumpBuf = Math.max(0, s.jumpBuf - dt)
    // tell the map where you are
    mapStore.player.walking = s.mode !== 'orbit'
    if (s.mode === 'orbit') {
      mapStore.player.dir.copy(camera.position).normalize()
      mapStore.player.fwd.crossVectors(Y, mapStore.player.dir).normalize()
    } else { mapStore.player.dir.copy(s.P); mapStore.player.fwd.copy(s.F) }
    // which way is "up" for the sky, and city haze that only appears once you are down in the streets
    skyUp.current.copy(s.mode === 'orbit' ? camera.position : s.P).normalize()
    const fog = state.scene.fog as THREE.FogExp2 | null
    if (fog) fog.density = THREE.MathUtils.lerp(fog.density, s.mode === 'orbit' ? 0 : 0.0016, 1 - Math.exp(-3 * dt))
    space.current += ((s.mode === 'orbit' ? 1 : 0) - space.current) * (1 - Math.exp(-3 * dt))
    if (stars.current) stars.current.visible = space.current > 0.3
    {
      // it is always a sunny day where you stand: the sun and the sky light follow your "up"
      const up = skyUp.current
      t.a.crossVectors(up, Y)
      if (t.a.lengthSq() < 1e-4) t.a.set(1, 0, 0)
      t.a.normalize()
      t.b.copy(up).multiplyScalar(0.8).addScaledVector(t.a, 0.5)
      if (s.mode !== 'orbit') t.b.addScaledVector(s.F, 0.3)
      if (sun.current) sun.current.position.copy(t.b).normalize().multiplyScalar(R * 4)
      if (hemi.current) hemi.current.position.copy(up)
    }
    if (s.mode !== 'orbit') people.sendMove(s.P, s.F, s.alt)

    if (s.mode === 'orbit') {
      const cp = Math.cos(s.op)
      t.cam.set(cp * Math.sin(s.oy), Math.sin(s.op), cp * Math.cos(s.oy)).multiplyScalar(s.od)
      camera.position.lerp(t.cam, 1 - Math.exp(-6 * dt))
      camera.up.lerp(Y, 1 - Math.exp(-6 * dt)).normalize()
      camera.lookAt(0, 0, 0)
      if (s.nearIdx !== -1) { s.nearIdx = -1; callbacks.current.onNear(-1) }
      if (avatar.current) avatar.current.visible = false
      return
    }

    // ---- flying to a building (fast travel) ----
    if (s.mode === 'travel' && s.travel) {
      const tr = s.travel
      const raw = Math.min(1, (performance.now() - tr.t0) / tr.dur)
      const e = raw * raw * (3 - 2 * raw)
      t.q.setFromUnitVectors(tr.P0, tr.P1)
      t.q2.identity().slerp(t.q, e)
      s.P.copy(tr.P0).applyQuaternion(t.q2)
      s.F.copy(tr.F0).applyQuaternion(t.q2).lerp(tr.F1, e)
      s.F.addScaledVector(s.P, -s.F.dot(s.P)).normalize()
      s.alt = THREE.MathUtils.lerp(tr.alt0, 0, e) + 90 * Math.sin(Math.PI * e)
      s.pitch = THREE.MathUtils.lerp(-0.4, wonderView.current ? 0.2 : -0.25, e)
      s.vel.set(0, 0, 0)
      if (raw >= 1) { s.travel = null; s.alt = 0; s.vy = 0; setMode('walk') }
      s.walk = 0.6
    } else {
      // ---- walking on the sphere ----
      const f = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
      const st = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
      const turn = (k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0)
      if (turn) { t.q.setFromAxisAngle(s.P, turn * 1.8 * dt); s.F.applyQuaternion(t.q) }
      t.right.crossVectors(s.F, s.P).normalize()
      t.want.set(0, 0, 0).addScaledVector(s.F, f).addScaledVector(t.right, st)
      if (t.want.lengthSq() > 0) t.want.normalize().multiplyScalar(k['shift'] ? RUN_SPEED : WALK_SPEED)
      const grounded = s.alt <= 0.001 && s.vy <= 0
      s.coyote = grounded ? 0.1 : s.coyote - dt
      const rate = grounded ? (t.want.lengthSq() > 0 ? 11 : 15) : (t.want.lengthSq() > 0 ? 3.5 : 0.6)
      s.vel.lerp(t.want, 1 - Math.exp(-rate * dt))
      s.vel.addScaledVector(s.P, -s.vel.dot(s.P)) // stay in the ground plane
      const speed = s.vel.length()
      if (speed > 0.05) {
        t.a.copy(s.vel).normalize()
        t.b.crossVectors(s.P, t.a).normalize()
        t.q.setFromAxisAngle(t.b, (speed * dt) / (R + s.alt))
        t.c.copy(s.P).applyQuaternion(t.q) // where we would end up
        if (resolve(t.c, s.alt)) return
        if (layout.ground(t.c) < 0.5) { t.c.copy(s.P); s.vel.multiplyScalar(0.2) } // the sea and the shoreline block the way
        t.q2.setFromUnitVectors(s.P, t.c) // carry our heading and velocity along with us
        s.F.applyQuaternion(t.q2)
        s.vel.applyQuaternion(t.q2)
        s.P.copy(t.c)
      } else if (t.want.lengthSq() === 0) s.vel.set(0, 0, 0)
      s.F.addScaledVector(s.P, -s.F.dot(s.P)).normalize()

      if (s.jumpBuf > 0 && s.coyote > 0) { s.vy = JUMP_SPEED; s.coyote = 0; s.jumpBuf = 0 }
      s.vy -= GRAVITY * dt
      s.alt += s.vy * dt
      if (s.alt <= 0) { s.alt = 0; if (s.vy < 0) s.vy = 0 }
      s.walk += (Math.min(1, speed / 4) - s.walk) * (1 - Math.exp(-10 * dt))
    }

    // ---- avatar ----
    const g = layout.ground(s.P) // height of the land under the player
    const av = avatar.current
    if (av) {
      av.visible = true
      av.position.copy(s.P).multiplyScalar(R + g + s.alt)
      t.right.crossVectors(s.F, s.P).normalize()
      t.m.makeBasis(t.right, s.P, t.a.copy(s.F).negate())
      av.quaternion.setFromRotationMatrix(t.m)
      s.phase += dt * (5 + s.vel.length() * 0.9) * (s.walk > 0.05 ? 1 : 0)
      const swing = Math.sin(s.phase) * 0.8 * s.walk
      const air = s.alt > 0.05
      if (legL.current && legR.current) {
        legL.current.rotation.x = air ? -0.6 : swing
        legR.current.rotation.x = air ? 0.3 : -swing
      }
    }

    // ---- camera: third person, behind and above ----
    let dist = s.mode === 'travel' ? 7 + s.alt * 0.15 : 7
    const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch)
    // looking up swings the camera under your head, so pull it in rather than letting the ground push it up
    if (sp > 0.02) dist = Math.min(dist, Math.max(0.6, (s.alt + 1.7 - 0.5) / sp))
    t.head.copy(s.P).multiplyScalar(R + g + s.alt + 1.7)
    t.cam.copy(t.head).addScaledVector(s.F, -cp * dist).addScaledVector(s.P, -sp * dist)
    const camHeight = t.cam.dot(s.P) - (R + g)
    if (camHeight < 0.5) t.cam.addScaledVector(s.P, 0.5 - camHeight)
    if (avatar.current && s.mode === 'walk') avatar.current.visible = dist > 2.4 // hide yourself when the camera is inside your head
    camera.position.lerp(t.cam, 1 - Math.exp(-14 * dt))
    camera.up.lerp(s.P, 1 - Math.exp(-10 * dt)).normalize()
    camera.lookAt(t.head)

    // ---- which building are we standing next to? (a few times a second) ----
    const now = performance.now()
    if (s.mode === 'walk' && now - s.nearAt > 120) {
      s.nearAt = now
      t.pw.copy(s.P).multiplyScalar(R)
      let best = -1, bestD = ENTER_RADIUS
      grid.near(t.pw, (i) => {
        const pl = layout.plots[i]
        const d = t.a.copy(pl.dir).multiplyScalar(R).distanceTo(t.pw) - pl.footprint * 0.5
        if (d < bestD) { bestD = d; best = i }
      })
      if (best !== s.nearIdx) { s.nearIdx = best; callbacks.current.onNear(best) }
    } else if (s.mode !== 'walk' && s.nearIdx !== -1) {
      s.nearIdx = -1
      callbacks.current.onNear(-1)
    }
  })

  return (
    <>
      <fogExp2 attach="fog" args={[layout.theme.fog, 0]} />
      <ambientLight intensity={layout.theme.sun.intensity > 2 ? 0.85 : 0.6} />
      <directionalLight ref={sun} position={[R * 2, R * 3, R * 1.5]} intensity={layout.theme.sun.intensity} color={layout.theme.sun.color} />
      <hemisphereLight ref={hemi} args={[layout.theme.sky.horizon, layout.theme.palette.grassB, 1.0]} />
      <SkyDome R={R} up={skyUp} space={space} zenith={layout.theme.sky.zenith} horizon={layout.theme.sky.horizon} />
      <group ref={stars}><Stars R={R} /></group>
      <Atmosphere R={R} color={layout.theme.atmosphere} />
      <Planet layout={layout} grid={grid} />
      <Water R={R} color={layout.theme.water} />
      <Nature layout={layout} net={net} />
      <Animals layout={layout} />
      <Boats layout={layout} />
      <Waterfalls layout={layout} />
      <RoadLines net={net} layout={layout} />
      <NearOnly R={R}>
        <Roads net={net} layout={layout} />
        <Highways net={net} layout={layout} />
      </NearOnly>
      <ModelHouses layout={layout} onPick={(i) => { pickedAt.current = performance.now(); callbacks.current.onSelect(layout.plots[i].stream) }} />
      <Props net={net} layout={layout} />
      <Railways R={R} ground={layout.ground} />
      <Residents world={people} layout={layout} self={S} />
      <Labels layout={layout} />
      <Blimps layout={layout} onPick={(c) => { pickedAt.current = performance.now(); callbacks.current.onCountry(c) }} />
      <Haze layout={layout} grid={grid} />
      <Traffic net={net} layout={layout} />
      <Signals net={net} layout={layout} />
      {BOTS && <Crowds layout={layout} within={(p, r, fn) => grid.within(p, r, fn)} near={(p, fn) => grid.near(p, fn)} />}
      <Countryside layout={layout} within={(p, r, fn) => grid.within(p, r, fn)} />
      <StationLayer layout={layout} S={S} />
      <Wonders layout={layout} />
      <Markers3D layout={layout} />
      <Lots layout={layout} near={(p, fn) => grid.near(p, fn)} />
      {focus && <CountryBeacon layout={layout} game={focus} />}
      {selIdx >= 0 && <Beacon layout={layout} idx={selIdx} />}
      <group ref={avatar} visible={false}>
        <PlayerCharacter key={`${appearance.skin}:${appearance.top}:${appearance.bottom}:${appearance.face}:${appearance.hat}:${appearance.chain}`} S={S} appearance={appearance} />
      </group>
    </>
  )
}

/** You: the shared animated blocky character used inside theatres as well. */
function PlayerCharacter({ S, appearance }: { S: React.MutableRefObject<{ alt: number; vel: THREE.Vector3 }>; appearance: Appearance }) {
  return <BlockyCharacter motion={S} appearance={appearance} />
}

/** Search for your favourite streams on your own planet and go straight to them. */
function PlanetSearch({ streams, selectedLogin, onPick }: { streams: Stream[]; selectedLogin?: string; onPick: (s: Stream) => void }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const hits = useMemo(() => (term ? streams.filter((s) => `${s.displayName} ${s.login} ${s.game}`.toLowerCase().includes(term)) : streams).slice(0, term ? 6 : 3), [streams, term])
  return (
    <div className="board planet-search">
      <div className="board-head"><b>Find on my planet</b></div>
      <input className="planet-search-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && hits[0]) onPick(hits[0]) }} placeholder={`Search ${streams.length} streamers…`} aria-label="Search streamers on my planet" />
      {hits.map((s) => (
        <button key={s.login} className={selectedLogin === s.login ? 'on' : ''} onClick={() => onPick(s)}>
          <span><b>{s.displayName}</b><em>{s.game}</em></span><small>{s.viewers >= 1000 ? `${(s.viewers / 1000).toFixed(1)}k` : s.viewers}</small>
        </button>
      ))}
      {!hits.length && <small className="board-hint">Nobody on your planet matches that.</small>}
    </div>
  )
}
