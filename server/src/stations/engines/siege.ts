import {
  base,
  time,
  rank,
  mulberry32,
  number,
  record,
  finite,
  type BaseState,
  type Engine,
} from "./common.js";
type Role = { id: string; name: string; buttons: string[] };
type Enemy = {
  id: number;
  kind: string;
  progress: number;
  hp: number;
  lane: number;
  required: string;
  rotation?: number;
  color?: number;
  parts?: string[];
};
export type SiegeState = BaseState & {
  base: number;
  wave: number;
  stage: "upgrade" | "wave";
  next: number;
  roles: Role[];
  assigned: Record<string, string>;
  points: Record<string, number>;
  cooldown: Record<string, number>;
  upgrades: Record<string, number>;
  enemies: Enemy[];
  schedule: { wave: number; at: number; kind: string; lane: number }[];
  spawned: number;
  spawnedTimes: number[];
  lamps: number[];
  sequence: number;
  position: Record<string, number>;
  ammo: Record<string, number>;
  down: Record<string, number>;
  towers: { owner: string; lane: number; power: number }[];
};
export const siege: Engine<SiegeState, unknown> = {
  init(def, players, seed) {
    const rng = mulberry32(seed),
      waves = number(def, "waves", 8),
      roles = Array.isArray(def.config.roles)
        ? (def.config.roles as Role[])
        : [];
    const kinds = Array.isArray(def.config.enemies)
      ? def.config.enemies.map(String)
      : ["grunt"];
    return {
      ...base(def, players),
      base: number(def, "base", 100),
      wave: 0,
      stage: "upgrade",
      next: 5,
      roles,
      assigned: Object.fromEntries(
        players.map((p, i) => [
          p.id,
          roles[i % Math.max(1, roles.length)]?.id ?? "defender",
        ]),
      ),
      points: Object.fromEntries(players.map((p) => [p.id, 20])),
      cooldown: {},
      upgrades: {},
      enemies: [],
      schedule: Array.from(
        { length: waves * (def.id === "rpg.raid-night" ? 1 : 8) },
        (_, i) => ({
          wave: def.id === "rpg.raid-night" ? i + 1 : Math.floor(i / 8) + 1,
          at: def.id === "rpg.raid-night" ? 0 : (i % 8) * 1.5,
          kind: kinds[Math.floor(rng() * kinds.length)] ?? "grunt",
          lane: Math.floor(rng() * players.length),
        }),
      ),
      spawned: 0,
      spawnedTimes: [],
      lamps: [],
      sequence: 0,
      position: Object.fromEntries(players.map((p) => [p.id, 0])),
      ammo: Object.fromEntries(players.map((p) => [p.id, 30])),
      down: {},
      towers: [],
    };
  },
  input(s, id, input) {
    const v = record(input);
    if (!v || !(id in s.points)) return;
    if (
      typeof v.role === "string" &&
      s.roles.some((r) => r.id === v.role) &&
      !Object.entries(s.assigned).some(
        ([player, role]) => player !== id && role === v.role,
      )
    ) {
      s.assigned[id] = v.role;
      return;
    }
    if (
      v.action === "revive" &&
      typeof v.player === "string" &&
      s.down[v.player] &&
      !(s.down[id] > s.elapsed)
    ) {
      delete s.down[v.player];
      s.scores[id] += 50;
      return;
    }
    if (s.down[id] > s.elapsed) return;
    if (
      v.action === "reload" &&
      s.def.id === "shooter.horde" &&
      (s.cooldown[id] ?? 0) <= s.elapsed
    ) {
      s.ammo[id] = 30;
      s.cooldown[id] = s.elapsed + 1.5;
      return;
    }
    if (finite(v.position))
      s.position[id] = Math.max(0, Math.min(3, Math.floor(v.position)));
    if (s.stage === "upgrade") {
      if (
        typeof v.upgrade !== "string" ||
        !["repair", "power", "speed"].includes(v.upgrade) ||
        s.points[id] < 10
      )
        return;
      s.points[id] -= 10;
      if (v.upgrade === "repair")
        s.base = Math.min(number(s.def, "base", 100), s.base + 20);
      else s.upgrades[id] = (s.upgrades[id] ?? 0) + 1;
      if (s.def.id === "strategy.tower-siege") {
        const tower = s.towers.find((t) => t.owner === id);
        if (tower) tower.power += 2;
        else
          s.towers.push({
            owner: id,
            lane: s.players.findIndex((p) => p.id === id),
            power: 4,
          });
      }
      s.ammo[id] = 30;
      return;
    }
    if (typeof v.action !== "string" || (s.cooldown[id] ?? -1) > s.elapsed)
      return;
    const role = s.assigned[id],
      buttons = s.roles.find((r) => r.id === role)?.buttons ?? ["act"];
    if (!buttons.includes(v.action)) return;
    s.cooldown[id] =
      s.elapsed + Math.max(0.2, 0.8 - (s.upgrades[id] ?? 0) * 0.05);
    if (v.action === "heal") {
      s.base = Math.min(number(s.def, "base", 100), s.base + 4);
      s.scores[id] += 4;
      return;
    }
    if (s.def.id === "horror.last-candle" && v.action === "ward") {
      const lane = s.players.findIndex((p) => p.id === id);
      if (!s.towers.some((t) => t.owner === id))
        s.towers.push({ owner: id, lane, power: 5 });
      return;
    }
    if (s.def.id === "horror.last-candle" && v.action === "light") {
      const lane = s.players.findIndex((p) => p.id === id);
      if (!s.lamps.includes(lane)) s.lamps.push(lane);
      s.base = Math.min(100, s.base + 2);
      return;
    }
    const enemy =
      s.enemies.find((e) => e.id === v.target) ??
      s.enemies.find((e) => e.required === role || !e.required);
    if (!enemy || (enemy.required && enemy.required !== role)) return;
    if (s.def.id === "creative.glitch-rescue") {
      if (v.action === "rotate")
        enemy.rotation = ((enemy.rotation ?? 0) + 1) % 4;
      if (v.action === "swap") enemy.rotation = (4 - (enemy.rotation ?? 0)) % 4;
      if (v.action === "recolour") enemy.color = ((enemy.color ?? 0) + 1) % 4;
      if (enemy.rotation || enemy.color) {
        s.scores[id]++;
        return;
      }
      enemy.hp = 1;
    }
    if (v.action === "taunt") {
      enemy.progress = Math.max(0, enemy.progress - 0.08);
    }
    if (s.def.id === "sandbox.heist-crew") {
      const index = s.players.findIndex((p) => p.id === id);
      if (index !== s.sequence % s.players.length) return;
      s.sequence++;
    }
    if (s.def.id === "shooter.horde") {
      if (s.ammo[id] <= 0) return;
      s.ammo[id]--;
    }
    if (s.def.id === "arcade.pit-stop") {
      enemy.parts ??= [];
      if (enemy.parts.includes(role)) return;
      enemy.parts.push(role);
      enemy.hp = enemy.parts.length >= s.roles.length ? 0 : 1;
      s.scores[id] += 10;
    } else enemy.hp -= 15 + (s.upgrades[id] ?? 0) * 5;
    s.scores[id] += 10;
    if (s.def.id === "sandbox.heist-crew")
      for (const e of s.enemies)
        e.required =
          s.assigned[s.players[s.sequence % s.players.length]?.id] ?? "";
    if (enemy.hp <= 0) {
      s.points[id] += 10;
      s.scores[id] += enemy.kind === "viral clip" ? 75 : 25;
      s.enemies = s.enemies.filter((e) => e !== enemy);
    }
  },
  tick(s, dt) {
    time(s, dt);
    if (s.stage === "upgrade") {
      if (s.elapsed >= s.next) {
        s.stage = "wave";
        s.wave++;
        s.next = s.elapsed;
        s.spawned = 0;
        s.spawnedTimes = [];
      }
      return;
    }
    const since = s.elapsed - s.next;
    for (const item of s.schedule.filter((e) => e.wave === s.wave)) {
      if (item.at > since || s.spawnedTimes.includes(item.at)) continue;
      s.spawnedTimes.push(item.at);
      let required = "";
      if (s.def.id === "chat.subathon")
        required =
          (
            {
              troll: "mod",
              "lag spike": "editor",
              "chat flood": "host",
              "viral clip": "clipper",
            } as Record<string, string>
          )[item.kind] ?? "";
      if (s.def.id === "creative.glitch-rescue")
        required =
          s.assigned[s.players[item.lane % s.players.length]?.id] ?? "";
      if (s.def.id === "other.wagon-trail")
        required =
          (
            {
              river: "scout",
              bandits: "hunter",
              storm: "wagon",
              trade: "trader",
            } as Record<string, string>
          )[item.kind] ?? "";
      if (s.def.id === "sandbox.heist-crew")
        required =
          s.assigned[s.players[s.sequence % s.players.length]?.id] ?? "";
      s.enemies.push({
        id: s.wave * 100 + s.spawned++,
        kind: item.kind,
        progress: 0,
        hp:
          s.def.id === "rpg.raid-night"
            ? 800 + s.wave * 200
            : s.def.id === "arcade.pit-stop"
              ? s.roles.length
              : 25 + s.wave * 4,
        lane: item.lane,
        required,
        rotation:
          s.def.id === "creative.glitch-rescue"
            ? (item.lane + s.wave) % 4
            : undefined,
        color:
          s.def.id === "creative.glitch-rescue"
            ? (s.wave + s.spawned) % 4
            : undefined,
      });
    }
    for (const tower of s.towers) {
      const target = s.enemies.find((e) => e.lane === tower.lane);
      if (target) {
        target.hp -= dt * tower.power;
        if (target.hp <= 0) {
          s.scores[tower.owner] += 25;
          s.points[tower.owner] += 10;
          s.enemies = s.enemies.filter((e) => e !== target);
        }
      }
    }
    if (s.def.id === "rpg.raid-night")
      for (const p of s.players)
        if (s.position[p.id] === Math.floor(s.elapsed / 4) % 4)
          s.base -= dt * 2;
    for (const enemy of s.enemies) {
      if (s.def.id !== "rpg.raid-night")
        enemy.progress += dt * (0.025 + s.wave * 0.002);
      if (s.def.id === "horror.last-candle" && s.lamps.includes(enemy.lane))
        enemy.progress = Math.max(0, enemy.progress - dt * 0.012);
    }
    const escaped = s.enemies.filter((e) => e.progress >= 1);
    s.base -= escaped.length * 10;
    if (s.def.id === "shooter.horde")
      for (const e of escaped) {
        const player = s.players[e.lane % s.players.length];
        if (player) s.down[player.id] = s.elapsed + 10;
      }
    s.enemies = s.enemies.filter((e) => e.progress < 1);
    if (s.base <= 0) {
      s.base = 0;
      s.ended = true;
    }
    if (since > 12 && s.enemies.length === 0) {
      if (s.wave >= number(s.def, "waves", 8)) {
        s.ended = true;
        for (const id of Object.keys(s.scores)) s.scores[id] += s.base * 10;
      } else {
        s.stage = "upgrade";
        s.next = s.elapsed + 6;
        for (const id of Object.keys(s.points)) s.points[id] += 15;
      }
    }
  },
  done: (s) => s.ended,
  result: (s) => rank(s.scores, s.base > 0 ? "Base defended" : "Base lost"),
  snapshot(s) {
    return {
      engine: "siege",
      elapsed: s.elapsed,
      players: s.players,
      scores: s.scores,
      base: s.base,
      wave: s.wave,
      stage: s.stage,
      roles: s.roles,
      assigned: s.assigned,
      points: s.points,
      enemies: s.enemies,
      upgrades: s.upgrades,
      sequence: s.sequence,
      ammo: s.ammo,
      down: s.down,
      towers: s.towers,
      lamps: s.lamps,
      hazard:
        s.def.id === "rpg.raid-night"
          ? Math.floor(s.elapsed / 4) % 4
          : undefined,
    };
  },
};
