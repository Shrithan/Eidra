import { current, advance, type Rule } from "../model.js";
export const townHall: Rule = {
  init(s) {
    for (const p of s.players) s.hands[p.id] = [1, 1, 1];
  },
  legal(s, id) {
    if (id !== current(s)) return [];
    return [
      { action: "propose" },
      ...s.players.map((p) => ({ action: "vote", target: p.id })),
      ...s.players
        .filter((p) => p.id !== id)
        .map((p) => ({ action: "trade", target: p.id })),
    ];
  },
  apply(s, id, m) {
    if (id !== current(s)) return false;
    if (m.action === "propose" && m.text) {
      s.secrets[id] = m.text;
      s.history.push(`${id} proposes: ${m.text}`);
    } else if (
      m.action === "vote" &&
      m.target &&
      s.players.some((p) => p.id === m.target) &&
      s.hands[id].length
    ) {
      s.hands[id].pop();
      s.scores[m.target] += 10;
    } else if (
      m.action === "trade" &&
      m.target &&
      m.target !== id &&
      s.hands[m.target]?.length
    ) {
      s.hands[m.target].pop();
      s.hands[id].push(1);
      s.scores[m.target] += 5;
    } else return false;
    advance(s);
    if (s.moves >= s.players.length * 5) s.ended = true;
    return true;
  },
  view(s) {
    return { proposals: s.secrets };
  },
};
