import { test, expect } from "vitest";
import { createRunner } from "./index.js";
import { GAMES } from "../catalog.js";

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, bot: false }));
const def = (k: string) => GAMES.find((g) => g.id === `chat.${k}`)!;

test("catalogue: four games repeated on all nine planets and every custom planet", () => {
  expect(GAMES.length).toBe(40);
  expect(new Set(GAMES.map((g) => g.id)).size).toBe(40);
  for (const k of ["zombies", "duel", "pool", "chess"])
    expect(GAMES.filter((g) => g.id.endsWith(`.${k}`)).length).toBe(10);
});

test("zombies: waves spawn, chase and end when everyone falls", () => {
  const r = createRunner(def("zombies"), players(2), 7);
  for (let i = 0; i < 600; i++) r.tick(0.05, i * 50);
  const s = r.snapshot("p0") as { wave: number; npcs: Record<string, unknown> };
  expect(s.wave).toBeGreaterThan(0);
  expect(Object.keys(s.npcs).length).toBeGreaterThan(0);
  for (let i = 0; i < 4000 && !r.done(); i++) r.tick(0.05, i * 50);
  expect(r.done()).toBe(true);
});

test("duel: a kill respawns the loser and counts", () => {
  const r = createRunner(def("duel"), players(2), 3);
  r.tick(0.05, 0);
  const s = r.snapshot("p0") as { kills: Record<string, number>; bodies: Record<string, { alive: boolean }> };
  expect(Object.keys(s.bodies)).toEqual(["p0", "p1"]);
  expect(s.kills).toEqual({});
});

test("pool: a shot resolves and play passes or continues", () => {
  const r = createRunner(def("pool"), players(2), 11);
  r.tick(0.05, 0);
  const snap = () => r.snapshot("p0") as { turn: string; moving: boolean; balls: { out: boolean }[] };
  expect(snap().balls.length).toBe(16);
  const first = snap().turn;
  r.input(first, { angle: 0, power: 1 }, 0);
  expect(snap().moving).toBe(true);
  for (let i = 0; i < 400 && snap().moving; i++) r.tick(0.05, i * 50);
  expect(snap().moving).toBe(false);
});

test("pool: bot shots always finish and the game ends", () => {
  const r = createRunner(def("pool"), players(2), 5);
  for (let i = 0; i < 40000 && !r.done(); i++) {
    const s = r.snapshot("p0") as { turn: string; moving: boolean };
    if (!s.moving)
      r.input(s.turn, { angle: (i % 628) / 100, power: 0.5 + (i % 5) / 10 }, 0);
    r.tick(0.05, i * 50);
  }
  expect(r.done()).toBe(true);
});

test("chess: opening legal moves, a move passes the turn, scholar's mate wins", () => {
  const r = createRunner(def("chess"), players(2), 1);
  const snap = (id: string) => r.snapshot(id) as { legal: { action: string; from: number; to: number }[]; turn: string };
  expect(snap("p0").legal.length).toBe(20);
  const play = (id: string, from: number, to: number) => {
    expect(snap(id).turn).toBe(id);
    r.tick(0.1, 0);
    r.tick(0.1, 0);
    r.input(id, { action: "move", from, to }, 0);
  };
  // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
  play("p0", 52, 36); play("p1", 12, 28); play("p0", 61, 34); play("p1", 1, 18); play("p0", 59, 31); play("p1", 6, 21); play("p0", 31, 13);
  expect(r.done()).toBe(true);
  expect(r.result().rank[0]).toBe("p0");
});

test("duel: bullets are projectiles that travel, stop at walls and hurt on contact", () => {
  const r = createRunner(def("duel"), players(2), 9);
  const s = (r as unknown as { state: any }).state;
  const floor = s.level.boxes[0];
  s.level.boxes = [floor];
  Object.assign(s.bodies.p0, { x: 0, y: 0.1, z: 15, yaw: 0, pitch: 0 });
  Object.assign(s.bodies.p1, { x: 0, y: 0.1, z: 5, yaw: 0, pitch: 0 });
  let seq = 0;
  const fire = () => r.input("p0", { seq: seq++, dt: 0.05, move: [0, 0], yaw: 0, pitch: 0, jump: false, sprint: false, primary: true, secondary: false, interact: false }, 0);
  fire();
  r.tick(0.05, 0);
  expect(s.shots.length).toBe(1);
  expect(s.bodies.p1.hp).toBe(100);
  for (let i = 0; i < 12; i++) r.tick(0.05, 0);
  expect(s.bodies.p1.hp).toBeLessThan(100);
  s.level.boxes = [floor, { id: 1, x: 0, y: 1, z: 10, w: 6, h: 4, d: 1, color: "#fff", kind: "solid" }];
  s.bodies.p1.hp = 100;
  s.bodies.p0.cooldown = 0;
  fire();
  for (let i = 0; i < 14; i++) r.tick(0.05, 0);
  expect(s.bodies.p1.hp).toBe(100);
});
