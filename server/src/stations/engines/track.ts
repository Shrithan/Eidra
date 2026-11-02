import {
  base,
  time,
  rank,
  mulberry32,
  number,
  text,
  clamp,
  finite,
  record,
  type BaseState,
  type Engine,
} from "./common.js";
type Runner = {
  id: string;
  distance: number;
  lane: number;
  speed: number;
  life: number;
  energy: number;
  jumpUntil: number;
  boostUntil: number;
  jumpAt: number;
  boostAt: number;
  steer: number;
  throttle: number;
  finished: number | null;
  accuracy: number;
  checkpoint: number;
  items: string[];
  points: number;
  upgrade: number;
  fork: number;
};
export type TrackState = BaseState & {
  runners: Record<string, Runner>;
  course: { at: number; lane: number; kind: string; hit: string[] }[];
  length: number;
  path: { distance: number; x: number; z: number }[];
  chaser: number;
};
export const track: Engine<TrackState, unknown> = {
  init(def, players, seed) {
    const rng = mulberry32(seed),
      length = number(def, "length", 900) * number(def, "laps", 1),
      hazards =
        Array.isArray(def.config.hazards) && def.config.hazards.length
          ? def.config.hazards.map(String)
          : ["gap", "cone"];
    return {
      ...base(def, players),
      length,
      path: Array.from({ length: 33 }, (_, i) => ({
        distance: (i * length) / 32,
        x: Math.sin(i * 0.7 + seed) * 12,
        z: (i * length) / 32,
      })),
      chaser: -30,
      runners: Object.fromEntries(
        players.map((p) => [
          p.id,
          {
            id: p.id,
            distance: 0,
            lane: 0,
            speed: 0,
            life: number(def, "lives", 3),
            energy: 100,
            jumpUntil: 0,
            boostUntil: 0,
            jumpAt: -2,
            boostAt: -5,
            steer: 0,
            throttle: 0,
            finished: null,
            accuracy: 0,
            checkpoint: 0,
            items: [],
            points: 0,
            upgrade: 0,
            fork: 0,
          },
        ]),
      ),
      course: Array.from({ length: Math.floor(length / 18) }, (_, i) => ({
        at: 15 + i * 18,
        lane: Math.floor(rng() * 3) - 1,
        kind:
          i % 5 === 0
            ? Array.isArray(def.config.items) && def.config.items.length
              ? String(def.config.items[i % def.config.items.length])
              : "battery"
            : i % 7 === 0
              ? "boost"
              : def.config.mode === "strafe" && i % 3 === 0
                ? "target"
                : hazards[Math.floor(rng() * hazards.length)],
        hit: [],
      })),
    };
  },
  input(s, id, input) {
    const r = s.runners[id],
      v = record(input);
    if (
      !r ||
      r.finished !== null ||
      r.life <= 0 ||
      !v ||
      !finite(v.steer) ||
      !finite(v.throttle)
    )
      return;
    r.steer = clamp(v.steer, -1, 1);
    r.throttle = clamp(v.throttle, 0, 1);
    if (v.jump === true && s.elapsed - r.jumpAt >= 0.8) {
      r.jumpAt = s.elapsed;
      r.jumpUntil = s.elapsed + 0.65;
    }
    if (
      s.def.id === "strategy.macro-dash" &&
      v.boost === true &&
      r.points >= 10 &&
      s.elapsed - r.boostAt >= 1
    ) {
      r.points -= 10;
      r.upgrade++;
      r.boostAt = s.elapsed;
    }
    if (v.boost === true && s.elapsed - r.boostAt >= 4 && r.energy >= 15) {
      r.boostAt = s.elapsed;
      r.boostUntil = s.elapsed + 1.2;
      r.energy -= 15;
      const item = r.items.shift();
      if (item === "shell") {
        const target = Object.values(s.runners)
          .filter((other) => other.id !== id && other.distance > r.distance)
          .sort((a, b) => a.distance - b.distance)[0];
        if (target) {
          target.speed *= 0.2;
          target.life--;
        }
      }
      if (item === "oil")
        s.course.push({
          at: r.distance - 5,
          lane: Math.round(r.lane),
          kind: "oil-slick",
          hit: [id],
        });
    }
  },
  tick(s, dt) {
    time(s, dt);
    if (s.def.id === "horror.haunted-house-dash")
      s.chaser += dt * (6 + s.elapsed * 0.04);
    for (const r of Object.values(s.runners)) {
      if (r.finished !== null || r.life <= 0) continue;
      const old = r.distance;
      r.lane = clamp(r.lane + r.steer * dt * 2.5, -1, 1);
      r.speed +=
        (r.throttle *
          (text(s.def, "mode", "foot") === "foot" ? 10 + r.upgrade : 18) *
          (r.boostUntil > s.elapsed ? 1.8 : 1) -
          r.speed) *
        Math.min(1, dt * 4);
      r.distance += r.speed * dt;
      if (s.def.id === "strategy.macro-dash") r.points += dt * 3;
      if (
        s.def.id === "sandbox.chaos-cart" &&
        Math.floor(s.elapsed / 10) > r.fork
      ) {
        r.fork = Math.floor(s.elapsed / 10);
        const safe = r.fork % 2 ? -1 : 1;
        if (Math.sign(r.lane) !== safe) {
          r.speed *= 0.4;
          r.energy = Math.max(0, r.energy - 15);
        }
      }
      r.energy = Math.max(
        0,
        r.energy - dt * (s.def.id === "chat.road-trip" ? 1.5 : 0.1),
      );
      const interval = s.length / number(s.def, "checkpoints", 8);
      r.checkpoint = Math.floor(r.distance / interval);
      for (const o of s.course) {
        if (
          o.at < old ||
          o.at > r.distance ||
          o.hit.includes(r.id) ||
          Math.abs(o.lane - r.lane) > 0.4
        )
          continue;
        o.hit.push(r.id);
        if (["battery", "snack"].includes(o.kind)) {
          r.energy = Math.min(100, r.energy + 30);
          continue;
        }
        if (["shell", "oil"].includes(o.kind)) {
          if (r.items.length < 3) r.items.push(o.kind);
          continue;
        }
        if (o.kind === "boost") {
          r.boostUntil = s.elapsed + 1;
          continue;
        }
        if (o.kind === "target") {
          r.accuracy++;
          continue;
        }
        if (r.jumpUntil > s.elapsed) continue;
        r.speed *= 0.3;
        r.life--;
        if (o.kind === "gap" || o.kind === "lava") {
          r.distance = r.checkpoint * interval;
        }
      }
      if (
        !r.energy ||
        (s.def.id === "horror.haunted-house-dash" && r.distance < s.chaser)
      )
        r.life = 0;
      if (r.distance >= s.length) {
        r.distance = s.length;
        r.finished = s.elapsed;
      }
      s.scores[r.id] =
        r.finished !== null
          ? 100000 - r.finished * 100 + r.accuracy * 50
          : r.distance + r.accuracy * 50;
    }
    if (
      Object.values(s.runners).every((r) => r.finished !== null || r.life <= 0)
    )
      s.ended = true;
  },
  done: (s) => s.ended,
  result: (s) => rank(s.scores, "Distance, then finish time"),
  snapshot(s) {
    return {
      engine: "track",
      elapsed: s.elapsed,
      players: s.players,
      scores: s.scores,
      runners: s.runners,
      length: s.length,
      path: s.path,
      chaser: s.chaser,
      course: s.course.map(({ hit, ...o }) => o),
    };
  },
};
