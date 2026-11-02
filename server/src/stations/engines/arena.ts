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
type Fighter = {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  aim: number;
  hp: number;
  lives: number;
  stamina: number;
  dashAt: number;
  attackAt: number;
  move: [number, number];
  team: number;
  alive: boolean;
  ammo: number;
  armor: number;
  torch: number;
};
type Shot = {
  owner: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  distance: number;
};
export type ArenaState = BaseState & {
  fighters: Record<string, Fighter>;
  shots: Shot[];
  tiles: Record<string, string>;
  broken: Record<string, number>;
  radius: number;
  ball: { x: number; z: number; vx: number; vz: number };
  pickups: { x: number; z: number; kind: string; active: boolean }[];
  towers: { team: number; x: number; z: number; hp: number }[];
  minions: { team: number; x: number; z: number; hp: number }[];
};
export const arena: Engine<ArenaState, unknown> = {
  init(def, players, seed) {
    const rng = mulberry32(seed),
      radius = number(def, "size", 30) / 2;
    return {
      ...base(def, players),
      fighters: Object.fromEntries(
        players.map((p, i) => {
          const a = (i / players.length) * Math.PI * 2;
          return [
            p.id,
            {
              id: p.id,
              x: Math.cos(a) * radius * 0.5,
              z: Math.sin(a) * radius * 0.5,
              vx: 0,
              vz: 0,
              aim: a + Math.PI,
              hp: number(def, "hp", 0) || 100,
              lives: number(def, "lives", 1),
              stamina: 100,
              dashAt: -2,
              attackAt: -2,
              move: [0, 0],
              team: i % 2,
              alive: true,
              ammo: 30,
              armor: 0,
              torch: 100,
            },
          ];
        }),
      ),
      shots: [],
      tiles: {},
      broken: {},
      radius,
      ball: { x: 0, z: 0, vx: 6, vz: 4 },
      pickups: Array.from(
        {
          length: Array.isArray(def.config.pickups)
            ? def.config.pickups.length * 2
            : 0,
        },
        (_, i) => ({
          x: (rng() - 0.5) * radius,
          z: (rng() - 0.5) * radius,
          kind: String(
            (def.config.pickups as string[])[
              i % (def.config.pickups as string[]).length
            ],
          ),
          active: true,
        }),
      ),
      towers:
        def.config.team === "lanes"
          ? Array.from({ length: 8 }, (_, i) => ({
              team: i % 2,
              x: (i % 2 ? 1 : -1) * radius * 0.8,
              z: (Math.floor(i / 2) - 1.5) * radius * 0.4,
              hp: i < 2 ? 60 : 20,
            }))
          : [],
      minions: [],
    };
  },
  input(s, id, input) {
    const f = s.fighters[id],
      v = record(input);
    if (
      !f ||
      !f.alive ||
      !v ||
      !Array.isArray(v.move) ||
      v.move.length !== 2 ||
      !v.move.every(finite) ||
      !finite(v.aim)
    )
      return;
    const m = Math.hypot(v.move[0], v.move[1]);
    f.move = [v.move[0] / Math.max(1, m), v.move[1] / Math.max(1, m)];
    f.aim = clamp(v.aim, -Math.PI * 2, Math.PI * 2);
    if (v.dash === true && s.elapsed - f.dashAt >= 2) {
      f.dashAt = s.elapsed;
      f.vx += Math.cos(f.aim) * 15;
      f.vz += Math.sin(f.aim) * 15;
    }
    if (v.attack !== true || s.elapsed - f.attackAt < 0.4 || f.stamina < 15)
      return;
    f.attackAt = s.elapsed;
    f.stamina -= 15;
    const attack = text(s.def, "attack", "bump");
    if (attack === "shoot") {
      if (f.ammo <= 0) return;
      f.ammo--;
      s.shots.push({
        owner: id,
        x: f.x,
        z: f.z,
        vx: Math.cos(f.aim) * 18,
        vz: Math.sin(f.aim) * 18,
        distance: 0,
      });
      return;
    }
    if (attack === "paint") {
      s.tiles[`${Math.round(f.x)},${Math.round(f.z)}`] = id;
      return;
    }
    for (const other of Object.values(s.fighters)) {
      if (
        other.id === id ||
        !other.alive ||
        Math.hypot(other.x - f.x, other.z - f.z) > 3
      )
        continue;
      if (
        s.def.config.team !== "none" &&
        s.def.config.team &&
        f.team === other.team
      )
        continue;
      const a = Math.atan2(other.z - f.z, other.x - f.x),
        diff = Math.atan2(Math.sin(a - f.aim), Math.cos(a - f.aim));
      if (Math.abs(diff) > 1.4) continue;
      const parry = other.stamina > 50 && s.elapsed - other.attackAt < 0.25;
      other.vx += Math.cos(a) * (parry ? 0 : 14);
      other.vz += Math.sin(a) * (parry ? 0 : 14);
      if (number(s.def, "hp", 0) > 0 && !parry) other.hp -= 20;
      s.scores[id] += parry ? 0 : 10;
    }
  },
  tick(s, dt) {
    time(s, dt);
    const floor = text(s.def, "floor", "solid");
    s.radius =
      (number(s.def, "size", 30) / 2) *
      (floor === "shrink"
        ? Math.max(0.2, 1 - Math.floor(s.elapsed / 15) * 0.12)
        : 1);
    for (const f of Object.values(s.fighters)) {
      if (!f.alive) continue;
      if (s.def.id === "arcade.pong-royale") {
        const angle = Math.atan2(f.z, f.x) + (f.move[0] + f.move[1]) * dt * 2;
        f.x = Math.cos(angle) * s.radius * 0.9;
        f.z = Math.sin(angle) * s.radius * 0.9;
        f.vx = f.vz = 0;
      }
      f.stamina = clamp(f.stamina + dt * 18, 0, 100);
      if (s.def.id !== "arcade.pong-royale") f.x += (f.move[0] * 5 + f.vx) * dt;
      if (s.def.id !== "arcade.pong-royale") f.z += (f.move[1] * 5 + f.vz) * dt;
      f.vx *= Math.exp(-dt * 5);
      f.vz *= Math.exp(-dt * 5);
      const tile = `${Math.round(f.x)},${Math.round(f.z)}`;
      if (floor === "crumble" && s.broken[tile] === undefined)
        s.broken[tile] = s.elapsed + 0.7;
      if (
        floor === "zone" &&
        Math.hypot(
          f.x - Math.sin(s.elapsed * 0.2) * s.radius * 0.4,
          f.z - Math.cos(s.elapsed * 0.2) * s.radius * 0.4,
        ) < 4
      )
        s.scores[f.id] += dt * 10;
      for (const p of s.pickups)
        if (p.active && Math.hypot(p.x - f.x, p.z - f.z) < 1.2) {
          p.active = false;
          if (p.kind === "ammo") f.ammo += 20;
          if (p.kind === "medkit") f.hp = Math.min(100, f.hp + 40);
          if (p.kind === "armor") f.armor = 40;
        }
      const out =
        text(s.def, "shape", "square") === "circle"
          ? Math.hypot(f.x, f.z) > s.radius
          : Math.max(Math.abs(f.x), Math.abs(f.z)) > s.radius;
      const walls = out && floor === "solid" && number(s.def, "hp", 0) > 0;
      if (walls) {
        if (text(s.def, "shape", "square") === "circle") {
          const length = Math.hypot(f.x, f.z);
          f.x *= Math.max(0, s.radius - 0.6) / length;
          f.z *= Math.max(0, s.radius - 0.6) / length;
        } else {
          f.x = clamp(f.x, -s.radius + 0.6, s.radius - 0.6);
          f.z = clamp(f.z, -s.radius + 0.6, s.radius - 0.6);
        }
      }
      if (
        (out && !walls) ||
        f.hp <= 0 ||
        (floor === "crumble" && (s.broken[tile] ?? Infinity) < s.elapsed)
      ) {
        f.lives--;
        if (f.lives <= 0) {
          f.alive = false;
          s.scores[f.id] += s.elapsed;
        } else {
          f.hp = 100;
          f.x = 0;
          f.z = 0;
        }
      }
      if (s.def.id === "horror.lights-out") {
        f.torch = Math.max(0, f.torch - dt * 0.6);
        if (f.id !== s.players[0]?.id && f.torch <= 0) f.hp -= dt * 2;
        const monster = s.players[0]?.id;
        if (
          f.id !== monster &&
          Math.hypot(
            f.x - (s.fighters[monster]?.x ?? 999),
            f.z - (s.fighters[monster]?.z ?? 999),
          ) < 1.2
        ) {
          f.alive = false;
          s.scores[monster] += 100;
        } else if (f.id !== monster) s.scores[f.id] += dt;
      }
    }
    for (const shot of s.shots) {
      shot.x += shot.vx * dt;
      shot.z += shot.vz * dt;
      shot.distance += 18 * dt;
      for (const target of Object.values(s.fighters)) {
        if (
          target.id === shot.owner ||
          !target.alive ||
          Math.hypot(target.x - shot.x, target.z - shot.z) > 0.8
        )
          continue;
        if (
          s.def.config.team !== "none" &&
          s.def.config.team &&
          target.team === s.fighters[shot.owner].team
        )
          continue;
        const damage = Math.max(5, 20 - target.armor * 0.25);
        target.armor = Math.max(0, target.armor - 20);
        target.hp -= damage;
        s.scores[shot.owner] += 20;
        shot.distance = 100;
      }
      for (const tower of s.towers)
        if (
          tower.team !== s.fighters[shot.owner].team &&
          tower.hp > 0 &&
          Math.hypot(tower.x - shot.x, tower.z - shot.z) < 1.5
        ) {
          tower.hp -= 10;
          s.scores[shot.owner] += 20;
          shot.distance = 100;
        }
    }
    for (const shot of s.shots)
      for (const minion of s.minions)
        if (
          shot.distance < 30 &&
          minion.team !== s.fighters[shot.owner].team &&
          Math.hypot(minion.x - shot.x, minion.z - shot.z) < 1
        ) {
          minion.hp -= 20;
          shot.distance = 100;
          s.scores[shot.owner] += 10;
        }
    s.shots = s.shots.filter((b) => b.distance < 30);
    if (s.towers.length) {
      if (Math.floor(s.elapsed / 12) > Math.floor((s.elapsed - dt) / 12))
        for (let team = 0; team < 2; team++)
          for (let lane = 0; lane < 3; lane++)
            s.minions.push({
              team,
              x: (team ? 1 : -1) * s.radius * 0.7,
              z: (lane - 1) * s.radius * 0.4,
              hp: 20,
            });
      for (const minion of s.minions) {
        const target = s.towers
          .filter((t) => t.hp > 0 && t.team !== minion.team)
          .sort(
            (a, b) =>
              Math.hypot(a.x - minion.x, a.z - minion.z) -
              Math.hypot(b.x - minion.x, b.z - minion.z),
          )[0];
        if (!target) continue;
        const dx = target.x - minion.x,
          dz = target.z - minion.z,
          distance = Math.hypot(dx, dz);
        if (distance < 2) {
          target.hp -= dt * 3;
          minion.hp -= dt * 2;
        } else {
          minion.x += (dx / distance) * dt * 2;
          minion.z += (dz / distance) * dt * 2;
        }
      }
      s.minions = s.minions.filter((m) => m.hp > 0).slice(-60);
      const base = s.towers.slice(0, 2).find((t) => t.hp <= 0);
      if (base) {
        for (const f of Object.values(s.fighters))
          if (f.team !== base.team) s.scores[f.id] += 1000;
        s.ended = true;
      }
    }
    if (
      s.towers.length &&
      Math.floor(s.elapsed / 12) > Math.floor((s.elapsed - dt) / 12)
    )
      for (const tower of s.towers)
        if (tower.hp > 0) {
          const target = Object.values(s.fighters)
            .filter((f) => f.alive && f.team !== tower.team)
            .sort(
              (a, b) =>
                Math.hypot(a.x - tower.x, a.z - tower.z) -
                Math.hypot(b.x - tower.x, b.z - tower.z),
            )[0];
          if (target) {
            target.hp -= 5;
          }
        }
    if (s.def.id === "arcade.pong-royale") {
      const b = s.ball;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (Math.hypot(b.x, b.z) > s.radius - 1) {
        const a = Math.atan2(b.z, b.x);
        const f = Object.values(s.fighters)
          .filter((f) => f.alive)
          .sort(
            (x, y) =>
              Math.hypot(x.x - b.x, x.z - b.z) -
              Math.hypot(y.x - b.x, y.z - b.z),
          )[0];
        if (f && Math.hypot(f.x - b.x, f.z - b.z) < 5) {
          b.vx = -Math.cos(a) * 8;
          b.vz = -Math.sin(a) * 8;
          s.scores[f.id] += 10;
        } else {
          if (f) {
            f.lives--;
            if (!f.lives) f.alive = false;
          }
          b.x = 0;
          b.z = 0;
        }
      }
    }
    if (text(s.def, "win", "last") === "tiles") {
      for (const id of Object.keys(s.scores))
        s.scores[id] = Object.values(s.tiles).filter(
          (owner) => owner === id,
        ).length;
    }
    if (
      text(s.def, "win", "last") === "last" &&
      s.elapsed > 2 &&
      Object.values(s.fighters).filter((f) => f.alive).length <= 1
    ) {
      for (const f of Object.values(s.fighters))
        if (f.alive) s.scores[f.id] += 1000;
      s.ended = true;
    }
  },
  done: (s) => s.ended,
  result: (s) => rank(s.scores),
  snapshot(s, forPlayer) {
    const viewer = s.fighters[forPlayer];
    const visible =
      s.def.id === "horror.lights-out"
        ? Object.fromEntries(
            Object.entries(s.fighters).filter(([id, f]) => {
              if (id === forPlayer || !viewer) return true;
              const angle = Math.atan2(f.z - viewer.z, f.x - viewer.x);
              const distance = Math.hypot(f.x - viewer.x, f.z - viewer.z);
              return (
                distance < 3 ||
                (viewer.torch > 0 &&
                  distance < 14 &&
                  Math.abs(
                    Math.atan2(
                      Math.sin(angle - viewer.aim),
                      Math.cos(angle - viewer.aim),
                    ),
                  ) < 0.7)
              );
            }),
          )
        : s.fighters;
    return {
      engine: "arena",
      shape: s.def.config.shape,
      players: s.players,
      elapsed: s.elapsed,
      scores: s.scores,
      fighters: visible,
      shots: s.shots,
      tiles: s.tiles,
      broken: s.broken,
      radius: s.radius,
      ball: s.ball,
      pickups: s.pickups,
      towers: s.towers,
      minions: s.minions,
    };
  },
};
