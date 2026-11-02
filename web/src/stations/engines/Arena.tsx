import { useKeys } from "./useKeys";
import { useEffect, useRef } from "react";
import { Board } from "./Board";
import type { ViewProps } from "./util";
export default function Arena(p: ViewProps) {
  const keys = useKeys(),
    aim = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => {
      const k = keys.current,
        x =
          Number(k.has("d") || k.has("arrowright")) -
          Number(k.has("a") || k.has("arrowleft")),
        z =
          Number(k.has("s") || k.has("arrowdown")) -
          Number(k.has("w") || k.has("arrowup"));
      if (x || z) aim.current = Math.atan2(z, x);
      if (k.has("q")) aim.current -= 0.15;
      if (k.has("e")) aim.current += 0.15;
      p.send({
        move: [x, z],
        aim: aim.current,
        attack: k.has(" ") || k.has("j"),
        dash: k.has("shift"),
      });
    }, 50);
    return () => {
      clearInterval(timer);
    };
  }, [p.send]);
  return (
    <>
      <p>
        WASD / arrows move · J or Space attacks · Shift dashes. Q/E turn your
        aim.
      </p>
      <div className="station-board">
        <Board {...p} />
      </div>
      <button
        onClick={() =>
          p.send({ move: [0, 0], aim: 0, attack: true, dash: false })
        }
      >
        Attack (J)
      </button>
    </>
  );
}
