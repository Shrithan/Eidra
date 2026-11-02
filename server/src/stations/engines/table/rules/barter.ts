import { current, advance, allowed, type Move, type Rule } from "../model.js";
export const barter: Rule = {
  init(s, rng) {
    for (const p of s.players) {
      s.hands[p.id] = Array.from({ length: 6 }, () => Math.floor(rng() * 3));
      s.recipe[p.id] = 0;
    }
  },
  legal(s, id) {
    const offered = Object.entries(s.ready)
      .filter(([, offer]) => offer.target === id)
      .map(([target]) => ({ action: "accept", target }));
    if (id !== current(s)) return offered;
    const moves: Move[] = [{ action: "draw" }];
    for (let from = 0; from < s.hands[id].length; from++)
      for (let choice = 0; choice < 3; choice++)
        moves.push({ action: "trade", from, choice });
    if ([0, 1, 2].every((k) => s.hands[id].includes(k)))
      moves.push({ action: "craft" });
    for (const p of s.players)
      if (p.id !== id)
        for (let from = 0; from < s.hands[id].length; from++)
          for (let choice = 0; choice < s.hands[p.id].length; choice++)
            moves.push({ action: "offer", from, choice, target: p.id });
    return [...moves, ...offered];
  },
  apply(s, id, m) {
    if (!allowed(barter, s, id, m)) return false;
    if (m.action === "offer") {
      s.ready[id] = m;
      s.history.push(`${id} offered a trade to ${m.target}`);
      return true;
    }
    if (m.action === "accept" && m.target) {
      const offer = s.ready[m.target];
      if (
        offer?.from === undefined ||
        offer.choice === undefined ||
        s.hands[id][offer.choice] === undefined ||
        s.hands[m.target][offer.from] === undefined
      )
        return false;
      [s.hands[id][offer.choice], s.hands[m.target][offer.from]] = [
        s.hands[m.target][offer.from],
        s.hands[id][offer.choice],
      ];
      delete s.ready[m.target];
      advance(s);
      return true;
    }
    delete s.ready[id];
    if (m.action === "draw") s.hands[id].push(s.moves % 3);
    if (m.action === "trade" && m.from !== undefined)
      s.hands[id][m.from] = m.choice!;
    if (m.action === "craft") {
      for (const k of [0, 1, 2]) s.hands[id].splice(s.hands[id].indexOf(k), 1);
      s.recipe[id]++;
      s.scores[id] += 100;
      if (s.recipe[id] >= 3) s.ended = true;
    }
    advance(s);
    return true;
  },
};
