import { gambit } from "./gambit.js";
import type { Rule } from "../model.js";
/** Plain chess: the Gambit board and legal-move rules, with no capture cards. */
export const chess: Rule = {
  ...gambit,
  init(s, rng) {
    gambit.init(s, rng);
    s.cards = [];
    s.deadline = Number(s.def.config.turnSeconds ?? 90);
  },
};
