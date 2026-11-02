import { current, advance, allowed, type Rule } from "../model.js";
export const dig: Rule = {
  init(s, rng) {
    s.board = Array.from({ length: 64 }, () => (rng() < 0.18 ? 1 : 0));
  },
  legal(s, id) {
    if (id !== current(s)) return [];
    return [
      ...Array.from({ length: 64 }, (_, to) => ({ action: "dig", to })).filter(
        (m) => s.recipe[String(m.to)] === undefined,
      ),
      ...Array.from({ length: 8 }, (_, choice) => ({ action: "scan", choice })),
    ];
  },
  apply(s, id, m) {
    if (!allowed(dig, s, id, m)) return false;
    if (m.action === "dig") {
      s.recipe[String(m.to)] = s.board[m.to!];
      s.scores[id] += s.board[m.to!] ? 100 : 1;
    } else {
      s.secrets[id] =
        `Row ${m.choice}: ${s.board.slice(m.choice! * 8, m.choice! * 8 + 8).reduce((a, b) => a + b, 0)} treasures`;
    }
    advance(s);
    if (Object.keys(s.recipe).length === 64) s.ended = true;
    return true;
  },
  view(s, id) {
    return { dug: s.recipe, scan: s.secrets[id] };
  },
};
