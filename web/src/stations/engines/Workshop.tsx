import { useState, useRef, useEffect } from "react";
import { obj, list, num, str, palette, type ViewProps } from "./util";
export default function Workshop(p: ViewProps & { entry: string }) {
  const [text, setText] = useState(""),
    [color, setColor] = useState(4),
    [x, setX] = useState(0),
    [y, setY] = useState(0),
    [z, setZ] = useState(0),
    [kind, setKind] = useState("webcam");
  const painting = useRef(false),
    lastPaint = useRef(0);
  useEffect(() => {
    const up = () => (painting.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  const paint = (index: number) => {
    if (performance.now() - lastPaint.current < 20) return;
    lastPaint.current = performance.now();
    p.send({ index, color });
  };
  const s = p.snapshot,
    entries = obj(s.entries),
    mine = obj(entries[p.id]),
    stage = str(s.stage),
    show = str(s.reveal),
    visible = stage === "reveal" ? obj(entries[show]) : mine;
  return (
    <>
      <p>
        <b>{stage.toUpperCase()}</b> · {str(s.prompt)}
      </p>
      {s.writer && (
        <p>
          Story turn: {s.writer === p.id ? "you" : str(s.writer)}. Each player
          adds one sentence.
        </p>
      )}
      {s.writer &&
        Object.entries(entries).map(([id, e]) => (
          <p key={id}>{str(obj(e).text)}</p>
        ))}
      {stage === "make" && (
        <>
          {p.entry === "text" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                p.send({ text });
              }}
            >
              <label>
                Your entry{" "}
                <input
                  maxLength={80}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <button>Save entry</button>
            </form>
          )}
          {["pixels", "blocks", "path", "loops"].includes(p.entry) && (
            <label>
              Colour / loop{" "}
              <select value={color} onChange={(e) => setColor(+e.target.value)}>
                {palette.map((c, i) => (
                  <option key={c} value={i}>
                    {i}: {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          {p.entry === "pixels" && (
            <div
              className="station-pixels"
              aria-label="Pixel canvas"
              onPointerDown={() => (painting.current = true)}
            >
              {Array.from({ length: 1024 }, (_, index) => (
                <button
                  key={index}
                  aria-label={`Paint pixel ${index % 32}, ${Math.floor(index / 32)}`}
                  style={{ background: palette[num(list(mine.pixels)[index])] }}
                  onClick={() => paint(index)}
                  onPointerEnter={() => {
                    if (painting.current) paint(index);
                  }}
                />
              ))}
            </div>
          )}
          {p.entry === "path" && (
            <div
              className="station-island-brush"
              onPointerDown={(e) => {
                painting.current = true;
                const r = e.currentTarget.getBoundingClientRect();
                p.send({
                  x: (e.clientX - r.left) / r.width,
                  y: (e.clientY - r.top) / r.height,
                });
              }}
              onPointerMove={(e) => {
                if (
                  !painting.current ||
                  performance.now() - lastPaint.current < 35
                )
                  return;
                lastPaint.current = performance.now();
                const r = e.currentTarget.getBoundingClientRect();
                p.send({
                  x: (e.clientX - r.left) / r.width,
                  y: (e.clientY - r.top) / r.height,
                });
              }}
            >
              <svg viewBox="0 0 100 100" aria-label="Draw an island outline">
                <polygon
                  points={list(mine.path)
                    .map((point) => {
                      const a = list(point);
                      return `${num(a[0]) * 100},${num(a[1]) * 100}`;
                    })
                    .join(" ")}
                  fill="#6bdc8b"
                  stroke="#fff"
                />
              </svg>
            </div>
          )}
          {["blocks", "layout", "path"].includes(p.entry) && (
            <div className="station-actions">
              <label>
                X{" "}
                <input
                  type="number"
                  min="0"
                  max={p.entry === "layout" ? 15 : p.entry === "path" ? 1 : 11}
                  step={p.entry === "path" ? ".05" : "1"}
                  value={x}
                  onChange={(e) => setX(+e.target.value)}
                />
              </label>
              <label>
                Y{" "}
                <input
                  type="number"
                  min="0"
                  max={p.entry === "layout" ? 8 : p.entry === "path" ? 1 : 7}
                  step={p.entry === "path" ? ".05" : "1"}
                  value={y}
                  onChange={(e) => setY(+e.target.value)}
                />
              </label>
              {p.entry === "blocks" && (
                <label>
                  Z{" "}
                  <input
                    type="number"
                    min="0"
                    max="11"
                    value={z}
                    onChange={(e) => setZ(+e.target.value)}
                  />
                </label>
              )}
              {p.entry === "layout" && (
                <select
                  aria-label="Widget"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {["webcam", "chat", "alerts", "goal", "now-playing"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              )}
              <button
                onClick={() =>
                  p.send(
                    p.entry === "blocks"
                      ? { x, y, z, color }
                      : p.entry === "layout"
                        ? { x, y, kind }
                        : { x, y },
                  )
                }
              >
                Add{" "}
                {p.entry === "blocks"
                  ? "block"
                  : p.entry === "layout"
                    ? "widget"
                    : "point"}
              </button>
            </div>
          )}
          {p.entry === "loops" &&
            Array.from({ length: 8 }, (_, slot) => (
              <button key={slot} onClick={() => p.send({ slot, loop: color })}>
                Slot {slot + 1}: {num(list(mine.loops)[slot])}
              </button>
            ))}
          {p.entry === "draft" &&
            Array.from({ length: 12 }, (_, unit) => (
              <button
                disabled={list(mine.draft).includes(unit)}
                key={unit}
                onClick={() => p.send({ unit })}
              >
                Unit {unit + 1}
              </button>
            ))}
        </>
      )}
      {(stage === "reveal" || stage === "vote") &&
        Object.entries(entries)
          .filter(([id]) => stage === "vote" || id === show)
          .map(([id, entry]) => (
            <article className="station-entry" key={id}>
              <b>{id === p.id ? "Your entry" : id}</b>
              <Entry data={obj(entry)} />
              {stage === "vote" && id !== p.id && (
                <button
                  disabled={!!s.voted}
                  onClick={() => p.send({ vote: id })}
                >
                  Vote for this entry
                </button>
              )}
            </article>
          ))}
      {stage === "make" && <Entry data={visible} />}
      {s.adventure && (
        <p>
          {str(obj(s.adventure).question)} ·{" "}
          {list(obj(s.adventure).choices).map(str).join(" / ")}
        </p>
      )}
    </>
  );
}
function Entry({ data: e }: { data: Record<string, unknown> }) {
  return (
    <>
      <p>{str(e.text)}</p>
      {e.pixels && (
        <div className="station-pixels preview">
          {list(e.pixels).map((v, i) => (
            <span key={i} style={{ background: palette[num(v)] }} />
          ))}
        </div>
      )}
      {e.blocks && (
        <div className="station-block-preview">
          {list(e.blocks).map((v, i) => {
            const b = obj(v);
            return (
              <span
                key={i}
                style={{
                  left: `${num(b.x) * 8}%`,
                  top: `${num(b.z) * 8}%`,
                  background: palette[num(b.color)],
                  transform: `translateY(-${num(b.y) * 3}px)`,
                }}
              />
            );
          })}
        </div>
      )}
      {e.layout && (
        <div className="station-layout">
          {list(e.layout).map((v, i) => {
            const w = obj(v);
            return (
              <span
                key={i}
                style={{ left: `${num(w.x) * 6}%`, top: `${num(w.y) * 10}%` }}
              >
                {str(w.kind)}
              </span>
            );
          })}
        </div>
      )}
      {e.path && (
        <svg
          viewBox="0 0 100 100"
          width="180"
          height="180"
          aria-label="Island outline"
        >
          <polygon
            points={list(e.path)
              .map((v) => {
                const a = list(v);
                return `${num(a[0]) * 100},${num(a[1]) * 100}`;
              })
              .join(" ")}
            fill="#6bdc8b"
            stroke="#fff"
          />
        </svg>
      )}
      {e.draft && (
        <p>
          Units:{" "}
          {list(e.draft)
            .map((v) => num(v) + 1)
            .join(", ")}
        </p>
      )}
      {e.loops && <p>Loop slots: {list(e.loops).map(str).join(" · ")}</p>}
    </>
  );
}
