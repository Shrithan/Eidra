import {
  base,
  time,
  rank,
  mulberry32,
  type BaseState,
  type Engine,
} from "../common.js";
import {
  generateLevel,
  createBody,
  validateInput,
  stepBody,
  stepRail,
  stepZip,
  steerToward,
  raycast,
  aim,
  clamp,
  type Body,
  type Input3D,
  type Level,
  type Vec3,
} from "../../../../../shared/stations/world3d/runtime/index.js";
export type WorldState = BaseState & {
  level: Level;
  bodies: Record<string, Body>;
  queues: Record<string, Input3D[]>;
  lastSeq: Record<string, number>;
  lastReceive: Record<string, number>;
  inputs: Record<string, Input3D>;
  patches: Record<string, string>;
  structures: Record<string, { hp: number; team: number }>;
  npcs: Record<string, Body>;
  wave: number;
  waveAt: number;
  baseHp: number;
  opened: number;
  fuses: number;
  monster: string;
  events: { kind: string; x: number; y: number; z: number; until: number }[];
  tick: number;
  kills: Record<string, number>;
  breakAt: number;
  shots: Projectile[];
};
type Projectile = { owner: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number };
const modeOf = (s: WorldState) => String(s.def.config.mode ?? "");
const idle = (body: Body): Input3D => ({
  seq: body.seq,
  dt: 0.05,
  move: [0, 0],
  yaw: body.yaw,
  pitch: body.pitch,
  jump: false,
  sprint: false,
  primary: false,
  secondary: false,
  interact: false,
});
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function collisionBoxes(s: WorldState) {
  return s.level.boxes.filter(
    (b) =>
      !(b.kind === "door" && b.id - 500 < s.opened) &&
      !(String(b.id) in s.structures && s.structures[b.id].hp <= 0),
  );
}
function damage(body: Body, amount: number) {
  const absorb = Math.min(body.armor, amount * 0.5);
  body.armor -= absorb;
  body.hp -= amount - absorb;
  if (body.hp <= 0) body.alive = false;
}
function respawn(s: WorldState, id: string) {
  const b = s.bodies[id];
  if (s.def.engine === "track" || s.def.id === "creative.paint-wars") {
    Object.assign(b, b.checkpoint, { vx: 0, vy: 0, vz: 0 });
    b.hp = 100;
  } else {
    b.alive = false;
    b.hp = 0;
    if (s.def.id === "strategy.lane-push") b.finish = s.elapsed + 5;
    if (modeOf(s) === "duel") b.finish = s.elapsed + 3;
  }
}
function strike(
  s: WorldState,
  ownerId: string,
  target: Body,
  amount: number,
) {
  const owner = s.bodies[ownerId];
  const wasAlive = target.alive;
  damage(target, amount);
  owner.score += 10;
  if (target.hp <= 0 && wasAlive) {
    target.alive = false;
    owner.score += 100;
    if (modeOf(s) === "duel") {
      s.kills[ownerId] = (s.kills[ownerId] ?? 0) + 1;
      target.finish = s.elapsed + 3;
      target.checkpoint = {
        ...s.level.spawns[
          (s.tick + Object.keys(s.kills).length) % s.level.spawns.length
        ],
      };
    }
  }
}
const inBox = (b: { x: number; y: number; z: number; w: number; h: number; d: number }, x: number, y: number, z: number) =>
  Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2 && Math.abs(z - b.z) < b.d / 2;
/** Bullets are real projectiles: they travel, drop a little, and stop at the first wall or body they meet. */
function stepShots(s: WorldState, dt: number) {
  const boxes = collisionBoxes(s);
  const steps = 3,
    h = dt / steps;
  s.shots = s.shots.filter((p) => {
    for (let i = 0; i < steps; i++) {
      p.x += p.vx * h;
      p.y += p.vy * h;
      p.z += p.vz * h;
      p.vy -= 3 * h;
      p.life -= h;
      if (p.life <= 0 || p.y < 0) return false;
      if (boxes.some((b) => inBox(b, p.x, p.y, p.z))) {
        s.events.push({ kind: "spark", x: p.x, y: p.y, z: p.z, until: s.elapsed + 0.2 });
        return false;
      }
      const pool: [string, Body, boolean][] = [
        ...Object.entries(s.bodies).map(([k, t]) => [k, t, false] as [string, Body, boolean]),
        ...Object.entries(s.npcs).map(([k, t]) => [k, t, true] as [string, Body, boolean]),
      ];
      for (const [key, t, npc] of pool) {
        if (!t.alive || key === p.owner) continue;
        if (modeOf(s) === "zombies" && !npc) continue;
        if (Math.hypot(t.x - p.x, t.z - p.z) < 0.6 && p.y > t.y && p.y < t.y + 1.9) {
          strike(s, p.owner, t, p.y > t.y + 1.5 ? 45 : 25);
          return false;
        }
      }
    }
    return true;
  });
}
function action(s: WorldState, id: string, input: Input3D) {
  const b = s.bodies[id];
  if (!b.alive) return;
  const eye = { x: b.x, y: b.y + 1.65, z: b.z },
    dir = aim(b.yaw, b.pitch);
  const all = { ...s.bodies, ...s.npcs };
  const hit = raycast(eye, dir, collisionBoxes(s), all, id, 60, s.elapsed);
  if (input.primary && s.def.engine !== "track" && s.elapsed >= b.cooldown) {
    b.cooldown = s.elapsed + 0.3;
    if (s.def.id === "chat.pool-party-brawl") {
      for (const [key, target] of Object.entries(s.bodies))
        if (key !== id && target.alive && distance(b, target) < 2.8) {
          target.vx += dir.x * 12;
          target.vz += dir.z * 12;
          target.vy = 4;
          target.x += dir.x * 0.5;
          target.z += dir.z * 0.5;
          target.boost = s.elapsed + 0.25;
          b.score += 10;
        }
    } else if (s.def.id === "creative.paint-wars") {
      if (hit?.boxId !== undefined) {
        const point = {
          x: eye.x + dir.x * hit.distance,
          y: eye.y + dir.y * hit.distance,
          z: eye.z + dir.z * hit.distance,
        };
        const key = `${hit.boxId}:${hit.normal.x},${hit.normal.y},${hit.normal.z}:${Math.floor(point.x * 2)},${Math.floor(point.y * 2)},${Math.floor(point.z * 2)}`;
        s.patches[key] = id;
        s.events.push({ kind: "paint", ...point, until: s.elapsed + 1 });
      }
    } else if (s.def.id === "horror.lights-out") {
      if (id === s.monster)
        for (const [key, target] of Object.entries(s.bodies))
          if (key !== id && target.alive && distance(b, target) < 2) {
            target.alive = false;
            b.score += 100;
          }
    } else if ((modeOf(s) === "zombies" || modeOf(s) === "duel") && b.ammo > 0) {
      b.ammo--;
      b.cooldown = s.elapsed + (modeOf(s) === "duel" ? 0.22 : 0.16);
      const speed = 75;
      if (s.shots.length < 240)
        s.shots.push({
          owner: id,
          x: eye.x + dir.x * 0.8,
          y: eye.y + dir.y * 0.8 - 0.1,
          z: eye.z + dir.z * 0.8,
          vx: dir.x * speed,
          vy: dir.y * speed,
          vz: dir.z * speed,
          life: 1.6,
        });
    } else if (b.ammo > 0) {
      b.ammo--;
      s.events.push({
        kind: "shot",
        x: eye.x + dir.x * (hit?.distance ?? 30),
        y: eye.y + dir.y * (hit?.distance ?? 30),
        z: eye.z + dir.z * (hit?.distance ?? 30),
        until: s.elapsed + 0.15,
      });
      if (hit?.playerId) {
        const target = all[hit.playerId];
        if (
          (modeOf(s) === "zombies"
            ? hit.playerId in s.npcs
            : target.team !== b.team) ||
          s.def.id === "shooter.last-drop" ||
          modeOf(s) === "duel"
        ) {
          const wasAlive = target.alive;
          damage(target, 25);
          b.score += 10;
          if (target.hp <= 0) {
            target.alive = false;
            b.score += 100;
            if (modeOf(s) === "duel" && wasAlive) {
              s.kills[id] = (s.kills[id] ?? 0) + 1;
              target.finish = s.elapsed + 3;
              target.checkpoint = {
                ...s.level.spawns[
                  (s.tick + Object.keys(s.kills).length) %
                    s.level.spawns.length
                ],
              };
            }
          }
        }
      } else if (
        hit?.boxId !== undefined &&
        s.structures[hit.boxId] &&
        s.structures[hit.boxId].team !== b.team
      ) {
        s.structures[hit.boxId].hp -= 10;
        b.score += 10;
      }
    } else if (modeOf(s) === "zombies" || modeOf(s) === "duel") {
      b.ammo = 30;
      b.cooldown = s.elapsed + 1.2;
    }
  }
  if (input.secondary && s.elapsed >= b.abilityAt) {
    b.abilityAt = s.elapsed + (s.def.id === "arcade.kart-dash" ? 1 : 5);
    if (s.def.id === "arcade.kart-dash") {
      if (b.item === "boost") b.boost = s.elapsed + 2;
      if (b.item === "oil")
        s.events.push({
          kind: "oil",
          x: b.x,
          y: b.y,
          z: b.z,
          until: s.elapsed + 10,
        });
      if (b.item === "shell") {
        const target = Object.entries(s.bodies)
          .filter(([key, t]) => key !== id && t.progress > b.progress)
          .sort((a, c) => a[1].progress - c[1].progress)[0]?.[1];
        if (target) {
          target.boost = 0;
          target.drift = 0;
          target.cooldown = s.elapsed + 1;
        }
      }
      b.item = "";
    }
    if (s.def.id === "strategy.lane-push") {
      if (input.sprint) {
        b.armor = Math.min(100, b.armor + 35);
      } else
        for (const target of Object.values(s.bodies))
          if (target.team !== b.team && distance(b, target) < 7) {
            damage(target, 25);
            target.vy = 5;
          }
    }
    if (s.def.id === "rpg.dungeon-delve") {
      if (b.role === "healer") {
        for (const target of Object.values(s.bodies))
          if (distance(b, target) < 12) {
            target.hp = Math.min(100, target.hp + 35);
            target.alive = true;
          }
        s.baseHp = Math.min(100, s.baseHp + 10);
      }
      if (b.role === "tank") b.armor = 100;
      if (b.role === "striker")
        for (const target of Object.values(s.npcs))
          if (distance(b, target) < 8) damage(target, 60);
      if (b.role === "scout") {
        for (const p of s.level.pickups)
          if (p.kind === "chest" && distance(b, p) < 12) p.active = false;
        b.score += 20;
      }
    }
    if (s.def.id === "shooter.last-drop" && b.ammo === 0) b.ammo = 30;
  }
  if (input.interact || s.def.id === "arcade.kart-dash") {
    for (const p of s.level.pickups) {
      if (!p.active || distance({ x: b.x, y: b.y + 0.7, z: b.z }, p) > 2)
        continue;
      p.active = false;
      if (p.kind === "fuse") {
        s.fuses++;
        b.fuses++;
        b.score += 100;
      }
      if (p.kind === "chest") {
        b.score += 50;
        b.ammo += 20;
        b.hp = Math.min(100, b.hp + 25);
        b.armor = Math.min(100, b.armor + 25);
      }
      if (p.kind === "medkit") b.hp = Math.min(100, b.hp + 40);
      if (p.kind === "ammo") b.ammo += 30;
      if (p.kind === "armor") b.armor = 60;
      if (p.kind === "boost") b.boost = s.elapsed + 2;
      if (
        s.def.id === "arcade.kart-dash" &&
        ["boost", "oil", "shell"].includes(p.kind) &&
        p.kind !== "boost"
      ) {
        b.item = p.kind;
        continue;
      }
      if (p.kind === "oil") {
        s.events.push({
          kind: "oil",
          x: b.x,
          y: b.y,
          z: b.z,
          until: s.elapsed + 10,
        });
      }
      if (p.kind === "shell") {
        const target = Object.entries(s.bodies)
          .filter(([key, t]) => key !== id && t.alive)
          .sort((a, c) => distance(a[1], b) - distance(c[1], b))[0]?.[1];
        if (target) {
          damage(target, 20);
          target.boost = 0;
          target.drift = 0;
        }
      }
    }
  }
}
function track(s: WorldState, id: string, input: Input3D, dt: number) {
  const b = s.bodies[id],
    points = s.level.waypoints;
  if (b.finish !== null) return;
  if (s.def.id === "sandbox.parkour-run") {
    const next = points[Math.min(points.length - 1, Math.floor(b.progress))];
    if (next && distance(b, next) < 2.6 && b.y >= next.y - 0.4) {
      b.progress++;
      if (next.kind === "checkpoint")
        b.checkpoint = { x: next.x, y: next.y + 0.1, z: next.z };
      if (next.kind === "zipline" && input.interact) {
        const p =
          points[Math.min(points.length - 1, Math.floor(b.progress) + 1)];
        b.zip = Math.min(points.length - 1, Math.floor(b.progress) + 1);
      }
      if (b.progress >= points.length) b.finish = s.elapsed;
    }
    if (
      !b.grounded &&
      b.vy < 0 &&
      s.level.boxes.some(
        (box) =>
          box.h > 2 &&
          Math.abs(b.x - box.x) < box.w / 2 + 0.5 &&
          Math.abs(b.z - box.z) < box.d / 2 + 0.5 &&
          b.y < box.y + box.h / 2 &&
          b.y + 1.8 > box.y - box.h / 2,
      )
    )
      b.vy = Math.max(b.vy, -2.5);
  } else if (s.def.id === "arcade.kart-dash") {
    const next = points[Math.floor(b.progress) % points.length];
    if (distance(b, next) < 7) {
      b.progress++;
      if (b.progress % points.length === 0) b.lap++;
      if (b.progress >= points.length * 2) b.finish = s.elapsed;
    }
    b.drift = input.jump
      ? Math.min(2, b.drift + dt)
      : Math.max(0, b.drift - dt * 2);
    if (!input.jump && b.drift > 1) b.boost = s.elapsed + 1;
  } else {
    if (stepRail(b, input, points, dt, s.elapsed)) b.finish = s.elapsed;
  }
  b.score =
    b.finish !== null ? 100000 - b.finish * 100 : b.progress * 100 + b.y;
}
export const worldVariant: Engine<WorldState, unknown> = {
  init(def, players, seed) {
    const level = generateLevel(String(def.config.mode ?? def.id), seed),
      rng = mulberry32(seed),
      bodies: Record<string, Body> = {};
    players.forEach((p, i) => {
      bodies[p.id] = createBody(
        level.spawns[i % level.spawns.length],
        def.config.mode === "zombies" ? 0 : def.config.mode === "duel" ? i : i % 2,
      );
      bodies[p.id].role = ["tank", "healer", "striker", "scout"][i % 4];
    });
    return {
      ...base(def, players),
      level,
      bodies,
      queues: Object.fromEntries(players.map((p) => [p.id, []])),
      lastSeq: Object.fromEntries(players.map((p) => [p.id, -1])),
      lastReceive: {},
      inputs: {},
      patches: {},
      structures: Object.fromEntries(
        level.boxes
          .filter((b) => b.id >= 100 && b.id < 112)
          .map((b) => [
            b.id,
            {
              hp: b.id >= 110 ? 120 : 20,
              team: b.id >= 110 ? b.id - 110 : Math.floor((b.id - 100) / 3),
            },
          ]),
      ),
      npcs: {},
      wave: 0,
      waveAt: 0,
      baseHp: 100,
      opened: 0,
      fuses: 0,
      monster: players[Math.floor(rng() * players.length)]?.id ?? "",
      events: [],
      tick: 0,
      kills: {},
      breakAt: -1,
      shots: [],
    };
  },
  input(s, id, raw) {
    const input = validateInput(raw);
    if (
      !input ||
      !s.bodies[id] ||
      input.seq <= s.lastSeq[id] ||
      s.queues[id].length >= 4
    )
      return;
    s.lastSeq[id] = input.seq;
    s.queues[id].push(input);
    s.lastReceive[id] = s.elapsed;
  },
  tick(s, dt) {
    time(s, dt);
    s.tick++;
    const boxes = collisionBoxes(s);
    for (const [id, b] of Object.entries(s.bodies)) {
      if (!b.alive) {
        if (
          (s.def.id === "strategy.lane-push" || modeOf(s) === "duel") &&
          b.finish !== null &&
          s.elapsed >= b.finish
        ) {
          Object.assign(b, b.checkpoint, {
            hp: 100,
            alive: true,
            finish: null,
            ammo: 30,
            armor: 0,
          });
        } else continue;
      }
      const queued = s.queues[id].shift();
      const command = queued ?? idle(b);
      if (!queued && s.elapsed - (s.lastReceive[id] ?? 0) > 0.15) {
        command.move = [0, 0];
        command.primary = false;
      }
      s.inputs[id] = command;
      if (b.zip >= 0) {
        stepZip(b, s.level.waypoints, 0.05);
        b.seq = command.seq;
      } else if (s.def.id !== "other.rail-rush") {
        const impulse = { x: b.vx, z: b.vz };
        const speed =
          s.def.id === "arcade.kart-dash"
            ? b.boost > s.elapsed
              ? 24
              : 16
            : undefined;
        stepBody(
          b,
          s.def.id === "arcade.kart-dash"
            ? { ...command, jump: false }
            : command,
          boxes,
          0.05,
          s.elapsed,
          speed,
        );
        if (b.boost > s.elapsed && s.def.id === "chat.pool-party-brawl") {
          b.x += impulse.x * 0.05;
          b.z += impulse.z * 0.05;
        }
        if (s.def.id === "chat.pool-party-brawl") {
          const wave = Math.sin(s.elapsed * 1.5) * 0.7;
          b.x += wave * 0.05;
          b.z += Math.cos(s.elapsed * 0.7) * 0.025;
        }
      }
      action(s, id, command);
      if (s.def.engine === "track") track(s, id, command, dt);
      if (b.y < s.level.killY) respawn(s, id);
      if (s.def.id === "shooter.last-drop") {
        const radius = Math.max(
          4,
          40 * (1 - (s.elapsed / s.def.roundSeconds) * 0.9),
        );
        if (Math.hypot(b.x, b.z) > radius) damage(b, dt * 20);
      }
      if (
        s.def.id === "chat.pool-party-brawl" &&
        Math.hypot(b.x, b.z) > Math.max(2, 16 - s.elapsed * 0.12)
      )
        respawn(s, id);
      if (s.def.id === "horror.lights-out") {
        if (id !== s.monster) b.torch = Math.max(0, b.torch - dt * 0.8);
        if (id !== s.monster && s.fuses >= 3 && distance(b, s.level.exit) < 3) {
          b.finish = s.elapsed;
          b.score += 1000;
          b.alive = false;
        }
      }
      if (s.def.id === "rpg.dungeon-delve")
        for (const trap of s.level.boxes.filter((box) => box.id >= 920))
          if (distance(b, trap) < 1.5) damage(b, dt * 10);
      for (const e of s.events)
        if (e.kind === "oil" && distance(e, b) < 2) b.boost = 0;
      if (b.hp <= 0) {
        respawn(s, id);
      }
      if (s.def.id === "creative.paint-wars")
        b.score =
          Object.values(s.patches).filter((owner) => owner === id).length *
          0.25;
      s.scores[id] = b.score;
    }
    if (s.def.id === "strategy.lane-push") {
      if (s.tick === 1 || s.elapsed >= s.waveAt) {
        s.waveAt = s.elapsed + 12;
        for (let team = 0; team < 2; team++)
          for (let lane = 0; lane < 3; lane++) {
            const b = createBody(
              { x: (team ? 1 : -1) * 22, y: 0.1, z: (lane - 1) * 15 },
              team,
            );
            b.hp = 30;
            s.npcs[`minion-${s.tick}-${team}-${lane}`] = b;
          }
      }
      for (const npc of Object.values(s.npcs)) {
        if (!npc.alive) continue;
        const targets = Object.entries(s.structures)
          .filter(([, t]) => t.team !== npc.team && t.hp > 0)
          .map(([id, t]) => ({
            box: s.level.boxes.find((b) => b.id === Number(id))!,
            state: t,
          }))
          .sort((a, b) => distance(npc, a.box) - distance(npc, b.box));
        const target = targets[0];
        if (target) {
          const d = distance(npc, target.box);
          if (d < 3) target.state.hp -= dt * 4;
          else {
            npc.x += Math.sign(target.box.x - npc.x) * dt * 2;
            npc.z += Math.sign(target.box.z - npc.z) * dt * 2;
          }
        }
      }
      for (const [id, t] of Object.entries(s.structures))
        if (Number(id) >= 110 && t.hp <= 0) {
          for (const [key, b] of Object.entries(s.bodies))
            if (b.team !== t.team) s.scores[key] += 10000;
          s.ended = true;
        }
    }
    if (modeOf(s) === "zombies") {
      const alive = Object.values(s.npcs).filter((n) => n.alive);
      const bodies = Object.values(s.bodies);
      if (!alive.length) {
        if (s.breakAt < 0) {
          s.breakAt = s.elapsed + (s.wave === 0 ? 3 : 6);
          if (s.wave > 0)
            for (const [key, b] of Object.entries(s.bodies)) {
              b.hp = b.alive ? Math.min(100, b.hp + 40) : 60;
              b.alive = true;
              b.ammo = 30;
              b.finish = null;
              s.scores[key] += 50 * s.wave;
              b.score += 50 * s.wave;
            }
        } else if (s.elapsed >= s.breakAt) {
          s.breakAt = -1;
          s.wave++;
          const rng = mulberry32(s.level.seed + s.wave * 131),
            count = Math.min(40, 4 + s.wave * 3 + bodies.length * 2);
          for (let i = 0; i < count; i++) {
            const angle = rng() * Math.PI * 2,
              ring = s.level.bounds - 4;
            const n = createBody(
              { x: Math.cos(angle) * ring, y: 0.1, z: Math.sin(angle) * ring },
              9,
            );
            n.hp = Math.min(150, 30 + s.wave * 6);
            n.drift = Math.min(4.2, 1.6 + s.wave * 0.18 + rng() * 0.5);
            s.npcs[`zombie-${s.wave}-${i}`] = n;
          }
        }
      }
      for (const npc of alive) {
        const target = bodies
          .filter((b) => b.alive)
          .sort((a, b) => distance(a, npc) - distance(b, npc))[0];
        if (!target) continue;
        const d = Math.hypot(target.x - npc.x, target.z - npc.z);
        const direction = steerToward(npc, target, boxes);
        const yaw = Math.atan2(-direction.x, -direction.z);
        stepBody(
          npc,
          { ...idle(npc), yaw, move: [0, 1] },
          boxes,
          0.05,
          s.elapsed,
          npc.drift,
        );
        if (d < 1.5) damage(target, dt * (8 + Math.min(10, s.wave)));
      }
      if (!bodies.some((b) => b.alive)) s.ended = true;
    }
    if (modeOf(s) === "duel") {
      const best = Object.entries(s.kills).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 8) {
        s.scores[best[0]] += 1000;
        s.ended = true;
      }
    }
    if (s.def.id === "rpg.dungeon-delve") {
      const alive = Object.values(s.npcs).filter((n) => n.alive);
      if (!alive.length && s.elapsed >= s.waveAt) {
        if (s.wave >= 7) {
          s.ended = true;
          for (const id of Object.keys(s.scores)) s.scores[id] += 1000;
        } else {
          s.opened = s.wave;
          s.wave++;
          s.waveAt = s.elapsed + 4;
          for (let i = 0; i < 3 + s.wave; i++) {
            const n = createBody(
              { x: ((i % 3) - 1) * 4, y: 0.1, z: -(s.wave - 1) * 22 - 4 },
              9,
            );
            n.hp = 40 + s.wave * 5;
            s.npcs[`enemy-${s.wave}-${i}`] = n;
          }
        }
      }
      for (const npc of alive) {
        const target = Object.values(s.bodies)
          .filter((b) => b.alive)
          .sort((a, b) => distance(a, npc) - distance(b, npc))[0];
        if (!target) continue;
        const dx = target.x - npc.x,
          dz = target.z - npc.z,
          d = Math.hypot(dx, dz);
        const direction = steerToward(npc, target, boxes);
        const yaw = Math.atan2(-direction.x, -direction.z);
        stepBody(
          npc,
          { ...idle(npc), yaw, move: [0, 1] },
          boxes,
          0.05,
          s.elapsed,
          2,
        );
        if (d < 1.5) damage(target, dt * 12);
      }
      if (!Object.values(s.bodies).some((b) => b.alive)) s.ended = true;
    }
    if (s.def.id === "horror.lights-out") {
      const survivors = Object.entries(s.bodies).filter(
        ([id, b]) => id !== s.monster && b.alive,
      );
      if (!survivors.length) {
        s.ended = true;
        s.scores[s.monster] += Object.values(s.bodies).some(
          (b) => b.finish !== null,
        )
          ? 0
          : 1000;
      }
    } else if (
      s.def.engine === "arena" &&
      s.def.id !== "creative.paint-wars" &&
      s.def.id !== "strategy.lane-push" &&
      modeOf(s) !== "zombies" &&
      modeOf(s) !== "duel" &&
      s.elapsed > 2 &&
      Object.values(s.bodies).filter((b) => b.alive).length <= 1
    ) {
      for (const [id, b] of Object.entries(s.bodies))
        if (b.alive) s.scores[id] += 1000;
      s.ended = true;
    }
    if (
      s.def.engine === "track" &&
      Object.values(s.bodies).every((b) => b.finish !== null)
    )
      s.ended = true;
    stepShots(s, dt);
    s.events = s.events.filter((e) => e.until > s.elapsed);
    for (const [id, n] of Object.entries(s.npcs))
      if (!n.alive) delete s.npcs[id];
  },
  done: (s) => s.ended,
  result: (s) => rank(s.scores),
  snapshot(s, id) {
    let bodies = s.bodies;
    if (s.def.id === "horror.lights-out") {
      const viewer = s.bodies[id];
      if (viewer)
        bodies = Object.fromEntries(
          Object.entries(bodies).filter(([key, b]) => {
            if (key === id) return true;
            const d = distance(viewer, b);
            if (d > (id === s.monster ? 12 : viewer.torch > 0 ? 16 : 3))
              return false;
            const delta = {
              x: b.x - viewer.x,
              y: b.y - viewer.y,
              z: b.z - viewer.z,
            };
            const hit = raycast(
              { x: viewer.x, y: viewer.y + 1, z: viewer.z },
              { x: delta.x / d, y: delta.y / d, z: delta.z / d },
              collisionBoxes(s),
              {},
              "",
              d,
              s.elapsed,
            );
            return !hit;
          }),
        );
    }
    return {
      engine: s.def.engine,
      space: "3d",
      view: s.def.view,
      gameId: s.def.id,
      elapsed: s.elapsed,
      players: s.players,
      scores: s.scores,
      bodies,
      level: { ...s.level, boxes: collisionBoxes(s) },
      npcs: s.npcs,
      structures: s.structures,
      patches: s.patches,
      events: s.events,
      monster: s.monster,
      fuses: s.fuses,
      wave: s.wave,
      kills: s.kills,
      projectiles: s.shots.map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz]),
      baseHp: s.baseHp,
      serverTick: s.tick,
      safeRadius:
        s.def.id === "shooter.last-drop"
          ? Math.max(4, 40 * (1 - (s.elapsed / s.def.roundSeconds) * 0.9))
          : undefined,
    };
  },
};
