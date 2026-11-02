import type { Level, Box, Vec3 } from "./model.js";
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generateLevel(id: string, seed: number): Level {
  const rng = random(seed);
  let next = 0;
  const boxes: Box[] = [];
  const level: Level = {
    boxes,
    spawns: [],
    waypoints: [],
    pickups: [],
    killY: -8,
    exit: { x: 0, y: 0, z: -20 },
    bounds: 50,
    seed,
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color = "#7b91a2",
    kind: Box["kind"] = "solid",
    extra: Partial<Box> = {},
  ) => {
    const b: Box = { id: next++, x, y, z, w, h, d, color, kind, ...extra };
    boxes.push(b);
    return b;
  };
  const pickup = (kind: Level["pickups"][number]["kind"], p: Vec3) =>
    level.pickups.push({ ...p, id: level.pickups.length, kind, active: true });
  const spawns = (radius: number, y = 0) => {
    level.spawns = Array.from({ length: 8 }, (_, i) => ({
      x: Math.cos((i * Math.PI) / 4) * radius,
      y,
      z: Math.sin((i * Math.PI) / 4) * radius,
    }));
  };
  if (id === "chat.pool-party-brawl") {
    level.killY = -0.6;
    level.bounds = 17;
    box(0, -1.1, 0, 36, 0.1, 36, "#2facc5", "rail");
    for (let i = 0; i < 17; i++) {
      const a = (i * Math.PI) / 4,
        r = i === 16 ? 0 : i < 8 ? 4.8 : 10;
      box(
        Math.cos(a) * r,
        -0.25,
        Math.sin(a) * r,
        3.8,
        0.5,
        3.8,
        i % 2 ? "#ffb86b" : "#5aa9ff",
        i >= 8 && i % 2 ? "moving" : "solid",
        { axis: "y", amplitude: i >= 8 ? 0.35 : 0, period: 5 },
      );
    }
    spawns(4.8, 0.2);
    level.waypoints = level.spawns.map((p) => ({ ...p }));
  } else if (id === "sandbox.parkour-run") {
    box(0, -0.5, 0, 12, 1, 12, "#6bdc8b");
    spawns(2, 0.1);
    level.bounds = 60;
    level.killY = -5;
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI) / 2;
      const p = {
        x: Math.cos(angle) * 4,
        y: 1.2 + i * 1.2,
        z: -Math.sin(angle) * 4 - i * 0.65,
      };
      box(
        p.x,
        p.y - 0.25,
        p.z,
        3.4,
        0.5,
        3.4,
        i % 4 ? "#5aa9ff" : "#ffd84d",
        i % 7 === 6 ? "moving" : "solid",
        { axis: "x", amplitude: 0.5, period: 4 },
      );
      level.waypoints.push({
        ...p,
        kind: i % 4 === 3 ? "checkpoint" : i % 8 === 5 ? "zipline" : undefined,
      });
    }
    level.exit = { ...level.waypoints.at(-1)! };
    level.waypoints.at(-1)!.kind = "finish";
    for (let i = 0; i < 8; i++) box(-7, i * 4, -i * 2, 1, 7, 6, "#a9b5c7");
  } else if (id === "arcade.kart-dash") {
    level.bounds = 45;
    level.killY = -6;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const p = {
        x: Math.sin(a) * 24,
        y: Math.sin(a * 2) * 1.2,
        z: Math.cos(a) * 24,
      };
      box(p.x, p.y - 0.5, p.z, 10, 1, 10, i % 8 === 0 ? "#ffd84d" : "#68758b");
      level.waypoints.push({ ...p, kind: i === 63 ? "finish" : "checkpoint" });
      if (i % 8 === 0) pickup("boost", { ...p, y: p.y + 1 });
      if (i % 13 === 0) pickup(i % 2 ? "oil" : "shell", { ...p, y: p.y + 1 });
    }
    level.spawns = Array.from({ length: 8 }, (_, i) => ({
      x: (i % 2) * 2 - 1,
      y: 2,
      z: 24 + Math.floor(i / 2) * 1.3,
    }));
    level.exit = { ...level.waypoints[63] };
  } else if (id === "other.rail-rush") {
    level.bounds = 400;
    level.killY = -10;
    spawns(1, 0.1);
    for (let i = 0; i < 100; i++) {
      const p = { x: Math.sin(i * 0.17) * 12, y: Math.sin(i * 0.1), z: -i * 4 },
        section = i % 20,
        forkOffset =
          section > 0 && section < 10
            ? Math.sin((section / 10) * Math.PI) * 6
            : 0;
      for (const offset of forkOffset ? [-forkOffset, forkOffset] : [0]) {
        box(
          p.x + offset,
          p.y - 0.4,
          p.z,
          forkOffset ? 5 : 8,
          0.8,
          6,
          "#695846",
        );
        box(
          p.x + offset - 1.6,
          p.y + 0.05,
          p.z,
          0.15,
          0.15,
          6,
          "#b6bec9",
          "rail",
        );
        box(
          p.x + offset + 1.6,
          p.y + 0.05,
          p.z,
          0.15,
          0.15,
          6,
          "#b6bec9",
          "rail",
        );
      }
      if (i % 15 > 8 && !forkOffset) {
        box(p.x - 4, p.y + 2, p.z, 1, 5, 6);
        box(p.x + 4, p.y + 2, p.z, 1, 5, 6);
        box(p.x, p.y + 4.7, p.z, 8, 0.5, 6);
      }
      level.waypoints.push({
        ...p,
        kind: section === 19 ? "switch" : "checkpoint",
        forkOffset,
      });
    }
    level.exit = { ...level.waypoints.at(-1)! };
  } else if (id === "horror.lights-out" || id === "rpg.dungeon-delve") {
    const dungeon = id === "rpg.dungeon-delve",
      rooms = dungeon ? 7 : 4;
    level.bounds = rooms * 22;
    box(0, -0.5, -(rooms - 1) * 11, 26, 1, rooms * 22, "#4a4857");
    spawns(3, 0.1);
    for (let i = 0; i < rooms; i++) {
      const z = -i * 22;
      box(-13, 2, z, 1, 5, 22);
      box(13, 2, z, 1, 5, 22);
      if (i < rooms - 1) {
        box(-8, 2, z - 11, 10, 5, 1);
        box(8, 2, z - 11, 10, 5, 1);
        if (dungeon)
          box(0, 1.5, z - 11, 6, 3, 1, "#ad8549", "door", { id: 500 + i });
      }
      for (let j = 0; j < 3; j++)
        box((rng() - 0.5) * 17, 1, z + (rng() - 0.5) * 12, 2, 2, 2, "#6b5c66");
      level.waypoints.push({ x: 0, y: 0, z, kind: "checkpoint" });
      if (!dungeon && i > 0) pickup("fuse", { x: 7, y: 0.7, z });
      if (dungeon) {
        pickup("chest", { x: 8, y: 0.7, z });
        box(-6, 0.05, z - 4, 2, 0.1, 2, "#ff5a5a", "solid", { id: 920 + i });
      }
    }
    box(0, 2, 11, 26, 5, 1);
    box(0, 2, -(rooms - 1) * 22 - 11, 26, 5, 1);
    level.exit = { x: 0, y: 0, z: -(rooms - 1) * 22 - 7 };
  } else if (id === "duel" || id === "zombies") {
    const duel = id === "duel",
      size = duel ? 44 : 72,
      half = size / 2;
    level.bounds = half;
    box(0, -0.5, 0, size, 1, size, duel ? "#6c7580" : "#6b7a58");
    // perimeter wall
    box(0, 2.5, -half, size + 1, 5, 1, "#59606b");
    box(0, 2.5, half, size + 1, 5, 1, "#59606b");
    box(-half, 2.5, 0, 1, 5, size + 1, "#59606b");
    box(half, 2.5, 0, 1, 5, size + 1, "#59606b");
    const spare = (x: number, z: number, r: number) =>
      boxes.every((b) => b.h < 0.2 || Math.abs(x - b.x) > b.w / 2 + r || Math.abs(z - b.z) > b.d / 2 + r);
    if (duel) {
      // a cover map: pillars, a low cross to vault, L-shaped walls to hide behind and crates between
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          box(sx * 6, 2, sz * 6, 2, 4, 2, "#8a8f98");
          box(sx * 13, 1.5, sz * 8, 8, 3, 0.8, "#7d838d");
          box(sx * 16.5, 1.5, sz * 11.6, 0.8, 3, 7.4, "#7d838d");
          box(sx * 9, 0.6, sz * 15, 5, 1.2, 0.8, "#a5a9b0");
        }
      box(0, 0.6, 0, 11, 1.2, 1, "#a5a9b0");
      box(0, 0.6, 0, 1, 1.2, 11, "#a5a9b0");
      box(0, 3, 10, 7, 6, 1, "#7d838d");
      box(0, 3, -10, 7, 6, 1, "#7d838d");
      let tries = 0;
      for (let i = 0; i < 10 && tries < 200; tries++) {
        const x = (rng() - 0.5) * 30, z = (rng() - 0.5) * 30;
        if (Math.hypot(x, z) < 4 || !spare(x, z, 2.2)) continue;
        box(x, 1, z, 2, 2, 2, "#9b7b52");
        i++;
      }
      level.spawns = [
        [-18, -18], [18, -18], [-18, 18], [18, 18], [-19, 0], [19, 0], [0, -19], [0, 19],
      ].map(([x, z]) => ({ x, y: 0.1, z }));
      pickup("medkit", { x: 0, y: 0.7, z: 3 });
      pickup("armor", { x: 0, y: 0.7, z: -3 });
      pickup("ammo", { x: 11, y: 0.7, z: 0 });
      pickup("ammo", { x: -11, y: 0.7, z: 0 });
    } else {
      // ruined buildings with doorways, barricades and wrecks to fight around
      for (const [cx, cz] of [[-20, 0], [20, 0], [0, -20], [0, 20]]) {
        const horizontal = cz === 0;
        box(cx - (horizontal ? 0 : 0), 1.7, cz - 7, 14, 3.4, 0.8, "#7c7f86");
        box(cx, 1.7, cz + 7, 14, 3.4, 0.8, "#7c7f86");
        box(cx - 7, 1.7, cz, 0.8, 3.4, 14, "#7c7f86");
        box(cx + 7, 1.7, cz - 4.2, 0.8, 3.4, 5.6, "#7c7f86");
        box(cx + 7, 1.7, cz + 4.2, 0.8, 3.4, 5.6, "#7c7f86");
        box(cx, 0.9, cz, 3, 1.8, 3, "#9b7b52");
        pickup(horizontal ? "ammo" : "medkit", { x: cx, y: 0.7, z: cz + 2.5 });
      }
      let tries = 0;
      for (let i = 0; i < 26 && tries < 600; tries++) {
        const x = (rng() - 0.5) * (size - 8), z = (rng() - 0.5) * (size - 8);
        if (Math.hypot(x, z) < 6 || !spare(x, z, 2.6)) continue;
        if (i % 2) box(x, 0.6, z, 6, 1.2, 0.8, "#a5a9b0", "solid");
        else box(x, 1, z, 2.2, 2, 2.2, "#9b7b52");
        if (i % 6 === 0) pickup(["ammo", "armor", "medkit"][(i / 6) % 3] as "ammo" | "armor" | "medkit", { x: x + 2.5, y: 0.7, z });
        i++;
      }
      spawns(3, 0.1);
    }
    level.waypoints = level.spawns.map((p) => ({ ...p }));
  } else {
    const size =
      id === "strategy.lane-push"
        ? 60
        : id === "shooter.last-drop"
          ? 80
          : id === "zombies"
            ? 64
            : id === "duel"
              ? 40
              : 36;
    level.bounds = size / 2;
    box(0, -0.5, 0, size, 1, size, "#7caa79");
    spawns(size * 0.3, 0.1);
    if (id === "creative.paint-wars") {
      for (let i = 0; i < 3; i++) {
        box(
          (i - 1) * 9,
          i * 3 - 0.3,
          -6,
          8,
          0.6,
          12,
          ["#f56bd6", "#5aa9ff", "#ffd84d"][i],
        );
        if (i < 2)
          box((i - 1) * 9 + 5, i * 3 + 1.2, -6, 10, 3, 4, "#ba9cae", "ramp", {
            rise: 3,
            axis: "x",
          });
        box((i - 1) * 9, i * 3 + 1.5, -12, 7, 3, 0.5, "#c5a6c3");
      }
    } else if (id === "strategy.lane-push") {
      for (let team = 0; team < 2; team++) {
        for (let lane = 0; lane < 3; lane++)
          box(
            (team ? 1 : -1) * 18,
            1.5,
            (lane - 1) * 15,
            2,
            3,
            2,
            team ? "#ef83bf" : "#5aa9ff",
            "solid",
            { id: 100 + team * 3 + lane },
          );
        box(
          (team ? 1 : -1) * 26,
          2,
          0,
          4,
          4,
          5,
          team ? "#ef83bf" : "#5aa9ff",
          "solid",
          { id: 110 + team },
        );
      }
      level.spawns = Array.from({ length: 8 }, (_, i) => ({
        x: (i % 2 ? 1 : -1) * 24,
        y: 0.1,
        z: (Math.floor(i / 2) - 1.5) * 4,
      }));
    } else {
      for (let i = 0; i < 20; i++) {
        const x = (rng() - 0.5) * (size - 12),
          z = (rng() - 0.5) * (size - 12);
        if (Math.hypot(x, z) > size * 0.26 && Math.hypot(x, z) < size * 0.35)
          continue;
        box(x, 1.5, z, 2 + rng() * 4, 3, 2 + rng() * 4, "#b0b8c2");
        if (i % 2 === 0)
          pickup(
            ["ammo", "armor", "medkit"][i % 3] as "ammo" | "armor" | "medkit",
            { x: x + 4, y: 0.7, z },
          );
      }
    }
    level.waypoints = level.spawns.map((p) => ({ ...p }));
  }
  if (boxes.length > 600) throw new Error("Level box budget exceeded");
  return level;
}
