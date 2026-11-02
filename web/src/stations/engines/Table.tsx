import { useState } from "react";
import { obj, list, num, str, type ViewProps } from "./util";
export default function Table(p: ViewProps) {
  const [selected, setSelected] = useState(0),
    [text, setText] = useState("");
  const s = p.snapshot,
    moves = list(s.legal).map(obj),
    move = moves[Math.min(selected, Math.max(0, moves.length - 1))],
    board = list(s.board),
    icons = ["", "♟", "♞", "♝", "♜", "♛", "♚"];
  return (
    <>
      <p>
        {s.turn === p.id ? "Your turn" : `Turn: ${str(s.turn)}`} · Round{" "}
        {num(s.round) + 1} ·{" "}
        {Math.max(0, num(s.deadline) - num(s.elapsed)).toFixed(0)} s left
      </p>
      {board.length > 0 && (
        <div
          className="station-table-grid"
          style={{
            gridTemplateColumns: `repeat(${board.length === 64 ? 8 : board.length === 48 ? 6 : 3},1fr)`,
          }}
        >
          {board.map((v, i) => (
            <span key={i} className={i % 2 ? "dark" : ""}>
              {board.length === 64
                ? (num(v) > 0
                    ? ["", "♙", "♘", "♗", "♖", "♕", "♔"][num(v)]
                    : icons[Math.abs(num(v))]) || "·"
                : num(v) < 0
                  ? "·"
                  : String(v)}
              <small>{i}</small>
            </span>
          ))}
        </div>
      )}
      {s.phrase && (
        <p>
          Secret phrase: <b>{str(s.phrase)}</b>
        </p>
      )}
      {s.clues && (
        <p>
          Your symbols:{" "}
          {list(s.clues)
            .map((v) => (num(v) < 0 ? "?" : num(v)))
            .join(" · ")}
        </p>
      )}
      {s.scan && <p>{str(s.scan)}</p>}
      {s.emotes && <p>{list(s.emotes).map(str).join(" ")}</p>}
      <p>
        Your hand:{" "}
        {list(s.hand)
          .map((v) => String(v))
          .join(", ") || "—"}
      </p>
      {num(obj(s.bid).count) > 0 && (
        <p>
          Current bid: {num(obj(s.bid).count)} dice showing{" "}
          {num(obj(s.bid).face)}
        </p>
      )}
      {s.dug && (
        <p>
          Revealed cells:{" "}
          {Object.entries(obj(s.dug))
            .map(([cell, v]) => `${cell}: ${num(v) ? "treasure" : "empty"}`)
            .join(" · ")}
        </p>
      )}
      {s.locked && <p>Position locked. Waiting for the other players.</p>}
      {moves.length > 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (move) p.send({ ...move, text });
          }}
        >
          <label>
            Legal action{" "}
            <select
              value={selected}
              onChange={(e) => setSelected(+e.target.value)}
            >
              {moves.map((m, i) => (
                <option key={i} value={i}>
                  {str(m.action)} {m.from !== undefined ? `from ${m.from}` : ""}{" "}
                  {m.to !== undefined ? `to ${m.to}` : ""}{" "}
                  {m.choice !== undefined ? `choice ${num(m.choice) + 1}` : ""}{" "}
                  {str(m.target)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Words (for guesses/proposals){" "}
            <input
              value={text}
              maxLength={80}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button>Play action</button>
        </form>
      ) : (
        <p>Waiting for another player's move.</p>
      )}
      <ol className="station-history">
        {list(s.history).map((h, i) => (
          <li key={i}>{str(h)}</li>
        ))}
      </ol>
    </>
  );
}
