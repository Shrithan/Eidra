import { useKeys } from "./useKeys";
import { useEffect, useRef } from "react";
import { Board } from "./Board";
import { obj, num, type ViewProps } from "./util";
export default function Track(p: ViewProps) {
  const keys = useKeys();
  useEffect(() => {
    const timer = setInterval(() => {
      const k = keys.current;
      p.send({
        steer:
          Number(k.has("d") || k.has("arrowright")) -
          Number(k.has("a") || k.has("arrowleft")),
        throttle: k.has("s") ? 0 : 1,
        jump: k.has(" "),
        boost: k.has("shift"),
      });
    }, 50);
    return () => {
      clearInterval(timer);
    };
  }, [p.send]);
  const r = obj(obj(p.snapshot.runners)[p.id]);
  return (
    <>
      <p>
        A/D or arrows steer · Space jumps · Shift boosts · S brakes. Automatic
        throttle.
      </p>
      <p>
        Distance {num(r.distance).toFixed(0)} / {num(p.snapshot.length)} m ·
        Lives {num(r.life)} · Battery {num(r.energy).toFixed(0)}%
      </p>
      {p.gameId === "strategy.macro-dash" && (
        <p>
          Resource points: {num(r.points).toFixed(0)} · Unit upgrades:{" "}
          {num(r.upgrade)} · Shift buys an upgrade for 10.
        </p>
      )}
      {p.gameId === "sandbox.chaos-cart" && (
        <p>
          Next fork:{" "}
          {Math.floor(num(p.snapshot.elapsed) / 10) % 2 === 0
            ? "left"
            : "right"}
          . Steer into the safe fork before the next ten seconds.
        </p>
      )}
      <div className="station-board">
        <Board {...p} />
      </div>
      <button
        onClick={() =>
          p.send({ steer: 0, throttle: 1, jump: true, boost: false })
        }
      >
        Jump
      </button>
    </>
  );
}
