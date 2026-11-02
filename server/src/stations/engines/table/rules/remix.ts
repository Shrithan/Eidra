import { current, advance, allowed, type Rule } from "../model.js";
export const remix: Rule = {
  init(s, rng) {
    s.board = Array(48).fill(-1) as number[];
    for (const p of s.players)
      s.hands[p.id] = Array.from({ length: 5 }, () => Math.floor(rng() * 12));
  },
  legal(s, id) {
    if (id !== current(s)) return [];
    const moves = [];
    for (let from = 0; from < s.hands[id].length; from++)
      for (let to = 0; to < 48; to++)
        if (
          s.board[to] === -1 &&
          s.hands[id][from] % 3 === Math.floor(to / 6) % 3
        )
          moves.push({ action: "place", from, to });
        else if (
          s.board[to] >= 0 &&
          s.hands[id][from] % 3 === s.board[to] % 3 &&
          s.hands[id][from] > s.board[to]
        )
          moves.push({ action: "challenge", from, to });
    return moves.length ? moves : [{ action: "pass" }];
  },
  apply(s, id, m) {
    if (!allowed(remix, s, id, m)) return false;
    if (
      (m.action === "place" || m.action === "challenge") &&
      m.from !== undefined &&
      m.to !== undefined
    ) {
      if (m.action === "challenge") {
        const owner = s.players[s.recipe[`owner:${m.to}`]]?.id,
          turn = s.recipe[`turn:${m.to}`];
        if (owner)
          s.clues[owner] = (s.clues[owner] ?? []).filter((t) => t !== turn);
      }
      s.recipe[`owner:${m.to}`] = s.players.findIndex((p) => p.id === id);
      s.recipe[`turn:${m.to}`] = s.moves;
      s.board[m.to] = s.hands[id].splice(m.from, 1)[0];
      s.hands[id].push((s.moves * 7 + 3) % 12);
      s.clues[id] ??= [];
      s.clues[id].push(s.moves);
    }
    for (const p of s.players)
      if ((s.clues[p.id] ?? []).some((turn) => s.moves - turn === 2))
        s.scores[p.id] += 10;
    advance(s);
    if (s.moves >= 48) s.ended = true;
    return true;
  },
};
