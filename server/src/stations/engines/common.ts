import type {
  GameDef,
  PlayerInfo,
  GameResult,
  Engine,
} from "../../../../shared/stations/model.d.ts";
export type { GameDef, PlayerInfo, GameResult, Engine };
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function record(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
export function number(def: GameDef, key: string, fallback: number) {
  const n = def.config[key];
  return finite(n) ? n : fallback;
}
export function text(def: GameDef, key: string, fallback: string) {
  const s = def.config[key];
  return typeof s === "string" ? s : fallback;
}
export function rank(
  scores: Record<string, number>,
  highlight?: string,
): GameResult {
  return {
    scores: { ...scores },
    rank: Object.keys(scores).sort(
      (a, b) => scores[b] - scores[a] || a.localeCompare(b),
    ),
    highlight,
  };
}
export function clean(v: unknown): string {
  return typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
        .trim()
        .slice(0, 80)
    : "";
}
export type BaseState = {
  def: GameDef;
  players: PlayerInfo[];
  elapsed: number;
  ended: boolean;
  scores: Record<string, number>;
};
export function base(def: GameDef, players: PlayerInfo[]): BaseState {
  return {
    def,
    players: players.map((p) => ({ ...p })),
    elapsed: 0,
    ended: false,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
  };
}
export function time(s: BaseState, dt: number) {
  s.elapsed += clamp(dt, 0, 0.1);
  if (s.elapsed >= s.def.roundSeconds) s.ended = true;
}
