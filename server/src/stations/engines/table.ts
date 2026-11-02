import {
  base,
  time,
  rank,
  mulberry32,
  text,
  record,
  clean,
  finite,
  type Engine,
} from "./common.js";
import {
  advance,
  current,
  type TableState,
  type Rule,
  type Move,
} from "./table/model.js";
import { charades } from "./table/rules/charades.js";
import { remix } from "./table/rules/remix.js";
import { gambit } from "./table/rules/gambit.js";
import { bluffDice } from "./table/rules/bluff-dice.js";
import { barter } from "./table/rules/barter.js";
import { sitePlan } from "./table/rules/site-plan.js";
import { seance } from "./table/rules/seance.js";
import { dig } from "./table/rules/dig.js";
import { chess } from "./table/rules/chess.js";
import { townHall } from "./table/rules/town-hall.js";
export const rules: Record<string, Rule> = {
  charades,
  remix,
  gambit,
  chess,
  "bluff-dice": bluffDice,
  barter,
  "site-plan": sitePlan,
  seance,
  dig,
  "town-hall": townHall,
};
const rule = (s: TableState) => rules[text(s.def, "rules", "dig")];
export const table: Engine<TableState, unknown> = {
  init(def, players, seed) {
    const s: TableState = {
      ...base(def, players),
      turn: 0,
      round: 0,
      deadline: 30,
      board: [],
      hands: Object.fromEntries(players.map((p) => [p.id, []])),
      secrets: {},
      bid: { count: 0, face: 0, by: "" },
      history: [],
      moves: 0,
      ready: {},
      clues: {},
      cards: [],
      phrase: "",
      emotes: [],
      recipe: {},
      lastMove: 0,
    };
    if (!rule(s)) throw new Error("Unknown table rules");
    rule(s).init(s, mulberry32(seed));
    return s;
  },
  input(s, id, input) {
    if (!s.players.some((p) => p.id === id)) return;
    const v = record(input);
    if (!v || typeof v.action !== "string") return;
    const move: Move = { action: v.action };
    for (const k of ["from", "to", "choice"] as const)
      if (finite(v[k]) && Number.isInteger(v[k])) move[k] = v[k];
    if (typeof v.target === "string") move.target = v.target;
    if (typeof v.text === "string") move.text = clean(v.text);
    if (s.elapsed - (s.lastMove ?? -1) < 0.12) return;
    if (rule(s).apply(s, id, move)) {
      s.lastMove = s.elapsed;
      s.history = s.history.slice(-20);
    }
  },
  tick(s, dt) {
    time(s, dt);
    if (s.elapsed >= s.deadline) {
      if (s.def.config.rules === "site-plan") {
        for (const p of s.players)
          if (!s.ready[p.id])
            rule(s).apply(s, p.id, {
              action: "position",
              choice: (s.round + s.turn) % 9,
            });
      } else advance(s);
      s.deadline = s.elapsed + Number(s.def.config.turnSeconds ?? 30);
    }
  },
  done: (s) => s.ended,
  result: (s) => rank(s.scores),
  snapshot(s, id) {
    const secretBoard = ["dig", "seance"].includes(text(s.def, "rules", ""));
    return {
      engine: "table",
      elapsed: s.elapsed,
      players: s.players,
      scores: s.scores,
      turn: current(s),
      round: s.round,
      deadline: s.deadline,
      board: secretBoard ? [] : s.board,
      hand: s.hands[id] ?? [],
      bid: s.bid,
      history: s.history,
      cards: s.cards,
      legal: rule(s).legal(s, id),
      ...rule(s).view?.(s, id),
    };
  },
};
