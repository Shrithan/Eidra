import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './geo.css'
import type { Stream } from './api'
import { capacityFor } from './World'

// Cesium loads workers and widget assets from here; web/scripts/copy-cesium.mjs fills it.
;(window as any).CESIUM_BASE_URL = '/cesium'

const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim()
const MAX_THEATRES = 1500 // the busiest streams get a building; the rest stay in the list and search
const NEAR = 1500 // closer than this (metres) a stream is a theatre building, farther it is a pin
const ENTER_RADIUS = 45 // how close you must be to the door to walk in
const WALK_SPEED = 7 // m/s
const RUN_SPEED = 24

type Mode = 'orbit' | 'flying' | 'walk'
type WalkState = {
  pos: Cesium.Cartesian3; camHeading: number; camPitch: number; body: number; t: number; groundAt: number
  h: number // last accepted ground height (metres above the ellipsoid)
  range: number // camera distance behind the player, shortened when a wall is in the way
  probeAt: number // last time the wall/camera probes ran
  wallAhead: boolean
  doorInv: Cesium.Matrix4 // world -> the theatre door's east/north/up frame
}

/** Footprint of the theatre building, from how many people usually watch (same size classes as the 3D hall). */
function buildingSize(viewers: number) {
  const seats = capacityFor(viewers)
  const w = seats <= 12 ? 14 : seats <= 24 ? 20 : seats <= 60 ? 28 : seats <= 128 ? 38 : 50
  return { w, d: w * 0.7, h: 8 + w * 0.15 }
}

type Props = {
  streams: Stream[]
  selected: Stream | null
  onSelect: (s: Stream) => void
  onEnter: (s: Stream) => void
}

/**
 * Earth as a real map (CesiumJS): streams are theatre buildings on the ground at their location.
 * Fast travel flies you to a theatre; once there you can walk around, and walk in through the door.
 * With a Cesium ion token the world is Google's photorealistic 3D tiles, otherwise OpenStreetMap on a flat globe.
 */
export default function GeoWorld({ streams, selected, onSelect, onEnter }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const avatarRef = useRef<Cesium.Entity | null>(null)
  const avatarPos = useRef(new Cesium.Cartesian3()) // moved in place every frame; the entity reads it through callbacks
  const avatarRot = useRef(new Cesium.Quaternion(0, 0, 0, 1))
  const entities = useRef(new Map<string, Cesium.Entity[]>())
  const beacon = useRef<Cesium.Entity | null>(null) // the light beam over the theatre you are heading to
  const byId = useRef(new Map<string, Stream>())
  const walk = useRef<WalkState | null>(null)
  const modeRef = useRef<Mode>('orbit')
  const keys = useRef<Record<string, boolean>>({})
  const lockless = useRef(false)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onEnterRef = useRef(onEnter)
  onEnterRef.current = onEnter
  const nearRef = useRef(false)
  const tilesOn = useRef(false) // Google 3D tiles loaded: sample them for ground height
  const [mode, setModeState] = useState<Mode>('orbit')
  const [near, setNear] = useState(false)
  const [photo, setPhoto] = useState(false)

  const setMode = (m: Mode) => {
    modeRef.current = m
    setModeState(m)
  }

  // ---- viewer setup -------------------------------------------------------------------------------------------
  useEffect(() => {
    const el = host.current!
    if (ION_TOKEN) Cesium.Ion.defaultAccessToken = ION_TOKEN
    const viewer = new Cesium.Viewer(el, {
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, shouldAnimate: true,
      baseLayer: ION_TOKEN
        ? undefined
        : new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/', maximumLevel: 19 })),
      terrain: ION_TOKEN ? Cesium.Terrain.fromWorldTerrain() : undefined,
    })
    viewerRef.current = viewer
    if (import.meta.env.DEV) (window as any).__geo = viewer
    const scene = viewer.scene
    scene.globe.depthTestAgainstTerrain = true
    scene.screenSpaceCameraController.minimumZoomDistance = 150
    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-30, 25, 2.4e7) })
    let destroyed = false

    if (ION_TOKEN) {
      Cesium.createGooglePhotorealistic3DTileset()
        .then((tileset) => {
          if (destroyed) return
          tileset.maximumScreenSpaceError = 6 // default 16: sharper buildings at street level, a little more data
          scene.primitives.add(tileset)
          scene.globe.show = false // the 3D tiles replace the plain globe
          tilesOn.current = true
          setPhoto(true)
        })
        .catch((e) => console.warn('[geo] Google 3D tiles unavailable', e))
    }

    // you, once you are walking
    avatarRef.current = viewer.entities.add({
      id: '__you',
      show: false,
      position: new Cesium.CallbackPositionProperty((_t, result) => Cesium.Cartesian3.clone(avatarPos.current, result), false),
      orientation: new Cesium.CallbackProperty(() => avatarRot.current, false) as unknown as Cesium.Property,
      ellipsoid: { radii: new Cesium.Cartesian3(0.4, 0.4, 0.9), material: Cesium.Color.fromCssColorString('#4d96ff') },
    })

    // click a pin or a building to select it
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
    handler.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      const picked = scene.pick(m.position) as { id?: Cesium.Entity } | undefined
      const id = String(picked?.id?.id ?? '').split(':')[0]
      const stream = byId.current.get(id)
      if (stream) onSelectRef.current(stream)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    // ---- walking ----------------------------------------------------------------------------------------------
    /** First surface of the 3D city along a ray: building mesh only, never our own theatres, pins or avatar. */
    const rayHit = (origin: Cesium.Cartesian3, dir: Cesium.Cartesian3) => {
      const hits = (scene as any).drillPickFromRay(new Cesium.Ray(origin, dir), 6) as { object?: { id?: unknown }; position?: Cesium.Cartesian3 }[]
      for (const h of hits) {
        if (h.object?.id instanceof Cesium.Entity || !h.position) continue
        return h.position
      }
      return undefined
    }

    const groundOf = (c: Cesium.Cartesian3, w?: WalkState) => {
      const carto = Cesium.Cartographic.fromCartesian(c)
      const now = performance.now()
      let h = w ? w.h : (viewer.scene.globe.getHeight(carto) ?? 0)
      if (tilesOn.current && w) {
        // Cast a ray straight down from 3 m above where we stand. Sampling "the highest surface" would put us on rooftops;
        // this finds the street under us, and steps of more than 12 m (holes in half-loaded tiles) are ignored.
        if (now - w.groundAt > 60) {
          w.groundAt = now
          const up = Cesium.Cartesian3.normalize(c, new Cesium.Cartesian3())
          const origin = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, w.h + 3)
          const hit = rayHit(origin, Cesium.Cartesian3.negate(up, new Cesium.Cartesian3()))
          if (hit) {
            const hh = Cesium.Cartographic.fromCartesian(hit).height
            if (Math.abs(hh - w.h) < 12) h = hh
          }
        }
      } else if (!tilesOn.current) {
        h = viewer.scene.globe.getHeight(carto) ?? h
      }
      if (w) w.h = h
      return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, h)
    }

    const tick = () => {
      const w = walk.current
      if (modeRef.current !== 'walk' || !w) return
      const now = performance.now()
      const dt = Math.min(0.1, (now - w.t) / 1000)
      w.t = now
      const k = keys.current
      const f = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
      const s = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
      w.camHeading += ((k['arrowright'] ? 1 : 0) - (k['arrowleft'] ? 1 : 0)) * 1.6 * dt
      if (f || s) {
        const sp = (k['shift'] ? RUN_SPEED : WALK_SPEED) * dt
        const h = w.camHeading // heading runs clockwise from north; east = x, north = y
        let dx = Math.sin(h) * f + Math.cos(h) * s
        let dy = Math.cos(h) * f - Math.sin(h) * s
        const len = Math.hypot(dx, dy) || 1
        dx = (dx / len) * sp
        dy = (dy / len) * sp
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(w.pos)
        if (tilesOn.current && now - w.probeAt > 40) {
          // is a wall right in front of us? probe at chest height along the direction we want to walk
          const dirW = Cesium.Matrix4.multiplyByPointAsVector(enu, new Cesium.Cartesian3(dx, dy, 0), new Cesium.Cartesian3())
          Cesium.Cartesian3.normalize(dirW, dirW)
          const chest = Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(0, 0, 1.2), new Cesium.Cartesian3())
          const hit = rayHit(chest, dirW)
          w.wallAhead = !!hit && Cesium.Cartesian3.distance(chest, hit) < 0.9 + sp
          w.probeAt = now
        }
        if (!(tilesOn.current && w.wallAhead)) {
          w.pos = groundOf(Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(dx, dy, 0), new Cesium.Cartesian3()), w)
        }
        w.body = Math.atan2(dx, dy)
      } else {
        w.wallAhead = false
        w.pos = groundOf(w.pos, w) // keep standing on the street even when the tiles refine under us
      }
      const up = Cesium.Cartesian3.normalize(w.pos, new Cesium.Cartesian3())
      const bodyPos = Cesium.Cartesian3.add(w.pos, Cesium.Cartesian3.multiplyByScalar(up, 0.9, new Cesium.Cartesian3()), new Cesium.Cartesian3())
      Cesium.Cartesian3.clone(bodyPos, avatarPos.current)
      Cesium.Transforms.headingPitchRollQuaternion(bodyPos, new Cesium.HeadingPitchRoll(w.body, 0, 0), undefined, undefined, avatarRot.current)
      const head = Cesium.Cartesian3.add(w.pos, Cesium.Cartesian3.multiplyByScalar(up, 1.7, new Cesium.Cartesian3()), new Cesium.Cartesian3())
      if (tilesOn.current && now - w.probeAt > 40) {
        // keep the camera out of buildings: shorten the follow distance when something is between us and it
        const headEnu = Cesium.Transforms.eastNorthUpToFixedFrame(head)
        const cp = Math.cos(w.camPitch), sp2 = Math.sin(w.camPitch)
        const back = new Cesium.Cartesian3(-Math.sin(w.camHeading) * cp, -Math.cos(w.camHeading) * cp, -sp2)
        const dirW = Cesium.Cartesian3.normalize(Cesium.Matrix4.multiplyByPointAsVector(headEnu, back, new Cesium.Cartesian3()), new Cesium.Cartesian3())
        const hit = rayHit(head, dirW)
        const free = hit ? Cesium.Cartesian3.distance(head, hit) - 0.5 : 7
        w.range = Math.max(1.8, Math.min(7, free))
      }
      viewer.camera.lookAt(head, new Cesium.HeadingPitchRange(w.camHeading, w.camPitch, w.range))

      // close enough to the selected theatre to walk in?
      const sel = selectedRef.current
      let isNear = false
      if (sel?.location) {
        const local = Cesium.Matrix4.multiplyByPoint(w.doorInv, w.pos, new Cesium.Cartesian3())
        isNear = Math.hypot(local.x, local.y) < ENTER_RADIUS
      }
      if (isNear !== nearRef.current) {
        nearRef.current = isNear
        setNear(isNear)
      }
    }
    viewer.clock.onTick.addEventListener(tick)

    // ---- input ------------------------------------------------------------------------------------------------
    const canvas = scene.canvas
    const typing = (e: Event) => ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    const goOrbit = () => {
      stopWalk()
      setMode('flying')
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-30, 25, 2.4e7),
        duration: 3,
        complete: () => setMode('orbit'),
      })
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e) || modeRef.current !== 'walk') return
      const key = e.key.toLowerCase()
      if (key.startsWith('arrow') || key === ' ') e.preventDefault()
      keys.current[key] = true
      if (key === 'e' && nearRef.current && selectedRef.current) onEnterRef.current(selectedRef.current)
      if (key === 'o') goOrbit()
    }
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false }
    const blur = () => { keys.current = {} }
    let dragging = false
    const pd = () => { dragging = true }
    const pu = () => { dragging = false }
    const pm = (e: PointerEvent) => {
      const w = walk.current
      if (modeRef.current !== 'walk' || !w) return
      if (!(dragging && e.buttons) && document.pointerLockElement !== canvas) return
      const k = document.pointerLockElement === canvas ? 0.0022 : 0.005
      w.camHeading += e.movementX * k
      w.camPitch = Math.max(-1.3, Math.min(0.35, w.camPitch - e.movementY * k))
    }
    const click = () => {
      if (modeRef.current !== 'walk' || lockless.current) return
      try { Promise.resolve(canvas.requestPointerLock()).catch(() => { lockless.current = true }) } catch { lockless.current = true }
    }
    const perr = () => { lockless.current = true }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    canvas.addEventListener('pointerdown', pd)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointermove', pm)
    canvas.addEventListener('click', click)
    document.addEventListener('pointerlockerror', perr)
    ;(viewer as any).__goOrbit = goOrbit

    // entering walk mode, and leaving it
    const stopWalk = () => {
      walk.current = null
      keys.current = {}
      avatarRef.current!.show = false
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
      scene.screenSpaceCameraController.enableInputs = true
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      nearRef.current = false
      setNear(false)
    }
    ;(viewer as any).__stopWalk = stopWalk
    ;(viewer as any).__startWalk = (target: Cesium.Cartesian3, spot?: Cesium.Cartesian3) => {
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target)
      const doorInv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4())
      // default: about 38 m south of the theatre; with 3D tiles we are given a spot on the street instead
      const start = spot ?? Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(0, -38, 0), new Cesium.Cartesian3())
      const local = Cesium.Matrix4.multiplyByPoint(doorInv, start, new Cesium.Cartesian3())
      const toward = Math.atan2(-local.x, -local.y) // heading from the start spot to the theatre
      const w: WalkState = {
        pos: start, camHeading: toward, camPitch: -0.25, body: toward, t: performance.now(), groundAt: 0,
        h: Cesium.Cartographic.fromCartesian(start).height, range: 7, probeAt: 0, wallAhead: false, doorInv,
      }
      w.pos = groundOf(start, w)
      walk.current = w
      avatarRef.current!.show = true
      scene.screenSpaceCameraController.enableInputs = false
      setMode('walk')
    }

    return () => {
      destroyed = true
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      canvas.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointermove', pm)
      canvas.removeEventListener('click', click)
      document.removeEventListener('pointerlockerror', perr)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
      entities.current.clear()
    }
  }, [])

  // ---- theatres on the map ---------------------------------------------------------------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const wanted = streams
      .filter((s) => s.location)
      .sort((a, b) => b.viewers - a.viewers)
      .slice(0, MAX_THEATRES)
    byId.current = new Map(wanted.map((s) => [s.id, s]))
    const keep = new Set(wanted.map((s) => s.id))
    for (const [id, list] of entities.current) {
      if (!keep.has(id)) {
        list.forEach((e) => viewer.entities.remove(e))
        entities.current.delete(id)
      }
    }
    const far = new Cesium.DistanceDisplayCondition(NEAR, Number.MAX_VALUE)
    const close = new Cesium.DistanceDisplayCondition(0, NEAR)
    for (const s of wanted) {
      if (entities.current.has(s.id)) continue
      const { lat, lng } = s.location!
      const { w, d, h } = buildingSize(s.viewers)
      const base = Cesium.Cartesian3.fromDegrees(lng, lat, 0)
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(base)
      const at = (x: number, y: number, z: number) => Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(x, y, z), new Cesium.Cartesian3())
      const purple = Cesium.Color.fromCssColorString('#9146ff')
      const pin = viewer.entities.add({
        id: s.id,
        position: base,
        point: {
          pixelSize: 9, color: purple, outlineColor: Cesium.Color.WHITE, outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: far, disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.displayName, font: '600 14px system-ui, sans-serif', showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#16101fcc'), pixelOffset: new Cesium.Cartesian2(0, -18),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 60000), disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      const building = viewer.entities.add({
        id: `${s.id}:building`,
        position: at(0, 0, h / 2),
        box: {
          dimensions: new Cesium.Cartesian3(w, d, h),
          material: Cesium.Color.fromCssColorString('#2b1f45'),
          outline: true, outlineColor: purple,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          distanceDisplayCondition: close,
        },
      })
      const door = viewer.entities.add({
        id: `${s.id}:door`,
        position: at(0, -d / 2 - 0.1, 2.2),
        box: {
          dimensions: new Cesium.Cartesian3(3.4, 0.4, 4.4),
          material: purple,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          distanceDisplayCondition: close,
        },
      })
      entities.current.set(s.id, [pin, building, door])
    }
  }, [streams])

  // ---- fast travel -----------------------------------------------------------------------------------------------
  const travelId = useRef(0)
  useEffect(() => {
    const viewer = viewerRef.current as (Cesium.Viewer & { __startWalk?: (c: Cesium.Cartesian3, spot?: Cesium.Cartesian3) => void; __stopWalk?: () => void }) | null
    if (!viewer || !selected?.location) return
    const { lng, lat } = selected.location
    const id = ++travelId.current
    const flat = Cesium.Cartesian3.fromDegrees(lng, lat, 0)
    viewer.__stopWalk?.()
    setMode('flying')

    // second leg: once the city around the theatre has loaded we know the real ground height, then land at street level
    const land = async () => {
      const here = Cesium.Cartographic.fromDegrees(lng, lat)
      let h = viewer.scene.globe.getHeight(here) ?? 0
      let spot: Cesium.Cartesian3 | undefined
      if (tilesOn.current && viewer.scene.sampleHeightSupported) {
        try {
          // the tiles only give "the highest surface" at a point, so look at a ring of points around the theatre and
          // stand on the lowest one: that is the street (or a plaza), not a roof
          const enuFlat = Cesium.Transforms.eastNorthUpToFixedFrame(flat)
          const ring = Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2
            const p = Cesium.Matrix4.multiplyByPoint(enuFlat, new Cesium.Cartesian3(Math.sin(a) * 38, Math.cos(a) * 38, 0), new Cesium.Cartesian3())
            return Cesium.Cartographic.fromCartesian(p)
          })
          const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
          const [c0, ...rest] = await Promise.race([viewer.scene.sampleHeightMostDetailed([here, ...ring]), timeout])
          if (c0?.height !== undefined && Number.isFinite(c0.height)) h = c0.height
          const lowest = rest
            .filter((c): c is Cesium.Cartographic => !!c && Number.isFinite(c.height))
            .sort((a, b) => a.height - b.height)[0]
          if (lowest) spot = Cesium.Cartographic.toCartesian(lowest)
        } catch { /* keep the fallback height */ }
      }
      if (id !== travelId.current) return // another trip started meanwhile
      const ground = Cesium.Cartesian3.fromDegrees(lng, lat, h)
      const standAt = spot ?? ground

      if (tilesOn.current) {
        // Re-seat the theatre on the street (not on whatever roof is at its coordinates) and add a tall beam so it is easy to spot
        const streetH = spot ? Cesium.Cartographic.fromCartesian(spot).height : h
        const enuB = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(lng, lat, streetH))
        const at = (x: number, y: number, z: number) => Cesium.Matrix4.multiplyByPoint(enuB, new Cesium.Cartesian3(x, y, z), new Cesium.Cartesian3())
        const { d, h: bh } = buildingSize(selected.viewers)
        const list = entities.current.get(selected.id)
        if (list) {
          const [, building, door] = list
          building.position = new Cesium.ConstantPositionProperty(at(0, 0, bh / 2))
          door.position = new Cesium.ConstantPositionProperty(at(0, -d / 2 - 0.1, 2.2))
          for (const e of [building, door]) if (e.box) e.box.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE)
        }
        if (beacon.current) viewer.entities.remove(beacon.current)
        beacon.current = viewer.entities.add({
          id: `${selected.id}:beacon`,
          position: at(0, 0, 150),
          cylinder: {
            length: 300, topRadius: 1.5, bottomRadius: 3,
            material: Cesium.Color.fromCssColorString('#9146ff').withAlpha(0.35),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000),
          },
        })
      }
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(standAt, 6), {
        duration: 2.5,
        offset: new Cesium.HeadingPitchRange(0, -0.3, 40),
        complete: () => { if (id === travelId.current) viewer.__startWalk?.(ground, spot) },
      })
    }
    // first leg: a few km above the theatre, which also makes the tiles for that area load
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(flat, 40), {
      duration: 4,
      offset: new Cesium.HeadingPitchRange(0, -0.5, tilesOn.current ? 2500 : 160),
      complete: () => void land(),
    })
  }, [selected?.id])

  return (
    <div className="geo">
      <div className="geo-view" ref={host} />
      <div className="geo-hud">
        {mode === 'orbit' && <span>Pick a stream from the list or click a pin to fast travel there</span>}
        {mode === 'flying' && <span>Traveling…</span>}
        {mode === 'walk' && (
          <span>
            <b>WASD</b> walk · <b>Shift</b> run · <b>drag</b> to look · <b>O</b> back to orbit
            {near ? <> · <b className="geo-enter">Press E to enter the theatre</b></> : ' · walk up to the door to go in'}
          </span>
        )}
        {mode !== 'orbit' && <button onClick={() => (viewerRef.current as any)?.__goOrbit?.()}>Back to orbit</button>}
      </div>
      {!ION_TOKEN && (
        <div className="geo-note">
          Showing OpenStreetMap. Add a free Cesium ion token to <code>web/.env.local</code> as <code>VITE_CESIUM_ION_TOKEN</code> for Google's 3D cities and terrain.
        </div>
      )}
      {photo && <div className="geo-note geo-ok">Google photorealistic 3D tiles on</div>}
    </div>
  )
}
