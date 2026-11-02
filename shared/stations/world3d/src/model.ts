export type Vec3 = { x: number; y: number; z: number };
export type Box = {
  id: number;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  kind: "solid" | "ramp" | "moving" | "door" | "rail";
  rise?: number;
  axis?: "x" | "y" | "z";
  amplitude?: number;
  period?: number;
};
export type Input3D = {
  seq: number;
  dt: number;
  move: [number, number];
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  primary: boolean;
  secondary: boolean;
  interact: boolean;
};
export type Body = Vec3 & {
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  seq: number;
  checkpoint: Vec3;
  hp: number;
  armor: number;
  ammo: number;
  alive: boolean;
  team: number;
  score: number;
  cooldown: number;
  abilityAt: number;
  torch: number;
  fuses: number;
  progress: number;
  lap: number;
  finish: number | null;
  drift: number;
  boost: number;
  rail: number;
  role: string;
  item: string;
  zip: number;
};
export type Pickup = Vec3 & {
  id: number;
  kind:
    "ammo" | "armor" | "medkit" | "fuse" | "chest" | "boost" | "oil" | "shell";
  active: boolean;
};
export type Waypoint = Vec3 & {
  kind?: "checkpoint" | "zipline" | "switch" | "finish";
  forkOffset?: number;
};
export type Level = {
  boxes: Box[];
  spawns: Vec3[];
  waypoints: Waypoint[];
  pickups: Pickup[];
  killY: number;
  exit: Vec3;
  bounds: number;
  seed: number;
};
export type Hit = {
  distance: number;
  normal: Vec3;
  boxId?: number;
  playerId?: string;
};
export const RADIUS = 0.4,
  HEIGHT = 1.8,
  GRAVITY = 22,
  JUMP = 8,
  WALK = 5,
  SPRINT = 8;
