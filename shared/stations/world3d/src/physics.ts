import {
  RADIUS,
  HEIGHT,
  GRAVITY,
  JUMP,
  WALK,
  SPRINT,
  type Body,
  type Box,
  type Vec3,
  type Input3D,
  type Hit,
} from "./model.js";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function validateInput(v: unknown): Input3D | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (
    !Number.isSafeInteger(p.seq) ||
    Number(p.seq) < 0 ||
    !Array.isArray(p.move) ||
    p.move.length !== 2 ||
    ![p.dt, p.yaw, p.pitch, ...p.move].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  )
    return null;
  if (
    ["jump", "sprint", "primary", "secondary", "interact"].some(
      (k) => typeof p[k] !== "boolean",
    )
  )
    return null;
  const x = Number(p.move[0]),
    z = Number(p.move[1]);
  if (Math.hypot(x, z) > 1.01 || Number(p.dt) <= 0) return null;
  return {
    seq: Number(p.seq),
    dt: clamp(Number(p.dt), 0.001, 0.05),
    move: [x, z],
    yaw: Math.atan2(Math.sin(Number(p.yaw)), Math.cos(Number(p.yaw))),
    pitch: clamp(Number(p.pitch), -1.45, 1.45),
    jump: p.jump as boolean,
    sprint: p.sprint as boolean,
    primary: p.primary as boolean,
    secondary: p.secondary as boolean,
    interact: p.interact as boolean,
  };
}
export function createBody(p: Vec3, team = 0): Body {
  return {
    ...p,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    grounded: false,
    seq: -1,
    checkpoint: { ...p },
    hp: 100,
    armor: 0,
    ammo: 30,
    alive: true,
    team,
    score: 0,
    cooldown: 0,
    abilityAt: 0,
    torch: 100,
    fuses: 0,
    progress: 0,
    lap: 0,
    finish: null,
    drift: 0,
    boost: 0,
    rail: 0,
    role: "",
    item: "",
    zip: -1,
  };
}
export function boxAt(b: Box, time: number): Box {
  if (b.kind !== "moving") return b;
  const offset =
    Math.sin((time * 2 * Math.PI) / (b.period ?? 4)) * (b.amplitude ?? 2);
  return { ...b, [b.axis ?? "x"]: b[b.axis ?? "x"] + offset };
}
export function stepBody(
  body: Body,
  input: Input3D,
  boxes: Box[],
  dt: number,
  time: number,
  speed?: number,
) {
  const seconds = clamp(dt, 0, 0.05);
  body.yaw = input.yaw;
  body.pitch = input.pitch;
  const limit = speed ?? (input.sprint ? SPRINT : WALK);
  const sin = Math.sin(input.yaw),
    cos = Math.cos(input.yaw);
  body.vx = (input.move[0] * cos - input.move[1] * sin) * limit;
  body.vz = (-input.move[0] * sin - input.move[1] * cos) * limit;
  if (input.jump && body.grounded) {
    body.vy = JUMP;
    body.grounded = false;
  }
  body.vy = clamp(body.vy - GRAVITY * seconds, -60, JUMP);
  const steps = Math.max(
    1,
    Math.ceil((Math.hypot(body.vx, body.vy, body.vz) * seconds) / 0.12),
  );
  const h = seconds / steps;
  let supported = false;
  for (let i = 0; i < steps; i++) {
    const oldY = body.y;
    body.x += body.vx * h;
    body.y += body.vy * h;
    body.z += body.vz * h;
    for (const source of boxes) {
      let b = boxAt(source, time);
      if (b.kind === "rail") continue;
      if (b.kind === "ramp") {
        if (
          body.x < b.x - b.w / 2 - RADIUS ||
          body.x > b.x + b.w / 2 + RADIUS ||
          body.z < b.z - b.d / 2 - RADIUS ||
          body.z > b.z + b.d / 2 + RADIUS
        )
          continue;
        const t = clamp(
            ((b.axis === "z" ? body.z - b.z : body.x - b.x) +
              (b.axis === "z" ? b.d : b.w) / 2) /
              (b.axis === "z" ? b.d : b.w),
            0,
            1,
          ),
          bottom = b.y - b.h / 2,
          top = bottom + (b.rise ?? b.h) * t;
        if (body.vy <= 0 && oldY >= top - 0.35 && body.y < top) {
          body.y = top;
          body.vy = 0;
          supported = true;
          continue;
        }
        if (top - bottom < 0.001) continue;
        b = { ...b, kind: "solid", y: (bottom + top) / 2, h: top - bottom };
      }
      const top = b.y + b.h / 2;
      if (
        body.vy <= 0 &&
        top >= oldY &&
        top - oldY <= 0.3 &&
        Math.abs(body.x - b.x) < b.w / 2 &&
        Math.abs(body.z - b.z) < b.d / 2
      ) {
        body.y = top;
        body.vy = 0;
        supported = true;
      }
      const loY = body.y + RADIUS,
        hiY = body.y + HEIGHT - RADIUS;
      const cx = clamp(body.x, b.x - b.w / 2, b.x + b.w / 2),
        cz = clamp(body.z, b.z - b.d / 2, b.z + b.d / 2);
      const cy = clamp(
        b.y > hiY ? hiY : b.y < loY ? loY : b.y,
        b.y - b.h / 2,
        b.y + b.h / 2,
      );
      const py = clamp(cy, loY, hiY),
        dx = body.x - cx,
        dy = py - cy,
        dz = body.z - cz,
        distance = Math.hypot(dx, dy, dz);
      if (distance >= RADIUS) continue;
      if (distance > 1e-8) {
        const penetration = RADIUS - distance;
        body.x += (dx / distance) * penetration;
        body.y += (dy / distance) * penetration;
        body.z += (dz / distance) * penetration;
        if (dy / distance > 0.5) {
          if (body.vy <= 0) {
            body.vy = 0;
            supported = true;
          }
        } else if (dy / distance < -0.5 && body.vy > 0) body.vy = 0;
      } else {
        const options = [
          { depth: b.y + b.h / 2 - body.y, axis: "y", sign: 1 },
          { depth: body.y + HEIGHT - (b.y - b.h / 2), axis: "y", sign: -1 },
          { depth: b.x + b.w / 2 + RADIUS - body.x, axis: "x", sign: 1 },
          { depth: body.x - (b.x - b.w / 2 - RADIUS), axis: "x", sign: -1 },
          { depth: b.z + b.d / 2 + RADIUS - body.z, axis: "z", sign: 1 },
          { depth: body.z - (b.z - b.d / 2 - RADIUS), axis: "z", sign: -1 },
        ].sort((a, b) => a.depth - b.depth);
        const correction = options[0];
        if (correction.axis === "y") {
          body.y += correction.depth * correction.sign;
          body.vy = 0;
          if (correction.sign > 0) supported = true;
        } else if (correction.axis === "x")
          body.x += correction.depth * correction.sign;
        else body.z += correction.depth * correction.sign;
      }
    }
  }
  body.grounded = supported;
  body.seq = input.seq;
}
export function aim(yaw: number, pitch: number): Vec3 {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}
export function rayBox(origin: Vec3, dir: Vec3, b: Box, max = 100): Hit | null {
  if (b.kind === "ramp") return rayRamp(origin, dir, b, max);
  let near = 0,
    far = max,
    normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (const axis of ["x", "y", "z"] as const) {
    const half = (axis === "x" ? b.w : axis === "y" ? b.h : b.d) / 2,
      lo = b[axis] - half,
      hi = b[axis] + half;
    if (Math.abs(dir[axis]) < 1e-9) {
      if (origin[axis] < lo || origin[axis] > hi) return null;
      continue;
    }
    let a = (lo - origin[axis]) / dir[axis],
      c = (hi - origin[axis]) / dir[axis],
      sign = -1;
    if (a > c) {
      [a, c] = [c, a];
      sign = 1;
    }
    if (a > near) {
      near = a;
      normal = { x: 0, y: 0, z: 0 };
      normal[axis] = sign;
    }
    far = Math.min(far, c);
    if (near > far) return null;
  }
  return near <= max && far >= 0
    ? { distance: near, normal, boxId: b.id }
    : null;
}
export function rayCapsule(
  origin: Vec3,
  dir: Vec3,
  body: Body,
  max = 100,
): number | null {
  const ox = origin.x - body.x,
    oz = origin.z - body.z,
    a = dir.x * dir.x + dir.z * dir.z,
    b = 2 * (ox * dir.x + oz * dir.z),
    c = ox * ox + oz * oz - RADIUS * RADIUS;
  let best = Infinity;
  if (a > 1e-9) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0)
      for (const t of [
        (-b - Math.sqrt(disc)) / (2 * a),
        (-b + Math.sqrt(disc)) / (2 * a),
      ]) {
        const y = origin.y + dir.y * t;
        if (t >= 0 && y >= body.y + RADIUS && y <= body.y + HEIGHT - RADIUS)
          best = Math.min(best, t);
      }
  }
  for (const cy of [body.y + RADIUS, body.y + HEIGHT - RADIUS]) {
    const oy = origin.y - cy,
      dot = ox * dir.x + oy * dir.y + oz * dir.z,
      disc = dot * dot - (ox * ox + oy * oy + oz * oz - RADIUS * RADIUS);
    if (disc >= 0) {
      const t = -dot - Math.sqrt(disc);
      if (t >= 0) best = Math.min(best, t);
    }
  }
  return best <= max ? best : null;
}
export function raycast(
  origin: Vec3,
  dir: Vec3,
  boxes: Box[],
  players: Record<string, Body>,
  exclude: string,
  max = 100,
  time = 0,
): Hit | null {
  let closest: Hit | null = null;
  for (const b of boxes) {
    const hit = rayBox(origin, dir, boxAt(b, time), closest?.distance ?? max);
    if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
  }
  for (const [id, body] of Object.entries(players)) {
    if (id === exclude || !body.alive) continue;
    const distance = rayCapsule(origin, dir, body, closest?.distance ?? max);
    if (distance !== null)
      closest = { distance, normal: { x: 0, y: 0, z: 0 }, playerId: id };
  }
  return closest;
}
export function reconcile(
  authoritative: Body,
  pending: Input3D[],
  boxes: Box[],
  time: number,
  speed?: number,
  gameId?: string,
  points: import("./model.js").Waypoint[] = [],
): Body {
  const predicted = {
    ...authoritative,
    checkpoint: { ...authoritative.checkpoint },
  };
  for (const input of pending)
    if (input.seq > authoritative.seq) {
      time += input.dt;
      if (predicted.zip >= 0) {
        stepZip(predicted, points, input.dt);
        predicted.seq = input.seq;
      } else if (gameId === "other.rail-rush")
        stepRail(predicted, input, points, input.dt, time);
      else
        stepBody(
          predicted,
          gameId === "arcade.kart-dash" ? { ...input, jump: false } : input,
          boxes,
          input.dt,
          time,
          speed,
        );
    }
  return predicted;
}

export function stepRail(
  body: Body,
  input: Input3D,
  points: import("./model.js").Waypoint[],
  dt: number,
  time: number,
): boolean {
  const original =
    points[Math.min(points.length - 1, Math.floor(body.progress))];
  if (!original) return false;
  if (original.kind === "switch" && input.interact && input.move[0])
    body.rail = Math.sign(input.move[0]);
  const next = {
    ...original,
    x: original.x + (original.forkOffset ?? 0) * (body.rail > 0 ? 1 : -1),
  };
  body.seq = input.seq;
  body.yaw = input.yaw;
  body.pitch = input.pitch;
  const dx = next.x - body.x,
    dz = next.z - body.z,
    d = Math.hypot(dx, dz);
  body.drift =
    input.primary || input.jump
      ? Math.min(20, body.drift + dt * 14)
      : Math.max(3, body.drift - dt * 2);
  if (d < 2.5) {
    body.progress++;
    body.checkpoint = { ...next };
  } else {
    const speed = body.drift || 3;
    body.vx = (dx / Math.max(0.01, d)) * speed;
    body.vz = (dz / Math.max(0.01, d)) * speed;
    body.x += body.vx * dt;
    body.z += body.vz * dt;
    body.y = next.y;
  }
  return body.progress >= points.length;
}

export function stepZip(
  body: Body,
  points: import("./model.js").Waypoint[],
  dt: number,
): boolean {
  const target = points[body.zip];
  if (!target) return false;
  const dx = target.x - body.x,
    dy = target.y + 1 - body.y,
    dz = target.z - body.z,
    d = Math.hypot(dx, dy, dz);
  if (d < 0.6) {
    body.progress = body.zip;
    body.zip = -1;
    body.vy = 0;
    return false;
  }
  const speed = Math.min(14, d / Math.max(0.001, dt));
  body.vx = (dx / d) * speed;
  body.vy = (dy / d) * speed;
  body.vz = (dz / d) * speed;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.z += body.vz * dt;
  return true;
}

function rayRamp(origin: Vec3, dir: Vec3, b: Box, max: number): Hit | null {
  const axis = b.axis === "z" ? "z" : "x",
    length = axis === "x" ? b.w : b.d,
    minimum = b[axis] - length / 2,
    bottom = b.y - b.h / 2,
    slope = (b.rise ?? b.h) / length;
  const planes: { n: Vec3; d: number }[] = [
    { n: { x: 1, y: 0, z: 0 }, d: b.x + b.w / 2 },
    { n: { x: -1, y: 0, z: 0 }, d: -b.x + b.w / 2 },
    { n: { x: 0, y: 0, z: 1 }, d: b.z + b.d / 2 },
    { n: { x: 0, y: 0, z: -1 }, d: -b.z + b.d / 2 },
    { n: { x: 0, y: -1, z: 0 }, d: -bottom },
    {
      n: { x: axis === "x" ? -slope : 0, y: 1, z: axis === "z" ? -slope : 0 },
      d: bottom - slope * minimum,
    },
  ];
  let near = 0,
    far = max,
    normal: Vec3 = { x: 0, y: 1, z: 0 };
  for (const { n, d } of planes) {
    const speed = n.x * dir.x + n.y * dir.y + n.z * dir.z,
      remaining = d - (n.x * origin.x + n.y * origin.y + n.z * origin.z);
    if (Math.abs(speed) < 1e-9) {
      if (remaining < 0) return null;
      continue;
    }
    const t = remaining / speed;
    if (speed < 0) {
      if (t > near) {
        near = t;
        const length = Math.hypot(n.x, n.y, n.z);
        normal = { x: n.x / length, y: n.y / length, z: n.z / length };
      }
    } else far = Math.min(far, t);
    if (near > far) return null;
  }
  return near <= max && far >= 0
    ? { distance: near, normal, boxId: b.id }
    : null;
}
