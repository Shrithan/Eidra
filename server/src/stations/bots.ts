import {
  steerToward,
  type Box,
} from "../../../shared/stations/world3d/runtime/index.js";
import type { GameDef } from "../../../shared/stations/model.d.ts";
import { record, finite, mulberry32 } from "./engines/common.js";
export function botInput(
  def: GameDef,
  snapshot: unknown,
  id: string,
  seed: number,
): unknown {
  const s = record(snapshot);
  if (!s) return {};
  const rng = mulberry32(seed);
  if (def.space === "3d") {
    const bodies = record(s.bodies) ?? {},
      body = record(bodies[id]);
    if (!body) return {};
    const level = record(s.level),
      waypoints = Array.isArray(level?.waypoints)
        ? level.waypoints.map(record)
        : [];
    let target: Record<string, unknown> | undefined;
    if (def.engine === "track")
      target =
        waypoints[
          Math.min(
            waypoints.length - 1,
            Number(body.progress ?? 0) % waypoints.length,
          )
        ];
    else if (def.id === "horror.lights-out" && s.monster !== id) {
      target =
        (Array.isArray(level?.pickups) ? level.pickups.map(record) : []).find(
          (p) => p?.active && p.kind === "fuse",
        ) ?? record(level?.exit);
    } else {
      const candidates = Object.entries({
        ...bodies,
        ...(record(s.npcs) ?? {}),
      }).filter(
        ([key, v]) =>
          key !== id &&
          record(v)?.alive &&
          (def.id === "shooter.last-drop" ||
            def.id === "horror.lights-out" ||
            record(v)?.team !== body.team),
      );
      target = candidates
        .map(([, v]) => record(v))
        .sort(
          (a, b) =>
            Math.hypot(
              Number(a?.x) - Number(body.x),
              Number(a?.z) - Number(body.z),
            ) -
            Math.hypot(
              Number(b?.x) - Number(body.x),
              Number(b?.z) - Number(body.z),
            ),
        )[0];
    }
    if (def.id === "creative.paint-wars" && Array.isArray(level?.boxes))
      target = record(level.boxes[Math.floor(seed / 100) % level.boxes.length]);
    target ??= waypoints[(seed >>> 0) % Math.max(1, waypoints.length)];
    const dx = Number(target?.x ?? 0) - Number(body.x),
      dz = Number(target?.z ?? 0) - Number(body.z),
      dy = Number(target?.y ?? body.y) - Number(body.y),
      distance = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz) + (rng() - 0.5) * 0.04;
    const direction =
      def.engine === "track"
        ? { x: dx / Math.max(1, distance), z: dz / Math.max(1, distance) }
        : steerToward(
            { x: Number(body.x), y: Number(body.y), z: Number(body.z) },
            {
              x: Number(target?.x ?? 0),
              y: Number(target?.y ?? 0),
              z: Number(target?.z ?? 0),
            },
            (level?.boxes ?? []) as Box[],
          );
    const localX = direction.x * Math.cos(yaw) - direction.z * Math.sin(yaw),
      localZ = -direction.x * Math.sin(yaw) - direction.z * Math.cos(yaw);
    return {
      seq: Number(body.seq ?? -1) + 1,
      dt: 0.05,
      move: distance > 1 ? [localX, localZ] : [0, 0],
      yaw,
      pitch: Math.atan2(dy - 0.5, Math.max(1, distance)),
      jump: !!body.grounded && (dy > 0.35 || rng() < 0.06),
      sprint: true,
      primary: distance < 55,
      secondary: rng() < 0.02,
      interact: true,
    };
  }
  if (def.id === "horror.dont-blink")
    return { hold: Math.floor(Number(s.elapsed)) % 4 !== 3 };
  switch (def.engine) {
    case "arena": {
      const fighters = record(s.fighters),
        me = record(fighters?.[id]);
      const target = Object.entries(fighters ?? {})
        .filter(([key]) => key !== id)
        .map(([, p]) => record(p))
        .find((p) => p?.alive);
      const x = finite(me?.x) ? me.x : 0,
        z = finite(me?.z) ? me.z : 0;
      const angle =
        target && finite(target.x) && finite(target.z)
          ? Math.atan2(target.z - z, target.x - x)
          : rng() * Math.PI * 2;
      return {
        move: [Math.cos(angle) * 0.6, Math.sin(angle) * 0.6],
        aim: angle,
        attack: true,
        dash: rng() < 0.1,
      };
    }
    case "pool": {
      if (s.turn !== id || s.moving) return {};
      const balls = Array.isArray(s.balls) ? s.balls.map(record) : [],
        cue = balls[0],
        mine = record(s.groups)?.[id];
      const targets = balls
        .map((b, n) => ({ b, n }))
        .filter(
          ({ b, n }) =>
            n > 0 &&
            b &&
            !b.out &&
            (!mine || (mine === "solid" ? n < 8 : n > 8)) &&
            (mine || n !== 8),
        )
        .sort(
          (p, q) =>
            Math.hypot(
              Number(p.b!.x) - Number(cue?.x),
              Number(p.b!.y) - Number(cue?.y),
            ) -
            Math.hypot(
              Number(q.b!.x) - Number(cue?.x),
              Number(q.b!.y) - Number(cue?.y),
            ),
        );
      const t = targets[0]?.b ?? balls[8];
      const angle =
        Math.atan2(
          Number(t?.y) - Number(cue?.y),
          Number(t?.x) - Number(cue?.x),
        ) +
        (rng() - 0.5) * 0.12;
      return { angle, power: 0.35 + rng() * 0.4 };
    }
    case "track":
      return {
        steer: Math.sin(seed * 0.05) * 0.4,
        throttle: 1,
        jump: rng() < 0.3,
        boost: rng() < 0.1,
      };
    case "pulse": {
      const cues = Array.isArray(s.cues) ? s.cues.map(record) : [];
      const now = finite(s.serverTime) ? s.serverTime : 0;
      const cue = cues.find(
        (c) => c && finite(c.at) && now >= c.at && now - c.at < 200,
      );
      return cue
        ? {
            cue: cue.id,
            t: now,
            choice: cue.answer ?? Math.floor(rng() * 4),
            x: cue.x,
            y: cue.y,
            hold: true,
          }
        : {};
    }
    case "table": {
      const legal = Array.isArray(s.legal) ? s.legal : [];
      if (def.id === "chat.emote-charades") {
        const mapping: Record<string, number> = {
          rainbow: 3,
          "pizza party": 4,
          "sleepy cat": 2,
          "space station": 6,
          "fishing boat": 7,
          "haunted house": 8,
          "snow day": 9,
          "birthday cake": 10,
          "camp fire": 0,
          "rock concert": 5,
          "garden gnome": 0,
          "treasure island": 11,
        };
        if (typeof s.phrase === "string")
          return { action: "emote", choice: mapping[s.phrase] ?? 0 };
        const emotes = Array.isArray(s.emotes) ? s.emotes : [];
        const phrase = Object.entries(mapping).find(([, index]) =>
          emotes.includes(
            [
              "😀",
              "😴",
              "🐱",
              "🌈",
              "🍕",
              "🎉",
              "🚀",
              "🎣",
              "👻",
              "❄️",
              "🎂",
              "🏝️",
            ][index],
          ),
        )?.[0];
        if (phrase) return { action: "guess", text: phrase };
      }
      if (def.id === "horror.seance") {
        const clues = Array.isArray(s.clues) ? s.clues : [];
        const known = clues
          .map((value, to) => ({ value, to }))
          .filter((c) => typeof c.value === "number" && c.value >= 0);
        if (s.turn === id && known.length) {
          const c = known[Math.floor(rng() * known.length)];
          return { action: "symbol", to: c.to, choice: c.value };
        }
        return {
          action: "describe",
          text: known
            .map((c) => `cell ${c.to}: ${c.value}`)
            .join(", ")
            .slice(0, 80),
        };
      }

      const move = record(legal[Math.floor(rng() * legal.length)]);
      if (move?.action === "guess") return { action: "guess", text: "rainbow" };
      if (move?.action === "propose")
        return { action: "propose", text: "A new fountain" };
      return move ?? {};
    }
    case "workshop": {
      if (s.stage === "vote") {
        const entries = record(s.entries);
        const others = Object.keys(entries ?? {}).filter((key) => key !== id);
        return { vote: others[0] };
      }
      switch (def.config.entry) {
        case "text":
          return { text: "A tiny adventure under the stars" };
        case "pixels":
          return {
            index: Math.floor(rng() * 1024),
            color: Math.floor(rng() * 16),
          };
        case "blocks":
          return {
            x: Math.floor(rng() * 12),
            y: Math.floor(rng() * 4),
            z: Math.floor(rng() * 12),
            color: Math.floor(rng() * 16),
          };
        case "layout":
          return {
            kind: ["webcam", "chat", "alerts", "goal", "now-playing"][seed % 5],
            x: seed % 16,
            y: seed % 9,
          };
        case "path":
          return { x: rng(), y: rng() };
        case "draft":
          return { unit: Math.floor(rng() * 12) };
        default:
          return { slot: seed % 8, loop: seed % 16 };
      }
    }
    case "siege": {
      const fallen = Object.entries(record(s.down) ?? {}).find(
        ([, until]) => finite(until) && until > Number(s.elapsed),
      );
      if (fallen) return { action: "revive", player: fallen[0] };
      const roles = record(s.assigned),
        role = roles?.[id];
      const enemy = Array.isArray(s.enemies)
        ? s.enemies.map(record).find((e) => !e?.required || e.required === role)
        : undefined;
      const definition = Array.isArray(s.roles)
        ? s.roles.map(record).find((r) => r?.id === role)
        : undefined;
      const buttons = Array.isArray(definition?.buttons)
        ? definition.buttons
        : ["act"];
      const action =
        def.id === "creative.glitch-rescue"
          ? enemy?.rotation
            ? "rotate"
            : "recolour"
          : buttons[0];
      return s.stage === "upgrade"
        ? { upgrade: "power" }
        : {
            action,
            target: enemy?.id,
            position:
              def.id === "rpg.raid-night"
                ? (Number(s.hazard) + 1) % 4
                : seed % 4,
          };
    }
  }
}
