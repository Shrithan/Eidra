import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type RefObject,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SphereLayout } from "../sphereLayout";
import { placeStations, type Station } from "./placement";
import { StationHUD } from "./StationHUD";
import { buildBlock } from "./blocks";
import { mapStore } from "../sphereMap";
import { useStation } from "./useStation";
import { GAMES } from "@stations/games.js";
import "./stations.css";
type Walker = {
  mode: "orbit" | "walk" | "travel";
  P: THREE.Vector3;
  F: THREE.Vector3;
  vel: THREE.Vector3;
  alt: number;
  keys: Record<string, boolean>;
};
type Occupancy = {
  stationId: string;
  players: number;
  maxPlayers: number;
  phase: string;
  timer: number;
};
export function StationLayer({
  layout,
  S,
}: {
  layout: SphereLayout;
  S: RefObject<Walker>;
}) {
  const setFrameloop = useThree((state) => state.setFrameloop);
  const placement = useMemo(() => {
    const placed = placeStations(layout);
    if (import.meta.env.DEV) (window as unknown as { __stations: Station[] }).__stations = placed.stations;
    mapStore.stations = placed.stations.map((st) => ({ dir: st.dir, color: st.def.theme.accent }));
    return placed;
  }, [layout]);
  const [near, setNear] = useState<Station | null>(null),
    [visible, setVisible] = useState<Station[]>([]),
    [active, setActive] = useState<Station | null>(null),
    [crowds, setCrowds] = useState<Record<string, Occupancy>>({}),
    [best, setBest] = useState<Record<string, string>>({});
  const [art, setArt] = useState<[number, number][]>([]);
  const session = useStation();
  const saved = useRef<{
    mode: Walker["mode"];
    P: THREE.Vector3;
    F: THREE.Vector3;
    alt: number;
  } | null>(null);
  const activeRef = useRef(active),
    nearRef = useRef(near);
  activeRef.current = active;
  nearRef.current = near;
  const restore = useCallback(() => {
    setFrameloop("always");
    const old = saved.current;
    if (old && S.current) {
      S.current.mode = old.mode;
      S.current.P.copy(old.P);
      S.current.F.copy(old.F);
      S.current.alt = old.alt;
      S.current.keys = {};
      S.current.vel.set(0, 0, 0);
    }
    saved.current = null;
  }, [S, setFrameloop]);
  const leave = useCallback(() => {
    session.leave();
    setActive(null);
    restore();
  }, [session.leave, restore]);
  const join = useCallback(
    (station: Station) => {
      if (activeRef.current) return;
      const s = S.current;
      saved.current = {
        mode: s.mode,
        P: s.P.clone(),
        F: s.F.clone(),
        alt: s.alt,
      };
      s.keys = {};
      s.vel.set(0, 0, 0);
      s.mode = "orbit";
      setFrameloop("never");
      if (document.pointerLockElement) document.exitPointerLock();
      setActive(station);
      void session.join(station);
    },
    [S, session.join, setFrameloop],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        leave();
        return;
      }
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement)?.tagName,
      );
      if (typing) return;
      if (activeRef.current) {
        if (
          e.key === "Tab" ||
          (e.key === "Enter" &&
            (e.target as HTMLElement)?.tagName === "BUTTON") ||
          (e.key === " " && (e.target as HTMLElement)?.tagName === "BUTTON")
        )
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        window.dispatchEvent(
          new CustomEvent("station:key", {
            detail: { key: e.key, up: e.type === "keyup", repeat: e.repeat },
          }),
        );
        return;
      }
      if (
        e.type === "keydown" &&
        e.key.toLowerCase() === "e" &&
        nearRef.current
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        join(nearRef.current);
      }
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      restore();
    };
  }, [leave, join, restore]);
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    async function poll() {
      try {
        const r = await fetch(
          `/api/stations/occupancy?planet=${layout.theme.id}`,
          { signal: controller.signal },
        );
        if (!r.ok) return;
        const rows = (await r.json()) as Occupancy[];
        if (!stopped)
          setCrowds(
            Object.fromEntries(rows.map((row) => [row.stationId, row])),
          );
      } catch {
        /* Keep existing signs during a network interruption. */
      }
    }
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [layout.theme.id]);
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    async function scores() {
      const rows = await Promise.all(
        GAMES.filter((g) => g.planet === layout.theme.id).map(async (g) => {
          try {
            const r = await fetch(`/api/stations/leaderboard?game=${g.id}`, {
              signal: controller.signal,
            });
            const rows = r.ok
              ? ((await r.json()) as { name: string; best: number }[])
              : [];
            return [
              g.id,
              rows[0]
                ? `${rows[0].name}: ${rows[0].best.toFixed(0)}`
                : "No weekly score yet",
            ] as const;
          } catch {
            return [g.id, "Weekly scores unavailable"] as const;
          }
        }),
      );
      if (!stopped) setBest(Object.fromEntries(rows));
      if (layout.theme.id === "other")
        try {
          const r = await fetch("/api/stations/art?game=other.map-makers", {
            signal: controller.signal,
          });
          if (r.ok) {
            const data = (await r.json()) as { path: unknown };
            if (!stopped && Array.isArray(data.path))
              setArt(
                data.path
                  .filter(
                    (point: unknown): point is [number, number] =>
                      Array.isArray(point) &&
                      point.length === 2 &&
                      point.every(
                        (v) => typeof v === "number" && Number.isFinite(v),
                      ),
                  )
                  .slice(0, 60),
              );
          }
        } catch {
          /* Keep the last weekly sculpture. */
        }
    }
    void scores();
    const t = setInterval(scores, 30000);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(t);
    };
  }, [layout.theme.id]);
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (activeRef.current) {
      S.current.mode = "orbit";
      S.current.keys = {};
      return;
    }
    clock.current += dt;
    if (clock.current < 0.25) return;
    clock.current = 0;
    const s = S.current;
    const close = placement.stations.filter(
      (st) => st.dir.angleTo(s.P) * layout.R < 150,
    );
    setVisible((old) =>
      old.length === close.length &&
      old.every((st, i) => st.key === close[i].key)
        ? old
        : close,
    );
    let target: Station | null = null,
      dist = 14;
    if (s.mode === "walk")
      for (const station of close) {
        const d = Math.hypot(station.dir.angleTo(s.P) * layout.R, s.alt);
        if (d < dist) {
          target = station;
          dist = d;
        }
      }
    setNear((old) => (old?.key === target?.key ? old : target));
  }, -100);
  const overlay = useRef<Root | null>(null);
  useEffect(() => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    overlay.current = createRoot(host);
    return () => {
      const root = overlay.current;
      overlay.current = null;
      setTimeout(() => {
        root?.unmount();
        host.remove();
      });
    };
  }, []);
  useEffect(() => {
    overlay.current?.render(
      active ? (
        <StationHUD station={active} session={session} onLeave={leave} />
      ) : near ? (
        <div className="station-prompt">
          Press E to play <b>{near.def.name}</b> ·{" "}
          {crowds[near.key]?.players ?? 0}/{near.def.maxPlayers} waiting{" "}
          <button onClick={() => join(near)}>Play</button>
        </div>
      ) : null,
    );
  });
  return (
    <>
      <Blocks stations={placement.stations} />
      <StationPins stations={placement.stations} R={layout.R} ground={layout.ground} />
      {placement.fountains.map((f, i) => (
        <group key={i} position={f.position} quaternion={f.rotation}>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[5, 0.5, 5]} />
            <meshStandardMaterial color="#a8bdcc" />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[3, 0.3, 3]} />
            <meshStandardMaterial color="#5aa9ff" />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[0.7, 2, 0.7]} />
            <meshStandardMaterial color="#d6e9f4" />
          </mesh>
        </group>
      ))}
      {visible.map((station) => (
        <Sign
          key={station.key}
          station={station}
          line={
            crowds[station.key]?.phase === "play"
              ? `Round ${Math.ceil(crowds[station.key].timer)}s`
              : `${crowds[station.key]?.players ?? 0}/${station.def.maxPlayers} waiting`
          }
          best={best[station.def.id] ?? "Loading weekly score…"}
        />
      ))}
      {visible
        .filter((st) => st.def.id === "other.map-makers")
        .map((st) => (
          <Island key={`art:${st.key}`} station={st} path={art} />
        ))}
    </>
  );
}
/** Coloured pins over every game block so the stations can be spotted from orbit. */
function StationPins({ stations, R, ground }: { stations: Station[]; R: number; ground: (d: THREE.Vector3) => number }) {
  const { camera } = useThree();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry(),
      pos = new Float32Array(stations.length * 3),
      col = new Float32Array(stations.length * 3),
      c = new THREE.Color();
    stations.forEach((st, i) => {
      const p = st.dir.clone().multiplyScalar(R + ground(st.dir) + 40);
      pos.set([p.x, p.y, p.z], i * 3);
      c.set(st.def.theme.accent);
      col.set([c.r, c.g, c.b], i * 3);
    });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [stations, R, ground]);
  const mat = useMemo(
    () => new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }),
    [],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(() => {
    mat.opacity = THREE.MathUtils.smoothstep(camera.position.length() - R, R * 0.1, R * 0.5);
  });
  return <points geometry={geo} material={mat} frustumCulled={false} raycast={() => null} />;
}
function Blocks({ stations }: { stations: Station[] }) {
  const groups = useMemo(() => {
    const byGame = new Map<string, Station[]>();
    for (const st of stations) {
      const l = byGame.get(st.def.id);
      if (l) l.push(st);
      else byGame.set(st.def.id, [st]);
    }
    return [...byGame.entries()].map(([id, list]) => ({
      id,
      list,
      geo: buildBlock(list[0].def),
    }));
  }, [stations]);
  useEffect(() => () => groups.forEach((g) => g.geo.dispose()), [groups]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
    });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        "attribute float glow;\nvarying float vGlow;\nvoid main() {\n  vGlow = glow;",
      );
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "varying float vGlow;\nvoid main() {")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * vGlow * 1.4;",
        );
    };
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <>
      {groups.map((g) => (
        <BlockSet key={g.id} geo={g.geo} material={material} list={g.list} />
      ))}
    </>
  );
}
/** All the blocks of one game as a single instanced draw call. */
function BlockSet({
  geo,
  material,
  list,
}: {
  geo: THREE.BufferGeometry;
  material: THREE.Material;
  list: Station[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4(),
      one = new THREE.Vector3(1, 1, 1);
    list.forEach((st, i) => {
      m.compose(st.position, st.rotation, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [list]);
  return (
    <instancedMesh
      ref={ref}
      args={[geo, material, list.length]}
      frustumCulled={false}
    />
  );
}
function Sign({
  station,
  line,
  best,
}: {
  station: Station;
  line: string;
  best: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#142139";
    ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = station.def.theme.accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, 512, 192);
    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.font = "bold 29px system-ui";
    ctx.fillText(station.def.name, 256, 55, 480);
    ctx.font = "24px system-ui";
    ctx.fillText(line, 256, 108, 480);
    ctx.font = "19px system-ui";
    ctx.fillText(best, 256, 154, 480);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [station, line, best]);
  useEffect(() => () => texture.dispose(), [texture]);
  const pos = station.position.clone().addScaledVector(station.dir, 18);
  return (
    <sprite position={pos} scale={[8, 3, 1]}>
      <spriteMaterial map={texture} depthTest />
    </sprite>
  );
}

function Island({
  station,
  path,
}: {
  station: Station;
  path: [number, number][];
}) {
  const shape = useMemo(() => {
    if (path.length < 3) return null;
    const shape = new THREE.Shape();
    path.forEach(([x, y], i) => {
      if (!i) shape.moveTo((x - 0.5) * 2, (y - 0.5) * 2);
      else shape.lineTo((x - 0.5) * 2, (y - 0.5) * 2);
    });
    shape.closePath();
    return shape;
  }, [path]);
  if (!shape) return null;
  return (
    <group position={station.position} quaternion={station.rotation}>
      <mesh position={[0, 4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[shape, { depth: 0.4, bevelEnabled: false }]} />
        <meshStandardMaterial color="#6bdc8b" flatShading />
      </mesh>
    </group>
  );
}
