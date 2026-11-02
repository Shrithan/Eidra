import { useEffect, useRef, useState } from "react";
import { Board } from "./Board";
import { obj, list, num, str, type ViewProps } from "./util";
export default function Pulse(p: ViewProps) {
  const latest = useRef(p);
  latest.current = p;
  const anchor = useRef({ time: 0, at: performance.now() }),
    cursor = useRef({ x: 0.5, y: 0.5 });
  const [clock, setClock] = useState(0);
  useEffect(() => {
    anchor.current = {
      time: num(p.snapshot.serverTime),
      at: performance.now(),
    };
  }, [p.snapshot]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      setClock(anchor.current.time + performance.now() - anchor.current.at);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  const now = () => anchor.current.time + performance.now() - anchor.current.at;
  const choose = (cues: Record<string, unknown>[], time: number) =>
    cues
      .filter(
        (c) => num(c.at) <= time && time - num(c.at) <= num(c.window, 180),
      )
      .at(-1) ??
    [...cues].sort(
      (a, b) => Math.abs(num(a.at) - time) - Math.abs(num(b.at) - time),
    )[0];
  const nearest = () =>
    choose(list(latest.current.snapshot.cues).map(obj), now());
  function hit(choice: number, point?: { x: number; y: number }) {
    const cue = nearest();
    if (!cue) return;
    latest.current.send({
      cue: cue.id,
      t: now(),
      choice,
      ...(point ?? cursor.current),
      hold: true,
    });
  }
  useEffect(() => {
    const down = (event: Event) => {
      const d = (
        event as CustomEvent<{ key: string; up: boolean; repeat: boolean }>
      ).detail;
      if (d.up) {
        if (d.key === " ") latest.current.send({ hold: false });
        return;
      }
      if (d.repeat) return;
      const key = Number(d.key);
      if (key >= 1 && key <= 6) hit(key - 1);
      if (d.key === " ") hit(0);
      if (d.key === "ArrowLeft")
        cursor.current.x = Math.max(0, cursor.current.x - 0.05);
      if (d.key === "ArrowRight")
        cursor.current.x = Math.min(1, cursor.current.x + 0.05);
      if (d.key === "ArrowUp")
        cursor.current.y = Math.max(0, cursor.current.y - 0.05);
      if (d.key === "ArrowDown")
        cursor.current.y = Math.min(1, cursor.current.y + 0.05);
    };
    window.addEventListener("station:key", down);
    return () => window.removeEventListener("station:key", down);
  }, []);
  const cue = choose(list(p.snapshot.cues).map(obj), clock),
    kind = str(cue?.kind),
    delta = clock - num(cue?.at),
    phase = Math.max(0, Math.min(1, (delta + 1500) / 3000));
  const choices = list(cue?.options);
  return (
    <>
      <p>
        {kind === "target"
          ? "Click the target; arrows move the keyboard crosshair and Space fires."
          : kind === "blink"
            ? "Hold Space or the button to stop the statues. Rest after three seconds."
            : kind === "cast" || kind === "timing"
              ? "Release in the green zone when the gauge passes its centre."
              : "Hit on the line. Keys 1–6 choose an answer; Space hits timing cues."}
      </p>
      {p.gameId === "arcade.penalty-shootout" && (
        <p>
          {obj(p.snapshot.role).shooter === p.id
            ? "You are shooting. Pick your corner."
            : "You are keeping goal. Predict the shot."}
        </p>
      )}
      <p>{str(cue?.preview) || str(cue?.question)}</p>
      <strong>
        {kind.toUpperCase()} · {((num(cue?.at) - clock) / 1000).toFixed(2)} s
      </strong>
      {kind === "target" ? (
        <div
          className="station-target"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            hit(0, {
              x: (e.clientX - r.left) / r.width,
              y: (e.clientY - r.top) / r.height,
            });
          }}
        >
          <span
            className="station-target-dot"
            style={{
              left: `${num(cue.x) * 100}%`,
              top: `${num(cue.y) * 100}%`,
            }}
          >
            ◎
          </span>
          <span
            className="station-reticle"
            style={{
              left: `${cursor.current.x * 100}%`,
              top: `${cursor.current.y * 100}%`,
            }}
          >
            +
          </span>
          <button
            className="station-target-key"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => hit(0, { x: num(cue.x), y: num(cue.y) })}
          >
            Keyboard target
          </button>
        </div>
      ) : kind === "cast" || kind === "timing" ? (
        <div className="station-gauge">
          <span
            className="station-green"
            style={{ width: `${num(cue?.window, 180) / 15}%` }}
          />
          <span
            className="station-needle"
            style={{ left: `${phase * 100}%` }}
          />
        </div>
      ) : (
        <div className="station-board">
          <Board {...p} />
        </div>
      )}
      {kind === "blink" ? (
        <>
          <button
            onPointerDown={() => p.send({ hold: true })}
            onPointerUp={() => p.send({ hold: false })}
            onPointerCancel={() => p.send({ hold: false })}
            onKeyDown={(e) => {
              if (e.key === " ") p.send({ hold: true });
            }}
            onKeyUp={(e) => {
              if (e.key === " ") p.send({ hold: false });
            }}
          >
            Hold the statues
          </button>
          <p>
            Statue progress:{" "}
            {(num(obj(p.snapshot.statues)[p.id]) * 100).toFixed(0)}%
          </p>
        </>
      ) : (
        <div className="station-actions">
          {Array.from(
            {
              length:
                kind === "choice"
                  ? choices.length
                  : kind === "lane" || kind === "corner"
                    ? 4
                    : 1,
            },
            (_, i) => (
              <button key={i} onClick={() => hit(i)}>
                {kind === "cast"
                  ? "Cast"
                  : kind === "timing"
                    ? "Release"
                    : `${i + 1}: ${str(choices[i]) || "Hit"}`}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
