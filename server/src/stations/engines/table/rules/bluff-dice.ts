import { current, advance, allowed, type Rule } from "../model.js";
export const bluffDice: Rule = {
  init(s, rng) {
    for (const p of s.players)
      s.hands[p.id] = Array.from(
        { length: 5 },
        () => 1 + Math.floor(rng() * 6),
      );
  },
  legal(s, id) {
    if (id !== current(s)) return [];
    const moves = [];
    for (let count = 1; count <= s.players.length * 5; count++)
      for (let face = 1; face <= 6; face++)
        if (count > s.bid.count || (count === s.bid.count && face > s.bid.face))
          moves.push({ action: "bid", choice: face, to: count });
    if (s.bid.by) moves.push({ action: "call", choice: 0, to: 0 });
    return moves;
  },
  apply(s, id, m) {
    if (!allowed(bluffDice, s, id, m)) return false;
    if (m.action === "bid") {
      s.bid = { count: m.to!, face: m.choice!, by: id };
    } else {
      const actual = Object.values(s.hands)
        .flat()
        .filter((face) => face === s.bid.face || face === 1).length;
      const winner = actual >= s.bid.count ? s.bid.by : id;
      s.scores[winner] += 100;
      const loser = winner === id ? s.bid.by : id;
      s.hands[loser].pop();
      s.bid = { count: 0, face: 0, by: "" };
      for (const p of s.players)
        s.hands[p.id] = s.hands[p.id].map(
          (_, i) => 1 + ((s.moves * 7 + i * 3 + s.turn) % 6),
        );
      if (s.hands[loser].length === 0) {
        if (s.players.length <= 2) {
          s.scores[winner] += 1000;
          s.ended = true;
        } else {
          const index = s.players.findIndex((p) => p.id === loser);
          s.players = s.players.filter((p) => p.id !== loser);
          if (index <= s.turn) s.turn = Math.max(0, s.turn - 1);
        }
      }
    }
    advance(s);
    return true;
  },
};
