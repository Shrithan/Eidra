import { current, advance, allowed, type Rule } from "../model.js";
export const seance: Rule = {
  init(s, rng) {
    s.cards = [0];
    s.board = Array.from({ length: 9 }, () => Math.floor(rng() * 4));
    for (let i = 0; i < s.players.length; i++)
      s.clues[s.players[i].id] = s.board.map((v, j) =>
        j % 3 === i % 3 ? v : -1,
      );
  },
  legal(s, id) {
    if (id !== current(s)) return [{ action: "describe" }];
    return [
      { action: "describe" },
      ...Array.from({ length: 36 }, (_, n) => ({
        action: "symbol",
        to: Math.floor(n / 4),
        choice: n % 4,
      })),
    ];
  },
  apply(s, id, m) {
    if (m.action === "describe" && m.text) {
      s.history.push(`${id}: ${m.text}`);
      return true;
    }
    if (!allowed(seance, s, id, m)) return false;
    if (s.board[m.to!] === m.choice) {
      s.scores[id] += 20;
      s.recipe[String(m.to)] = 1;
    } else s.scores[id] -= 5;
    if (Object.keys(s.recipe).length === 9) {
      s.cards[0]++;
      s.recipe = {};
      for (let i = 0; i < 9; i++)
        s.board[i] = (s.board[i] + i + s.cards[0]) % 4;
      for (let i = 0; i < s.players.length; i++)
        s.clues[s.players[i].id] = s.board.map((v, j) =>
          j % 3 === i % 3 ? v : -1,
        );
      if (s.cards[0] >= 4) s.ended = true;
    }
    advance(s);
    return true;
  },
  view(s, id) {
    return { clues: s.clues[id], solved: s.recipe, ritual: s.cards[0] };
  },
};
