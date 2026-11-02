import type { BaseState } from "../common.js";
export type Move = {
  action: string;
  from?: number;
  to?: number;
  choice?: number;
  text?: string;
  target?: string;
};
export type TableState = BaseState & {
  turn: number;
  round: number;
  deadline: number;
  board: number[];
  hands: Record<string, number[]>;
  secrets: Record<string, string>;
  bid: { count: number; face: number; by: string };
  history: string[];
  moves: number;
  ready: Record<string, Move>;
  clues: Record<string, number[]>;
  cards: number[];
  phrase: string;
  emotes: string[];
  recipe: Record<string, number>;
  lastMove: number;
};
export type Rule = {
  init(s: TableState, rng: () => number): void;
  legal(s: TableState, id: string): Move[];
  apply(s: TableState, id: string, m: Move): boolean;
  view?(s: TableState, id: string): Record<string, unknown>;
};
export const current = (s: TableState) =>
  s.players[s.turn % s.players.length]?.id;
export function advance(s: TableState) {
  s.turn = (s.turn + 1) % s.players.length;
  s.moves++;
  if (!s.turn) s.round++;
  s.deadline = s.elapsed + Number(s.def.config.turnSeconds ?? 30);
}
export function matches(a: Move, b: Move) {
  return (
    a.action === b.action &&
    a.from === b.from &&
    a.to === b.to &&
    a.choice === b.choice &&
    a.target === b.target
  );
}
export function allowed(rule: Rule, s: TableState, id: string, m: Move) {
  return rule.legal(s, id).some((a) => matches(a, m));
}
