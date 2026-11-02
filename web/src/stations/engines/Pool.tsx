import { useEffect, useRef, useState } from "react";
import { obj, list, num, str, type ViewProps } from "./util";

type B = { x: number; y: number; vx: number; vy: number; out: boolean };
const COLORS = [
  "#f4f1e8",
  "#f2c230",
  "#2a62c8",
  "#d6402b",
  "#6a3fa0",
  "#ef7d22",
  "#1f8a4c",
  "#8c2b2b",
  "#161616",
];
const W = 800,
  H = 400;
export default function Pool(p: ViewProps) {
  const s = p.snapshot,
    canvas = useRef<HTMLCanvasElement>(null),
    live = useRef({ balls: [] as B[], at: performance.now() }),
    aim = useRef({ x: 0.5, y: 0.5, down: 0, angle: 0 }),
    [power, setPower] = useState(0);
  const cue = list(s.balls).map(obj)[0];
  const mine = str(s.turn) === p.id,
    moving = !!s.moving,
    hand = !!s.hand,
    table = obj(s.table),
    scale = W / num(table.w, 2);
  useEffect(() => {
    live.current = {
      balls: list(s.balls).map((b) => ({
        x: num(obj(b).x),
        y: num(obj(b).y),
        vx: num(obj(b).vx),
        vy: num(obj(b).vy),
        out: !!obj(b).out,
      })),
      at: performance.now(),
    };
  }, [s.balls]);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current?.getContext("2d");
      if (!c) return;
      const r = num(table.r, 0.03) * scale,
        dt = Math.min(0.2, (performance.now() - live.current.at) / 1000);
      c.clearRect(0, 0, W, H);
      c.fillStyle = "#4b2e1a";
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#1d7a4a";
      c.fillRect(10, 10, W - 20, H - 20);
      c.fillStyle = "#0c0c0c";
      for (const [px, py] of [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ]) {
        c.beginPath();
        c.arc(px * scale, py * scale, num(table.pocket, 0.07) * scale * 0.8, 0, 7);
        c.fill();
      }
      const pos = live.current.balls.map((b) => ({
        x: b.x + (moving ? b.vx * dt : 0),
        y: b.y + (moving ? b.vy * dt : 0),
      }));
      live.current.balls.forEach((b, n) => {
        if (b.out) return;
        const x = pos[n].x * scale,
          y = pos[n].y * scale;
        const tint = COLORS[n > 8 ? n - 8 : n];
        c.save();
        c.beginPath();
        c.arc(x, y, r, 0, 7);
        c.clip();
        c.fillStyle = n > 8 ? COLORS[0] : n === 0 ? COLORS[0] : tint;
        c.fillRect(x - r, y - r, r * 2, r * 2);
        if (n > 8) {
          c.fillStyle = tint;
          c.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
        }
        c.restore();
        if (n) {
          c.fillStyle = "#fff";
          c.beginPath();
          c.arc(x, y, r * 0.5, 0, 7);
          c.fill();
          c.fillStyle = "#111";
          c.font = `${r * 0.8}px sans-serif`;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(String(n), x, y + 1);
        }
      });
      const cue = live.current.balls[0];
      if (mine && !moving && cue && !cue.out) {
        const a = aim.current,
          ang = a.angle,
          cx = cue.x * scale,
          cy = cue.y * scale,
          pull = a.down ? Math.min(1, (performance.now() - a.down) / 1400) : 0;
        c.strokeStyle = "rgba(255,255,255,.55)";
        c.setLineDash([6, 6]);
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(ang) * 260, cy + Math.sin(ang) * 260);
        c.stroke();
        c.setLineDash([]);
        c.strokeStyle = "#d9b27a";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(cx - Math.cos(ang) * (r + 6 + pull * 40), cy - Math.sin(ang) * (r + 6 + pull * 40));
        c.lineTo(cx - Math.cos(ang) * (r + 200 + pull * 40), cy - Math.sin(ang) * (r + 200 + pull * 40));
        c.stroke();
        c.lineWidth = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mine, moving, scale, table.pocket, table.r]);
  const point = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * num(table.w, 2),
      y: ((e.clientY - rect.top) / rect.height) * num(table.h, 1),
    };
  };
  const groups = obj(s.groups);
  return (
    <>
      <p>
        {mine
          ? moving
            ? "Balls rolling…"
            : hand
              ? "Ball in hand: click the table to move the cue ball, then hold on it to charge and release to shoot"
              : "Move the mouse to aim, hold to charge, release to shoot"
          : "Opponent's turn"}{" "}
        · {Math.max(0, num(s.deadline) - num(s.elapsed)).toFixed(0)} s
      </p>
      <p>
        {list(s.players)
          .map(obj)
          .map((q) => `${str(q.name)}: ${str(groups[str(q.id)]) || "open table"}`)
          .join(" · ")}
        {str(s.message) ? ` · ${str(s.message)}` : ""}
      </p>
      <canvas
        ref={canvas}
        width={W}
        height={H}
        className="station-pool"
        onPointerMove={(e) => {
          const { x, y } = point(e);
          aim.current.x = x;
          aim.current.y = y;
          if (cue) aim.current.angle = Math.atan2(y - num(cue.y), x - num(cue.x));
        }}
        onPointerDown={(e) => {
          if (!mine || moving) return;
          const { x, y } = point(e);
          if (
            hand &&
            Math.hypot(x - num(cue?.x), y - num(cue?.y)) > 0.12
          ) {
            p.send({ place: [x, y] });
            return;
          }
          aim.current.down = performance.now();
          const timer = setInterval(() => {
            if (!aim.current.down) return clearInterval(timer);
            setPower(Math.min(1, (performance.now() - aim.current.down) / 1400));
          }, 50);
        }}
        onPointerUp={() => {
          const a = aim.current;
          if (!a.down || !mine || moving) return;
          const charge = Math.min(1, (performance.now() - a.down) / 1400);
          a.down = 0;
          setPower(0);
          p.send({ angle: a.angle, power: Math.max(0.1, charge) });
        }}
      />
      <progress value={power} max={1} aria-label="Shot power" />
    </>
  );
}
