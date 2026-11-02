import { advance, type Rule } from "../model.js";
export const sitePlan: Rule = {
  init(s) {
    s.board = Array(9).fill(0) as number[];
  },
  legal(s, id) {
    return s.ready[id]
      ? []
      : Array.from({ length: 9 }, (_, choice) => ({
          action: "position",
          choice,
        }));
  },
  apply(s, id, m) {
    if (
      m.action !== "position" ||
      m.choice === undefined ||
      !Number.isInteger(m.choice) ||
      m.choice < 0 ||
      m.choice >= 9 ||
      s.ready[id]
    )
      return false;
    s.ready[id] = m;
    if (Object.keys(s.ready).length === s.players.length) {
      const positions = s.players.map((p) => s.ready[p.id].choice!);
      for (let i = 0; i < s.players.length; i++) {
        const enemy = positions.filter((_, j) => j % 2 !== i % 2);
        s.scores[s.players[i].id] += enemy.includes(positions[i])
          ? i % 2 === 1
            ? 100
            : 0
          : i % 2 === 0
            ? 100
            : 0;
      }
      s.history.push(`Round ${s.round + 1}: positions ${positions.join(", ")}`);
      s.ready = {};
      s.round++;
      if (s.round >= 7) s.ended = true;
      advance(s);
    }
    return true;
  },
  view(s, id) {
    return { locked: !!s.ready[id], submitted: Object.keys(s.ready).length };
  },
};
