import {
  current,
  advance,
  type TableState,
  type Move,
  type Rule,
} from "../model.js";
// Pieces: pawn=1, knight=2, bishop=3, rook=4, queen=5, king=6. Sign identifies side.
function attacks(board: number[], from: number, to: number): boolean {
  const piece = board[from],
    kind = Math.abs(piece),
    dx = (to % 8) - (from % 8),
    dy = Math.floor(to / 8) - Math.floor(from / 8),
    ax = Math.abs(dx),
    ay = Math.abs(dy);
  if (!dx && !dy) return false;
  if (kind === 1) return ay === 1 && ax === 1 && dy === -Math.sign(piece);
  if (kind === 2) return ax * ay === 2;
  if (kind === 6) return Math.max(ax, ay) === 1;
  if (
    (kind === 3 && ax !== ay) ||
    (kind === 4 && dx !== 0 && dy !== 0) ||
    (kind === 5 && dx !== 0 && dy !== 0 && ax !== ay)
  )
    return false;
  const steps = Math.max(ax, ay);
  for (let k = 1; k < steps; k++)
    if (board[from + Math.sign(dx) * k + Math.sign(dy) * 8 * k] !== 0)
      return false;
  return true;
}
function checked(board: number[], side: number) {
  const king = board.indexOf(side * 6);
  return (
    king < 0 || board.some((p, i) => p * side < 0 && attacks(board, i, king))
  );
}
function legalChess(s: Parameters<Rule["legal"]>[0], id: string): Move[] {
  if (id !== current(s)) return [];
  const side = s.players[0].id === id ? 1 : -1,
    moves: Move[] = [];
  for (let from = 0; from < 64; from++) {
    const piece = s.board[from];
    if (piece * side <= 0) continue;
    for (let to = 0; to < 64; to++) {
      if (s.board[to] * side > 0 || Math.abs(s.board[to]) === 6) continue;
      const dx = (to % 8) - (from % 8),
        dy = Math.floor(to / 8) - Math.floor(from / 8);
      let valid = attacks(s.board, from, to);
      if (Math.abs(piece) === 1)
        valid =
          (dx === 0 &&
            s.board[to] === 0 &&
            (dy === -side ||
              (dy === -2 * side &&
                Math.floor(from / 8) === (side === 1 ? 6 : 1) &&
                s.board[from - side * 8] === 0))) ||
          (Math.abs(dx) === 1 && dy === -side && s.board[to] * side < 0);
      if (!valid) continue;
      const board = [...s.board];
      board[to] = board[from];
      board[from] = 0;
      if (!checked(board, side)) moves.push({ action: "move", from, to });
    }
  }
  const home = side === 1 ? 60 : 4;
  if (
    s.board[home] === side * 6 &&
    !s.recipe[`moved:${home}`] &&
    !checked(s.board, side)
  )
    for (const direction of [-1, 1]) {
      const rook = direction < 0 ? home - 4 : home + 3,
        path =
          direction < 0 ? [home - 1, home - 2, home - 3] : [home + 1, home + 2];
      if (
        s.board[rook] !== side * 4 ||
        s.recipe[`moved:${rook}`] ||
        path.some((i) => s.board[i] !== 0)
      )
        continue;
      let safe = true;
      for (const step of [1, 2]) {
        const board = [...s.board];
        board[home] = 0;
        board[home + direction * step] = side * 6;
        if (checked(board, side)) safe = false;
      }
      if (safe)
        moves.push({ action: "castle", from: home, to: home + direction * 2 });
    }
  const last = s.ready["en-passant"];
  if (
    last?.from !== undefined &&
    last.to !== undefined &&
    Math.abs(last.from - last.to) === 16
  ) {
    const enemy = last.to;
    for (const from of [enemy - 1, enemy + 1])
      if (
        from >= 0 &&
        from < 64 &&
        Math.floor(from / 8) === Math.floor(enemy / 8) &&
        s.board[from] === side &&
        s.board[enemy] === -side
      ) {
        const to = enemy - side * 8;
        if (s.board[to] !== 0) continue;
        const board = [...s.board];
        board[from] = 0;
        board[enemy] = 0;
        board[to] = side;
        if (!checked(board, side))
          moves.push({ action: "en-passant", from, to });
      }
  }
  return moves;
}
function legal(s: TableState, id: string): Move[] {
  const moves = legalChess(s, id);
  if (id !== current(s)) return moves;
  const side = s.players[0].id === id ? 1 : -1;
  for (let from = 0; from < s.hands[id].length; from++) {
    const card = s.hands[id][from] % 4;
    if (card === 0) moves.push({ action: "card", from });
    for (let to = 0; to < 64; to++) {
      if (s.board[to] * side <= 0) continue;
      if (card === 1) moves.push({ action: "card", from, to });
      if (card >= 2)
        for (let choice = 0; choice < 64; choice++) {
          if (card === 2 ? s.board[choice] * side <= 0 : s.board[choice] !== 0)
            continue;
          const board = [...s.board];
          if (card === 2)
            [board[to], board[choice]] = [board[choice], board[to]];
          else {
            board[choice] = board[to];
            board[to] = 0;
          }
          if (!checked(board, side))
            moves.push({ action: "card", from, to, choice });
        }
    }
  }
  return moves;
}
export const gambit: Rule = {
  init(s) {
    s.board = Array(64).fill(0) as number[];
    const row = [4, 2, 3, 5, 6, 3, 2, 4];
    for (let i = 0; i < 8; i++) {
      s.board[i] = -row[i];
      s.board[i + 8] = -1;
      s.board[i + 48] = 1;
      s.board[i + 56] = row[i];
    }
    s.cards = [0, 1, 2, 3, 4, 5, 6, 7];
  },
  legal,
  apply(s, id, m) {
    if (
      !legal(s, id).some(
        (a) =>
          a.action === m.action &&
          a.from === m.from &&
          a.to === m.to &&
          a.choice === m.choice,
      )
    )
      return false;
    if (m.action === "card") {
      const card = s.hands[id].splice(m.from!, 1)[0] % 4;
      if (card === 0) {
        s.recipe[`extra:${id}`] = 1;
        return true;
      }
      if (card === 1) s.recipe[`shield:${m.to}`] = 1;
      if (card === 2)
        [s.board[m.to!], s.board[m.choice!]] = [
          s.board[m.choice!],
          s.board[m.to!],
        ];
      if (card === 3) {
        s.board[m.choice!] = s.board[m.to!];
        s.board[m.to!] = 0;
      }
      if (m.to !== undefined) s.recipe[`moved:${m.to}`] = 1;
      if (m.choice !== undefined) s.recipe[`moved:${m.choice}`] = 1;
      s.ready["en-passant"] = { action: "none" };
      advance(s);
      return true;
    }
    let captured = s.board[m.to!];
    const piece = s.board[m.from!],
      side = Math.sign(piece);
    if (m.action === "en-passant") {
      const taken = m.to! + side * 8;
      captured = s.board[taken];
      s.board[taken] = 0;
    }
    if (m.action === "castle") {
      const direction = Math.sign(m.to! - m.from!),
        rook = direction < 0 ? m.from! - 4 : m.from! + 3;
      s.board[m.from! + direction] = s.board[rook];
      s.board[rook] = 0;
      s.recipe[`moved:${rook}`] = 1;
    }
    s.ready["en-passant"] =
      Math.abs(piece) === 1 && Math.abs(m.to! - m.from!) === 16
        ? { action: "move", from: m.from, to: m.to }
        : { action: "none" };
    s.recipe[`moved:${m.from}`] = 1;
    if (captured && s.recipe[`shield:${m.to}`]) {
      delete s.recipe[`shield:${m.to}`];
      advance(s);
      return true;
    }
    s.board[m.to!] = s.board[m.from!];
    s.board[m.from!] = 0;
    if (
      Math.abs(s.board[m.to!]) === 1 &&
      [0, 7].includes(Math.floor(m.to! / 8))
    )
      s.board[m.to!] = Math.sign(s.board[m.to!]) * 5;
    if (captured) {
      s.scores[id] += Math.abs(captured) * 10;
      const card = s.cards.shift();
      if (card !== undefined) s.hands[id].push(card);
      if (s.hands[id].length >= 3) {
        s.scores[id] += 1000;
        s.ended = true;
      }
    }
    if (s.recipe[`extra:${id}`]) {
      delete s.recipe[`extra:${id}`];
      s.moves++;
    } else advance(s);
    if (!legalChess(s, current(s)).length) {
      s.scores[id] += checked(s.board, s.players[0].id === current(s) ? 1 : -1)
        ? 1000
        : 0;
      s.ended = true;
    }
    return true;
  },
};
