import {
  base,
  time,
  rank,
  mulberry32,
  clamp,
  finite,
  record,
  type BaseState,
  type Engine,
} from "./common.js";

/** Two-player eight-ball. The table is 2 x 1 units; the server simulates every shot. */
export const POOL = {
  width: 2,
  height: 1,
  radius: 0.03,
  pocket: 0.07,
  pockets: [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ] as [number, number][],
  shotSeconds: 30,
};
type Ball = { x: number; y: number; vx: number; vy: number; out: boolean };
export type PoolState = BaseState & {
  balls: Ball[];
  turn: number;
  groups: Record<string, "solid" | "stripe" | "">;
  moving: boolean;
  hand: boolean;
  first: number;
  potted: number[];
  deadline: number;
  message: string;
  shots: number;
  rng: () => number;
};
const group = (n: number): "solid" | "stripe" | "" =>
  n >= 1 && n <= 7 ? "solid" : n >= 9 ? "stripe" : "";
const STEP = 1 / 240;
function rack(): Ball[] {
  const balls: Ball[] = [{ x: 0.5, y: 0.5, vx: 0, vy: 0, out: false }];
  // 8-ball in the centre of the third row; others fill alternately solid / stripe
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const gap = POOL.radius * 2 + 0.001;
  let k = 0;
  for (let col = 0; col < 5; col++)
    for (let row = 0; row <= col; row++) {
      const n = order[k++];
      balls[n] = {
        x: 1.4 + col * gap * 0.87,
        y: 0.5 + (row - col / 2) * gap,
        vx: 0,
        vy: 0,
        out: false,
      };
    }
  return balls;
}
const shooter = (s: PoolState) => s.players[s.turn % s.players.length];
function free(s: PoolState, x: number, y: number) {
  if (
    x < POOL.radius ||
    x > POOL.width - POOL.radius ||
    y < POOL.radius ||
    y > POOL.height - POOL.radius
  )
    return false;
  return s.balls.every(
    (b, i) =>
      i === 0 ||
      b.out ||
      Math.hypot(b.x - x, b.y - y) > POOL.radius * 2 + 0.002,
  );
}
function fire(s: PoolState, angle: number, power: number) {
  const cue = s.balls[0],
    speed = 0.4 + clamp(power, 0, 1) * 4.2;
  cue.vx = Math.cos(angle) * speed;
  cue.vy = Math.sin(angle) * speed;
  s.moving = true;
  s.first = -1;
  s.potted = [];
  s.hand = false;
  s.shots++;
  s.message = "";
}
function step(s: PoolState) {
  const r = POOL.radius,
    balls = s.balls;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.out) continue;
    b.x += b.vx * STEP;
    b.y += b.vy * STEP;
    const drag = 1 - 0.7 * STEP,
      speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const next = Math.max(0, speed * drag - 0.1 * STEP) / speed;
      b.vx *= next;
      b.vy *= next;
      if (Math.hypot(b.vx, b.vy) < 0.012) b.vx = b.vy = 0;
    }
    // pockets first, so a ball rolling at a corner drops in instead of bouncing off
    for (const [px, py] of POOL.pockets)
      if (Math.hypot(b.x - px, b.y - py) < POOL.pocket) {
        b.out = true;
        b.vx = b.vy = 0;
        if (i) s.potted.push(i);
        break;
      }
    if (b.out) continue;
    if (b.x < r) {
      b.x = r;
      b.vx = Math.abs(b.vx) * 0.78;
    } else if (b.x > POOL.width - r) {
      b.x = POOL.width - r;
      b.vx = -Math.abs(b.vx) * 0.78;
    }
    if (b.y < r) {
      b.y = r;
      b.vy = Math.abs(b.vy) * 0.78;
    } else if (b.y > POOL.height - r) {
      b.y = POOL.height - r;
      b.vy = -Math.abs(b.vy) * 0.78;
    }
  }
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.out) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.out) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        d = Math.hypot(dx, dy);
      if (d >= r * 2 || d === 0) continue;
      const nx = dx / d,
        ny = dy / d,
        overlap = r * 2 - d;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        a.vx -= rel * nx;
        a.vy -= rel * ny;
        b.vx += rel * nx;
        b.vy += rel * ny;
        if (i === 0 && s.first < 0) s.first = j;
      }
    }
  }
}
function resolve(s: PoolState) {
  s.moving = false;
  const me = shooter(s),
    other = s.players[(s.turn + 1) % s.players.length];
  const potted = s.potted.filter((n) => n !== 0),
    cueOut = s.balls[0].out,
    eight = potted.includes(8);
  const own = s.groups[me.id];
  const ownLeft = (g: string) =>
    s.balls.filter((b, n) => n && !b.out && group(n) === g).length;
  const before = own
    ? ownLeft(own) + potted.filter((n) => group(n) === own).length
    : -1;
  let foul = cueOut || s.first < 0;
  if (!foul && own) foul = before === 0 ? s.first !== 8 : group(s.first) !== own;
  else if (!foul && s.first === 8) foul = true;
  if (eight) {
    // potting the eight ends the game
    const legal = !foul && !!own && ownLeft(own) === 0;
    s.scores[(legal ? me : other).id] += 1000;
    s.message = legal
      ? `${me.name} sinks the eight`
      : `${me.name} potted the eight too soon`;
    s.ended = true;
    return;
  }
  if (!own && !foul) {
    const first = potted.find((n) => group(n));
    if (first) {
      s.groups[me.id] = group(first);
      s.groups[other.id] = group(first) === "solid" ? "stripe" : "solid";
    }
  }
  const mine = potted.filter((n) => group(n) === s.groups[me.id]);
  if (!foul) s.scores[me.id] += mine.length * 10;
  const keep = !foul && (s.groups[me.id] ? mine.length > 0 : false);
  if (cueOut) {
    const cue = s.balls[0];
    cue.out = false;
    cue.x = 0.5;
    cue.y = 0.5;
    cue.vx = cue.vy = 0;
    let k = 0;
    while (!free(s, cue.x, cue.y) && k++ < 40) cue.x = 0.3 + s.rng() * 0.3;
  }
  if (!keep) {
    s.turn = (s.turn + 1) % s.players.length;
    s.hand = foul;
    s.message = foul ? `Foul by ${me.name}: ball in hand` : "";
  } else s.message = `${me.name} keeps the table`;
  s.deadline = s.elapsed + POOL.shotSeconds;
}
function autoShot(s: PoolState) {
  const me = shooter(s).id,
    cue = s.balls[0],
    want = s.groups[me];
  const target = s.balls
    .map((b, n) => ({ b, n }))
    .filter(
      ({ b, n }) =>
        n && !b.out && (!want || group(n) === want || (n === 8 && !want)),
    )
    .sort(
      (p, q) =>
        Math.hypot(p.b.x - cue.x, p.b.y - cue.y) -
        Math.hypot(q.b.x - cue.x, q.b.y - cue.y),
    )[0];
  const angle = target
    ? Math.atan2(target.b.y - cue.y, target.b.x - cue.x)
    : s.rng() * Math.PI * 2;
  fire(s, angle, 0.45);
}
export const pool: Engine<PoolState, unknown> = {
  init(def, players, seed) {
    const s: PoolState = {
      ...base(def, players),
      balls: rack(),
      turn: 0,
      groups: Object.fromEntries(players.map((p) => [p.id, ""])),
      moving: false,
      hand: false,
      first: -1,
      potted: [],
      deadline: POOL.shotSeconds + 3,
      message: "Break!",
      shots: 0,
      rng: mulberry32(seed),
    };
    return s;
  },
  input(s, id, input) {
    if (s.ended || s.moving || shooter(s)?.id !== id) return;
    const v = record(input);
    if (!v) return;
    if (Array.isArray(v.place) && s.hand) {
      const [x, y] = v.place;
      if (finite(x) && finite(y) && free(s, x, y)) {
        s.balls[0].x = x;
        s.balls[0].y = y;
      }
    }
    if (finite(v.angle) && finite(v.power)) fire(s, v.angle, v.power);
  },
  tick(s, dt) {
    time(s, dt);
    if (s.ended) return;
    if (s.moving) {
      const steps = Math.min(30, Math.ceil(clamp(dt, 0, 0.1) / STEP));
      for (let i = 0; i < steps; i++) step(s);
      if (s.balls.every((b) => b.out || (b.vx === 0 && b.vy === 0)))
        resolve(s);
    } else if (s.elapsed >= s.deadline) autoShot(s);
  },
  done: (s) => s.ended,
  result: (s) => rank(s.scores),
  snapshot(s, id) {
    return {
      engine: "pool",
      elapsed: s.elapsed,
      players: s.players,
      scores: s.scores,
      turn: shooter(s)?.id,
      balls: s.balls.map((b) => ({
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        out: b.out,
      })),
      groups: s.groups,
      moving: s.moving,
      hand: s.hand,
      deadline: s.deadline,
      message: s.message,
      you: id,
      table: {
        w: POOL.width,
        h: POOL.height,
        r: POOL.radius,
        pocket: POOL.pocket,
      },
    };
  },
};
