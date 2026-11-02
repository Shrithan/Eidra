import { Gun, Projectiles } from "./Weapons";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  aim,
  raycast,
  reconcile,
  stepBody,
  stepRail,
  stepZip,
  boxAt,
  type Body,
  type Input3D,
  type Level,
  type Box,
} from "@stations/world3d/runtime/index.js";
import { useKeys } from "../engines/useKeys";
import type { ViewProps } from "../engines/util";
type Snapshot3D = {
  space: "3d";
  gameId: string;
  view: string;
  elapsed: number;
  bodies: Record<string, Body>;
  npcs: Record<string, Body>;
  level: Level;
  events: { kind: string; x: number; y: number; z: number }[];
  fuses: number;
  wave: number;
  monster: string;
  players: { id: string; name: string; bot: boolean; color?: string }[];
  serverTick: number;
  safeRadius?: number;
  structures: Record<string, { hp: number; team: number }>;
  patches: Record<string, string>;
};
const mode3d = (id?: string) =>
  id?.endsWith(".zombies") ? "zombies" : id?.endsWith(".duel") ? "duel" : "";
export default function WorldGame(props: ViewProps) {
  const snapshot = props.snapshot as unknown as Snapshot3D;
  const [locked, setLocked] = useState(false),
    [fps, setFps] = useState(0);
  if (!snapshot.level || !snapshot.bodies) return <p>Preparing the world…</p>;
  return (
    <>
      <p>
        WASD move · Shift sprint · Space jump/drift/pump · mouse or U/O/I/K look
        · click/Enter primary · Q secondary · E interact. Click the scene to
        capture the mouse; Esc leaves.
      </p>
      <p>
        {snapshot.view === "first" ? "First person" : "Third person"} · {fps}{" "}
        fps · {locked ? "Mouse captured" : "Click to look around"} ·{" "}
        {mode3d(props.gameId) === "zombies"
          ? `Wave ${snapshot.wave} · ${Object.keys(snapshot.npcs ?? {}).length} zombies left`
          : mode3d(props.gameId) === "duel"
            ? `Kills ${((snapshot as unknown as { kills?: Record<string, number> }).kills ?? {})[props.id] ?? 0}/8`
            : props.gameId === "horror.lights-out"
          ? `Fuses ${snapshot.fuses}/3`
          : props.gameId === "rpg.dungeon-delve"
            ? `Room ${snapshot.wave}/7`
            : ""}
      </p>
      <div className="station-world3d" style={{ position: "relative" }}>
        {snapshot.view === "first" && <div className="station-crosshair" />}
        <Canvas
          shadows
          camera={{ position: [0, 4, 8], fov: 70, near: 0.1, far: 500 }}
        >
          <Suspense fallback={null}>
            <Scene
              {...props}
              snapshot3d={snapshot}
              onLock={setLocked}
              onFps={setFps}
            />
          </Suspense>
        </Canvas>
      </div>
      <p>
        {mode3d(props.gameId) === "zombies"
          ? "Hold the mouse button or Enter to fire. Clear a wave to heal and reload; stay with your squad."
          : mode3d(props.gameId) === "duel"
            ? "First to eight kills wins. Hold the mouse button or Enter to fire; you respawn after a short delay."
            : props.gameId === "strategy.lane-push"
          ? `Team ${(snapshot.bodies[props.id]?.team ?? 0) + 1} · Q shockwave · Shift+Q shield · bases: ${
              snapshot.structures
                ? Object.values(snapshot.structures)
                    .slice(-2)
                    .map((s) => s.hp.toFixed(0))
                    .join(" / ")
                : ""
            }`
          : props.gameId === "horror.lights-out"
            ? snapshot.monster === props.id
              ? "You are the monster. Catch the survivors."
              : "Find three fuses and reach the far exit."
            : props.gameId === "other.rail-rush"
              ? "Hold Space or primary to pump. Use A/D + E at a switch to choose a branch."
              : props.gameId === "rpg.dungeon-delve"
                ? `Role: ${snapshot.bodies[props.id]?.role ?? ""} · Q uses your role ability. E opens chests.`
                : props.gameId === "arcade.kart-dash"
                  ? `Lap ${Math.min(2, (snapshot.bodies[props.id]?.lap ?? 0) + 1)}/2 · Space drifts · Q uses your item.`
                  : ""}
      </p>
      <p>
        Your health:{" "}
        {Math.max(0, snapshot.bodies[props.id]?.hp ?? 0).toFixed(0)} · Armour:{" "}
        {snapshot.bodies[props.id]?.armor.toFixed(0) ?? 0} · Ammo:{" "}
        {snapshot.bodies[props.id]?.ammo ?? 0} · Score:{" "}
        {snapshot.bodies[props.id]?.score.toFixed(0) ?? 0}
      </p>
      <div className="station-actions">
        <button
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("station:action", { detail: "primary" }),
            )
          }
        >
          Primary
        </button>
        <button
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("station:action", { detail: "secondary" }),
            )
          }
        >
          Ability
        </button>
        <button
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("station:action", { detail: "interact" }),
            )
          }
        >
          Interact / collect
        </button>
      </div>
    </>
  );
}
function Scene(
  p: ViewProps & {
    snapshot3d: Snapshot3D;
    onLock: (v: boolean) => void;
    onFps: (v: number) => void;
  },
) {
  const torch = useRef<THREE.SpotLight>(null),
    torchTarget = useMemo(() => new THREE.Object3D(), []);
  const perf = useRef({ frames: 0, time: 0 });
  const { gl, camera } = useThree(),
    keys = useKeys(),
    snapshot = useRef(p.snapshot3d);
  snapshot.current = p.snapshot3d;
  const predicted = useRef<Body | null>(null),
    pending = useRef<Input3D[]>([]),
    sequence = useRef(0),
    look = useRef({ yaw: 0, pitch: 0 }),
    mouse = useRef(false),
    actions = useRef(new Set<string>()),
    last = useRef(performance.now());
  const fireAt = useRef(0),
    shotStamp = useRef(performance.now());
  const remote = useRef<Record<string, Body>>({});
  useEffect(() => {
    shotStamp.current = performance.now();
  }, [p.snapshot3d]);
  useEffect(() => {
    const body = p.snapshot3d.bodies[p.id];
    if (!body) return;
    pending.current = pending.current.filter((input) => input.seq > body.seq);
    sequence.current = Math.max(sequence.current, body.seq + 1);
    predicted.current = reconcile(
      body,
      pending.current,
      p.snapshot3d.level.boxes,
      p.snapshot3d.elapsed,
      p.gameId === "arcade.kart-dash"
        ? body.boost > p.snapshot3d.elapsed
          ? 24
          : 16
        : undefined,
      p.gameId,
      p.snapshot3d.level.waypoints,
    );
    if (!pending.current.length && body.seq < 0)
      look.current = { yaw: body.yaw, pitch: body.pitch };
    last.current = performance.now();
  }, [p.snapshot3d, p.id, p.gameId]);
  useEffect(() => {
    gl.domElement.tabIndex = 0;
    gl.domElement.setAttribute("aria-label", `${p.gameId} 3D game`);
    gl.domElement.focus();
    const click = () => {
        gl.domElement.focus();
        (
          gl.domElement.requestPointerLock() as Promise<void> | undefined
        )?.catch(() => p.onLock(false));
      },
      lock = () => p.onLock(document.pointerLockElement === gl.domElement),
      move = (e: MouseEvent) => {
        if (document.pointerLockElement !== gl.domElement) return;
        look.current.yaw -= e.movementX * 0.0025;
        look.current.pitch = Math.max(
          -1.4,
          Math.min(1.4, look.current.pitch - e.movementY * 0.0025),
        );
      },
      down = (e: MouseEvent) => {
        if (document.pointerLockElement === gl.domElement && e.button === 0)
          mouse.current = true;
      },
      up = () => (mouse.current = false),
      action = (e: Event) =>
        actions.current.add((e as CustomEvent<string>).detail);
    gl.domElement.addEventListener("click", click);
    document.addEventListener("pointerlockchange", lock);
    document.addEventListener("mousemove", move);
    document.addEventListener("mousedown", down);
    document.addEventListener("mouseup", up);
    window.addEventListener("station:action", action);
    const timer = setInterval(() => {
      const b = predicted.current,
        s = snapshot.current;
      if (!b || !b.alive) return;
      const k = keys.current;
      let x =
          Number(k.has("d") || k.has("arrowright")) -
          Number(k.has("a") || k.has("arrowleft")),
        z =
          Number(k.has("w") || k.has("arrowup")) -
          Number(k.has("s") || k.has("arrowdown"));
      const length = Math.max(1, Math.hypot(x, z));
      x /= length;
      z /= length;
      if (k.has("u")) look.current.yaw += 0.1;
      if (k.has("o")) look.current.yaw -= 0.1;
      if (k.has("i"))
        look.current.pitch = Math.min(1.4, look.current.pitch + 0.05);
      if (k.has("k"))
        look.current.pitch = Math.max(-1.4, look.current.pitch - 0.05);
      if (k.has("arrowleft") && k.has("alt")) look.current.yaw += 0.12;
      if (k.has("arrowright") && k.has("alt")) look.current.yaw -= 0.12;
      const input: Input3D = {
        seq: sequence.current++,
        dt: 0.05,
        move: [x, z],
        yaw: look.current.yaw,
        pitch: look.current.pitch,
        jump: k.has(" "),
        sprint: k.has("shift"),
        primary:
          mouse.current ||
          k.has("enter") ||
          k.has("j") ||
          actions.current.has("primary"),
        secondary: k.has("q") || actions.current.has("secondary"),
        interact: k.has("e") || actions.current.has("interact"),
      };
      actions.current.clear();
      if (
        input.primary &&
        b.ammo > 0 &&
        performance.now() - fireAt.current > 140 &&
        /\.(zombies|duel)$/.test(p.gameId ?? "")
      )
        fireAt.current = performance.now();
      pending.current.push(input);
      if (pending.current.length > 120) pending.current.shift();
      p.send(input);
      if (b.zip >= 0) {
        stepZip(b, s.level.waypoints, 0.05);
        b.seq = input.seq;
      } else if (p.gameId === "other.rail-rush")
        stepRail(b, input, s.level.waypoints, 0.05, s.elapsed);
      else
        stepBody(
          b,
          p.gameId === "arcade.kart-dash" ? { ...input, jump: false } : input,
          s.level.boxes,
          0.05,
          s.elapsed,
          p.gameId === "arcade.kart-dash"
            ? b.boost > s.elapsed
              ? 24
              : 16
            : undefined,
        );
    }, 50);
    return () => {
      clearInterval(timer);
      gl.domElement.removeEventListener("click", click);
      document.removeEventListener("pointerlockchange", lock);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mousedown", down);
      document.removeEventListener("mouseup", up);
      window.removeEventListener("station:action", action);
      if (document.pointerLockElement === gl.domElement)
        document.exitPointerLock();
    };
  }, [gl, p.send, p.id, p.gameId]);
  useFrame((_, dt) => {
    perf.current.frames++;
    perf.current.time += dt;
    if (perf.current.time >= 1) {
      p.onFps(Math.round(perf.current.frames / perf.current.time));
      perf.current = { frames: 0, time: 0 };
    }
    const s = snapshot.current,
      b = predicted.current ?? s.bodies[p.id];
    if (!b) return;
    for (const [id, target] of Object.entries({ ...s.bodies, ...s.npcs })) {
      const old = remote.current[id];
      if (!old)
        remote.current[id] = {
          ...target,
          checkpoint: { ...target.checkpoint },
        };
      else {
        const t = 1 - Math.exp(-15 * dt);
        old.x = THREE.MathUtils.lerp(old.x, target.x, t);
        old.y = THREE.MathUtils.lerp(old.y, target.y, t);
        old.z = THREE.MathUtils.lerp(old.z, target.z, t);
        old.yaw = target.yaw;
        old.alive = target.alive;
      }
    }
    const origin = { x: b.x, y: b.y + 1.65, z: b.z };
    const forward = aim(
      look.current.yaw +
        (p.gameId === "other.rail-rush" ? Math.atan2(-b.vx, -b.vz) : 0),
      look.current.pitch,
    );
    if (torch.current) {
      torch.current.position.set(origin.x, origin.y, origin.z);
      torchTarget.position.set(
        origin.x + forward.x * 10,
        origin.y + forward.y * 10,
        origin.z + forward.z * 10,
      );
      torchTarget.updateMatrixWorld();
      torch.current.intensity = b.torch > 0 ? 40 : 0;
    }
    if (s.view === "first") {
      camera.position.set(origin.x, origin.y, origin.z);
      camera.lookAt(
        origin.x + forward.x,
        origin.y + forward.y,
        origin.z + forward.z,
      );
    } else {
      const dir = {
        x: -forward.x,
        y: Math.max(0.15, -forward.y + 0.2),
        z: -forward.z,
      };
      const length = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= length;
      dir.y /= length;
      dir.z /= length;
      const hit = raycast(origin, dir, s.level.boxes, {}, "", 5, s.elapsed);
      const distance = Math.max(0.3, (hit?.distance ?? 5) - 0.2);
      camera.position.lerp(
        new THREE.Vector3(
          origin.x + dir.x * distance,
          origin.y + dir.y * distance,
          origin.z + dir.z * distance,
        ),
        1 - Math.exp(-20 * dt),
      );
      camera.lookAt(
        origin.x + forward.x * 2,
        origin.y + forward.y * 2,
        origin.z + forward.z * 2,
      );
    }
  });
  const s = p.snapshot3d;
  return (
    <>
      <color
        attach="background"
        args={[p.gameId === "horror.lights-out" ? "#03060e" : "#9bcde0"]}
      />
      <ambientLight intensity={p.gameId === "horror.lights-out" ? 0.12 : 1.4} />
      <directionalLight
        position={[20, 40, 10]}
        intensity={p.gameId === "horror.lights-out" ? 0.08 : 1.8}
        castShadow
      />
      {p.gameId === "horror.lights-out" && (
        <>
          <primitive object={torchTarget} />
          <spotLight
            ref={torch}
            target={torchTarget}
            angle={0.6}
            penumbra={0.3}
            distance={22}
            intensity={40}
          />
        </>
      )}
      {p.gameId === "shooter.last-drop" && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[(s.safeRadius ?? 40) - 0.15, s.safeRadius ?? 40, 80]}
          />
          <meshBasicMaterial color="#ff5a5a" side={THREE.DoubleSide} />
        </mesh>
      )}
      {s.patches && <Paint patches={s.patches} mine={p.id} accent={p.accent} />}
      <LevelMesh level={s.level} elapsed={s.elapsed} />
      {/\.(zombies|duel)$/.test(p.gameId ?? "") && (
        <>
          <Projectiles
            shots={(s as unknown as { projectiles?: number[][] }).projectiles ?? []}
            stamp={shotStamp.current}
          />
          {s.view === "first" && s.bodies[p.id]?.alive && (
            <Gun fireAt={fireAt} sleeve={p.accent} />
          )}
        </>
      )}
      {(p.gameId === "arcade.kart-dash" || p.gameId === "other.rail-rush") &&
        Object.keys(s.bodies).map((id) => (
          <Vehicle
            key={`vehicle${id}`}
            rail={p.gameId === "other.rail-rush"}
            body={() => (id === p.id ? predicted.current : remote.current[id])}
            color={id === p.id ? p.accent : "#ffd84d"}
          />
        ))}
      {Object.keys({ ...s.bodies, ...s.npcs }).map((id) => (
        <Avatar
          key={id}
          id={id}
          first={s.view === "first" && id === p.id}
          body={() => (id === p.id ? predicted.current : remote.current[id])}
          label={
            s.players.find((player) => player.id === id)?.name ??
            (id.startsWith("minion")
              ? `Team ${(s.npcs[id]?.team ?? 0) + 1} minion`
              : id.startsWith("zombie")
                ? "Zombie"
                : "Enemy")
          }
          color={
            s.npcs[id]
              ? id.startsWith("zombie")
                ? "#6fa84a"
                : s.npcs[id].team === 0
                ? "#5aa9ff"
                : "#ff6b6b"
              : (s.players.find((player) => player.id === id)?.color ??
                identityColor(
                  s.players.find((player) => player.id === id)?.name ?? id,
                ))
          }
        />
      ))}
      {s.level.pickups
        .filter((item) => item.active)
        .map((item) => (
          <mesh key={item.id} position={[item.x, item.y, item.z]}>
            <boxGeometry args={[0.6, 0.6, 0.6]} />
            <meshStandardMaterial
              color={
                item.kind === "fuse"
                  ? "#ffd84d"
                  : item.kind === "medkit"
                    ? "#ff6b6b"
                    : "#5affb0"
              }
              emissive={item.kind === "fuse" ? "#554400" : "#000000"}
            />
          </mesh>
        ))}
      {s.events.map((e, i) => (
        <mesh key={i} position={[e.x, e.y, e.z]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshBasicMaterial
            color={e.kind === "paint" ? p.accent : "#ffd84d"}
          />
        </mesh>
      ))}
    </>
  );
}
function Avatar({
  id,
  body,
  first,
  color,
  label,
}: {
  label: string;
  id: string;
  body: () => Body | null | undefined;
  first: boolean;
  color: string;
}) {
  const group = useRef<THREE.Group>(null);
  const source = useGLTF("/models/blocky/character-b.glb");
  const model = useMemo(() => {
    const clone = source.scene.clone(true);
    clone.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.material = (node.material as THREE.MeshStandardMaterial).clone();
        if (node.name.toLowerCase().includes("torso")) {
          const material = node.material as THREE.MeshStandardMaterial;
          material.map = null;
          material.color.set(color);
        }
        node.castShadow = true;
      }
    });
    const size = new THREE.Box3()
      .setFromObject(clone)
      .getSize(new THREE.Vector3());
    clone.scale.setScalar(1.8 / Math.max(0.01, size.y));
    clone.rotation.y = Math.PI;
    return clone;
  }, [source.scene, color]);
  useEffect(
    () => () =>
      model.traverse((node) => {
        if (node instanceof THREE.Mesh)
          (node.material as THREE.Material).dispose();
      }),
    [model],
  );
  useFrame(() => {
    const b = body();
    if (!group.current) return;
    group.current.visible = !!b?.alive && !first;
    if (b) {
      group.current.position.set(b.x, b.y, b.z);
      group.current.rotation.y = b.yaw;
    }
  });
  return (
    <group ref={group} name={id}>
      <primitive object={model} />
      {!first && (
        <Html position={[0, 2.1, 0]} center distanceFactor={8}>
          <span className="station-nameplate">{label}</span>
        </Html>
      )}
    </group>
  );
}
function LevelMesh({ level, elapsed }: { level: Level; elapsed: number }) {
  const timeAnchor = useRef({ elapsed, at: performance.now() });
  useEffect(() => {
    timeAnchor.current = { elapsed, at: performance.now() };
  }, [elapsed]);
  const signature = JSON.stringify(level.boxes);
  const geometry = useMemo(() => {
    const pieces = level.boxes.map((b) => {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      if (b.kind === "ramp") {
        const positions = g.getAttribute("position");
        for (let i = 0; i < positions.count; i++)
          if (positions.getY(i) > 0) {
            const t =
              (b.axis === "z"
                ? positions.getZ(i) / b.d
                : positions.getX(i) / b.w) + 0.5;
            positions.setY(i, -b.h / 2 + (b.rise ?? b.h) * t);
          }
        g.computeVertexNormals();
      }
      g.translate(b.x, b.y, b.z);
      const color = new THREE.Color(b.color),
        colors = new Float32Array(g.getAttribute("position").count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const merged = mergeGeometries(pieces, false);
    pieces.forEach((g) => g.dispose());
    return merged;
  }, [signature]);
  const original = useMemo(
    () => new Float32Array(geometry.getAttribute("position").array),
    [geometry],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const positions = geometry.getAttribute("position");
    let index = 0;
    for (const b of level.boxes) {
      if (b.kind === "moving") {
        const moved = boxAt(
          b,
          timeAnchor.current.elapsed +
            (performance.now() - timeAnchor.current.at) / 1000,
        );
        for (let i = index; i < index + 24; i++) {
          positions.setXYZ(
            i,
            original[i * 3] + moved.x - b.x,
            original[i * 3 + 1] + moved.y - b.y,
            original[i * 3 + 2] + moved.z - b.z,
          );
        }
        positions.needsUpdate = true;
      }
      index += 24;
    }
  });
  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  );
}

function Paint({
  patches,
  mine,
  accent,
}: {
  patches: Record<string, string>;
  mine: string;
  accent: string;
}) {
  const geometry = useMemo(() => {
    const pieces = Object.entries(patches).map(([key, owner]) => {
      const parts = key.split(":");
      const normal = parts[1].split(",").map(Number),
        point = parts[2].split(",").map(Number);
      const g = new THREE.PlaneGeometry(0.5, 0.5);
      const n = new THREE.Vector3(...(normal as [number, number, number]));
      g.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          n,
        ),
      );
      g.translate(
        point[0] / 2 + n.x * 0.015,
        point[1] / 2 + n.y * 0.015,
        point[2] / 2 + n.z * 0.015,
      );
      const c = new THREE.Color(owner === mine ? accent : "#5aa9ff");
      const colors = new Float32Array(12);
      for (let i = 0; i < 12; i += 3) {
        colors[i] = c.r;
        colors[i + 1] = c.g;
        colors[i + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return g;
    });
    if (!pieces.length) return null;
    const merged = mergeGeometries(pieces);
    pieces.forEach((g) => g.dispose());
    return merged;
  }, [patches, mine, accent]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  ) : null;
}

function Vehicle({
  body,
  color,
  rail,
}: {
  body: () => Body | null | undefined;
  color: string;
  rail: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const b = body();
    if (group.current && b) {
      group.current.visible = b.alive;
      group.current.position.set(b.x, b.y, b.z);
      group.current.rotation.y = rail ? Math.atan2(-b.vx, -b.vz) : b.yaw;
    }
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.5, 0.45, 2.2]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}:${z}`} position={[x * 0.75, 0.2, z * 0.65]}>
            <boxGeometry args={[0.3, 0.45, 0.55]} />
            <meshStandardMaterial color="#253244" />
          </mesh>
        )),
      )}
      {rail && (
        <mesh position={[0, 1.1, -0.4]}>
          <boxGeometry args={[1.8, 0.15, 0.15]} />
          <meshStandardMaterial color="#c5d4dc" />
        </mesh>
      )}
    </group>
  );
}

function identityColor(name: string) {
  let hash = 2166136261;
  for (const char of name)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ["#a78bfa", "#38bdf8", "#fb7185", "#34d399", "#ffd84d", "#ff9f6b"][
    (hash >>> 0) % 6
  ];
}
