import { useMemo, useState } from "react";
import { obj, list, num, str, type ViewProps } from "./util";

const WHITE = ["", "♙", "♘", "♗", "♖", "♕", "♔"],
  BLACK = ["", "♟", "♞", "♝", "♜", "♛", "♚"];
export default function Chess(p: ViewProps) {
  const s = p.snapshot,
    players = list(s.players).map(obj),
    white = str(players[0]?.id) === p.id,
    board = list(s.board).map((v) => num(v)),
    legal = list(s.legal).map(obj),
    mine = str(s.turn) === p.id,
    [from, setFrom] = useState(-1),
    last = list(s.history).map(str).at(-1);
  const targets = useMemo(
    () => legal.filter((m) => num(m.from, -1) === from),
    [legal, from],
  );
  const movable = new Set(legal.map((m) => num(m.from, -1)));
  const click = (i: number) => {
    const move = targets.find((m) => num(m.to) === i);
    if (move) {
      p.send({ action: str(move.action), from, to: i });
      setFrom(-1);
    } else setFrom(movable.has(i) ? i : -1);
  };
  const cells = Array.from({ length: 64 }, (_, k) => (white ? k : 63 - k));
  const names = players.map((q) => str(q.name));
  return (
    <>
      <p>
        {mine ? "Your move" : `Waiting for ${names[white ? 1 : 0] ?? "opponent"}`}{" "}
        · You play {white ? "white" : "black"} ·{" "}
        {Math.max(0, num(s.deadline) - num(s.elapsed)).toFixed(0)} s on the clock
      </p>
      <div className="station-chess" aria-label="Chess board">
        {cells.map((i) => {
          const v = board[i] ?? 0,
            glyph = (v > 0 ? WHITE : BLACK)[Math.abs(v)];
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const hint = targets.some((m) => num(m.to) === i);
          return (
            <button
              key={i}
              className={`${dark ? "dark" : ""} ${from === i ? "sel" : ""} ${hint ? "target" : ""}`}
              onClick={() => click(i)}
              disabled={!mine}
              aria-label={`${"abcdefgh"[i % 8]}${8 - Math.floor(i / 8)} ${glyph}`}
            >
              {glyph}
            </button>
          );
        })}
      </div>
      {last && <p className="station-history">{last}</p>}
    </>
  );
}
