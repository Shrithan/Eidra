import { CHAT_LINES } from "../data/chatLines.js";
import {
  base,
  time,
  rank,
  mulberry32,
  number,
  text,
  clamp,
  finite,
  record,
  type Engine,
  type BaseState,
} from "./common.js";
export type PulseState = BaseState & {
  cues: {
    id: number;
    at: number;
    kind: string;
    answer: number;
    options: string[];
    x: number;
    y: number;
    window: number;
    question: string;
    preview: string;
  }[];
  answered: Record<string, number[]>;
  combo: Record<string, number>;
  latency: Record<string, number>;
  bar: number;
  penalties: Record<number, Record<string, number>>;
  resolved: number[];
  holds: Record<string, number>;
  statues: Record<string, number>;
  restUntil: Record<string, number>;
};
export const pulse: Engine<PulseState, unknown> = {
  init(def, players, seed) {
    const rng = mulberry32(seed),
      interval = number(def, "bpm", 0)
        ? 60000 / number(def, "bpm", 110)
        : number(def, "interval", 3000);
    const count =
      def.id === "creative.beat-drop"
        ? Math.floor((def.roundSeconds * 1000 - 2000) / interval)
        : number(def, "rounds", 12);
    const kinds = [
      "lane",
      "target",
      "blink",
      "choice",
      "cast",
      "timing",
      "corner",
    ];
    return {
      ...base(def, players),
      cues: Array.from({ length: count }, (_, id) => {
        const kind =
          def.id === "other.wild-card"
            ? kinds[Math.floor(rng() * kinds.length)]
            : text(def, "cue", "timing");
        const answer = Math.floor(
          rng() * (def.id === "strategy.read-the-meta" ? 6 : 4),
        );
        const names = Array.isArray(def.config.streamers)
          ? def.config.streamers.map(String).slice(0, 4)
          : ["Community A", "Community B", "Community C", "Community D"];
        while (names.length < 4) names.push(`Community ${names.length + 1}`);
        const line = CHAT_LINES[Math.floor(rng() * CHAT_LINES.length)];
        const question =
          def.id === "chat.who-said-it"
            ? line
            : def.id === "strategy.read-the-meta"
              ? `Counter unit ${answer === 0 ? 6 : answer} (each next unit counters the previous)`
              : "Hit the marked cue";
        return {
          id,
          at: 1000 + id * interval,
          kind,
          answer,
          options:
            kind === "choice"
              ? def.id === "strategy.read-the-meta"
                ? ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Unit 6"]
                : names
              : kind === "corner"
                ? ["Top left", "Top right", "Bottom left", "Bottom right"]
                : ["Left", "Up", "Right", "Down"],
          question,
          preview:
            def.id === "chat.who-said-it" ? `${names[answer]}: ${line}` : "",
          x: rng(),
          y: rng(),
          window:
            kind === "cast"
              ? 90 + Math.floor(rng() * 90)
              : kind === "choice"
                ? Math.min(6000, interval - 100)
                : kind === "corner"
                  ? 2000
                  : 180,
        };
      }),
      answered: Object.fromEntries(players.map((p) => [p.id, []])),
      combo: Object.fromEntries(players.map((p) => [p.id, 0])),
      latency: {},
      bar: 100,
      penalties: {},
      resolved: [],
      holds: {},
      restUntil: {},
      statues: Object.fromEntries(players.map((p) => [p.id, 0])),
    };
  },
  input(s, id, input) {
    const v = record(input);
    if (
      v?.hold === true &&
      s.def.id === "horror.dont-blink" &&
      s.answered[id]
    ) {
      if (!s.holds[id] && (s.restUntil[id] ?? 0) <= s.elapsed * 1000)
        s.holds[id] = s.elapsed * 1000 + 3000;
      return;
    }
    if (v?.hold === false) {
      if (s.holds[id]) s.restUntil[id] = s.elapsed * 1000 + 1000;
      delete s.holds[id];
      return;
    }
    if (
      !v ||
      !s.answered[id] ||
      !finite(v.cue) ||
      !Number.isInteger(v.cue) ||
      !finite(v.t)
    )
      return;
    const cue = s.cues[v.cue];
    if (!cue || s.answered[id].includes(cue.id)) return;
    const receive = s.elapsed * 1000;
    const at = receive - clamp(s.latency[id] ?? 0, 0, 250);
    if (receive < cue.at - 250 || receive > cue.at + cue.window + 250) return;
    if (s.def.id === "arcade.penalty-shootout") {
      if (
        !finite(v.choice) ||
        !Number.isInteger(v.choice) ||
        v.choice < 0 ||
        v.choice > 3
      )
        return;
      s.penalties[cue.id] ??= {};
      s.penalties[cue.id][id] = v.choice;
      s.answered[id].push(cue.id);
      return;
    }
    let correct = true;
    if (["lane", "choice", "corner"].includes(cue.kind))
      correct = v.choice === cue.answer;
    if (cue.kind === "target")
      correct =
        finite(v.x) &&
        finite(v.y) &&
        Math.hypot(v.x - cue.x, v.y - cue.y) < 0.13;
    if (cue.kind === "blink") {
      if (v.hold === true) {
        if ((s.holds[id] ?? 0) < receive) s.holds[id] = receive + 3000;
        correct = receive < s.holds[id];
      } else {
        delete s.holds[id];
        correct = false;
      }
    }
    const distance = Math.abs(at - cue.at);
    s.answered[id].push(cue.id);
    const windows = s.def.config.windows;
    const w = Array.isArray(windows) ? windows : [50, 110, 180];
    let score =
      distance <= Number(w[0])
        ? 100
        : distance <= Number(w[1])
          ? 70
          : distance <= Number(w[2])
            ? 40
            : 0;
    if (cue.kind === "choice")
      score = Math.max(
        0,
        100 - Math.floor(Math.max(0, at - cue.at) / 1000) * 10,
      );
    if (cue.kind === "target" || cue.kind === "corner")
      score = Math.max(10, 100 - Math.floor(distance / 30));
    if (cue.kind === "cast" || cue.kind === "timing")
      score = Math.max(0, 100 - Math.round(distance / 2));
    if (!correct) score = 0;
    s.combo[id] = score ? s.combo[id] + 1 : 0;
    s.scores[id] +=
      score *
      (s.def.config.combo ? 1 + Math.min(4, Math.floor(s.combo[id] / 5)) : 1);
    if (s.def.config.drain) s.bar = clamp(s.bar + (score ? 1 : -5), 0, 100);
  },
  tick(s, dt) {
    time(s, dt);
    if (s.def.id === "arcade.penalty-shootout")
      for (const cue of s.cues) {
        if (s.resolved.includes(cue.id)) continue;
        const choices = s.penalties[cue.id] ?? {};
        if (
          s.players.every((p) => choices[p.id] !== undefined) ||
          s.elapsed * 1000 > cue.at + cue.window
        ) {
          const shooter = s.players[cue.id % 2]?.id,
            keeper = s.players[(cue.id + 1) % 2]?.id;
          if (shooter && keeper) {
            if (
              choices[shooter] !== undefined &&
              choices[shooter] !== choices[keeper]
            )
              s.scores[shooter]++;
            else s.scores[keeper]++;
          }
          s.resolved.push(cue.id);
        }
      }
    if (s.def.config.drain)
      for (const cue of s.cues)
        if (s.elapsed * 1000 > cue.at + cue.window + 250)
          for (const id of Object.keys(s.answered))
            if (!s.answered[id].includes(cue.id)) {
              s.answered[id].push(cue.id);
              s.combo[id] = 0;
              s.bar = Math.max(0, s.bar - 3);
            }
    if (s.def.id === "horror.dont-blink")
      for (const id of Object.keys(s.statues)) {
        if (s.statues[id] >= 1) continue;
        const holding = (s.holds[id] ?? 0) > s.elapsed * 1000;
        s.statues[id] += holding ? 0 : dt * 0.05;
        s.scores[id] += dt * 10;
      }
    if (
      s.def.id === "horror.dont-blink" &&
      Object.values(s.statues).every((value) => value >= 1)
    )
      s.ended = true;
    if (s.def.config.drain) {
      s.bar = Math.max(0, s.bar - dt * 0.8);
      if (s.bar <= 0) s.ended = true;
    }
    if (s.elapsed * 1000 > (s.cues.at(-1)?.at ?? 0) + 7000) s.ended = true;
  },
  done: (s) => s.ended,
  result: (s) => rank(s.scores, "Best timing wins"),
  snapshot(s) {
    return {
      engine: "pulse",
      elapsed: s.elapsed,
      players: s.players,
      scores: s.scores,
      bar: s.bar,
      combo: s.combo,
      statues: s.statues,
      cues: s.cues
        .filter(
          (c) =>
            c.at >= s.elapsed * 1000 - 7000 && c.at < s.elapsed * 1000 + 3000,
        )
        .map((c) => ({
          ...c,
          answer:
            c.kind === "choice" || s.def.id === "arcade.penalty-shootout"
              ? undefined
              : c.answer,
          preview: s.elapsed * 1000 < c.at ? c.preview : undefined,
        })),
      role:
        s.def.id === "arcade.penalty-shootout"
          ? {
              shooter:
                s.players[
                  Math.min(
                    s.cues.length - 1,
                    Math.max(
                      0,
                      Math.floor(
                        (s.elapsed * 1000 - 1000) /
                          number(s.def, "interval", 3000),
                      ),
                    ),
                  ) % 2
                ]?.id,
            }
          : undefined,
      serverTime: s.elapsed * 1000,
    };
  },
};
