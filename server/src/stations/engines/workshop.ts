import { roundDuration } from "../../../../shared/stations/duration.js";
import {
  base,
  time,
  rank,
  mulberry32,
  number,
  text,
  record,
  finite,
  clean,
  type BaseState,
  type Engine,
} from "./common.js";
type Entry = {
  text?: string;
  pixels?: number[];
  blocks?: { x: number; y: number; z: number; color: number }[];
  layout?: { kind: string; x: number; y: number }[];
  loops?: number[];
  path?: [number, number][];
  draft?: number[];
  draftSlot?: number;
};
export type WorkshopState = BaseState & {
  stage: "prompt" | "make" | "reveal" | "vote" | "results";
  prompt: string;
  entries: Record<string, Entry>;
  votes: Record<string, string>;
  reveal: string;
  adventure?: {
    question: string;
    choices: string[];
    outcomes: Record<string, string>;
  };
  winnerPath?: [number, number][];
};
export const workshop: Engine<WorkshopState, unknown> = {
  init(def, players, seed) {
    const rng = mulberry32(seed),
      prompts = Array.isArray(def.config.prompts)
        ? def.config.prompts.map(String)
        : ["Build a tiny world"];
    return {
      ...base(
        { ...def, roundSeconds: roundDuration(def, players.length) },
        players,
      ),
      stage: "prompt",
      prompt: prompts[Math.floor(rng() * prompts.length)] ?? "Create something",
      entries: {},
      votes: {},
      reveal: "",
    };
  },
  input(s, id, input) {
    if (!s.players.some((p) => p.id === id)) return;
    const v = record(input);
    if (!v) return;
    if (
      s.stage === "results" &&
      s.adventure &&
      finite(v.choice) &&
      [0, 1].includes(v.choice)
    ) {
      s.adventure.outcomes[id] =
        v.choice === 0
          ? "You follow a glowing trail and discover a hidden garden."
          : "A friendly innkeeper shares a map to tomorrow’s adventure.";
      return;
    }
    if (s.stage === "vote") {
      if (
        typeof v.vote === "string" &&
        v.vote !== id &&
        s.entries[v.vote] &&
        !s.votes[id]
      )
        s.votes[id] = v.vote;
      return;
    }
    if (s.stage !== "make") return;
    const kind = text(s.def, "entry", "text"),
      e = s.entries[id] ?? {};
    if (kind === "text" && typeof v.text === "string") {
      if (s.def.id === "horror.ghost-story") {
        const writer =
          s.players[
            Math.min(
              s.players.length - 1,
              Math.floor(
                Math.max(0, s.elapsed - 10) /
                  (number(s.def, "makeSeconds", 200) / s.players.length),
              ),
            )
          ];
        if (writer?.id !== id) return;
      }
      e.text = clean(v.text);
    }
    if (
      kind === "pixels" &&
      finite(v.index) &&
      finite(v.color) &&
      Number.isInteger(v.index) &&
      v.index >= 0 &&
      v.index < 1024 &&
      Number.isInteger(v.color) &&
      v.color >= 0 &&
      v.color < 16
    ) {
      e.pixels ??= Array(1024).fill(0) as number[];
      e.pixels[v.index] = v.color;
    }
    if (kind === "blocks") {
      if (v.clear === true) e.blocks = [];
      if (
        finite(v.x) &&
        finite(v.y) &&
        finite(v.z) &&
        finite(v.color) &&
        [v.x, v.y, v.z, v.color].every(Number.isInteger) &&
        v.x >= 0 &&
        v.x < 12 &&
        v.y >= 0 &&
        v.y < 8 &&
        v.z >= 0 &&
        v.z < 12 &&
        v.color >= 0 &&
        v.color < 16
      ) {
        e.blocks ??= [];
        if (
          e.blocks.length < 60 &&
          !e.blocks.some((b) => b.x === v.x && b.y === v.y && b.z === v.z)
        )
          e.blocks.push({ x: v.x, y: v.y, z: v.z, color: v.color });
      }
    }
    if (
      kind === "layout" &&
      typeof v.kind === "string" &&
      ["webcam", "chat", "alerts", "goal", "now-playing"].includes(v.kind) &&
      finite(v.x) &&
      finite(v.y) &&
      Number.isInteger(v.x) &&
      Number.isInteger(v.y) &&
      v.x >= 0 &&
      v.x < 16 &&
      v.y >= 0 &&
      v.y < 9
    ) {
      e.layout ??= [];
      e.layout = e.layout.filter((w) => w.kind !== v.kind);
      e.layout.push({ kind: v.kind, x: v.x, y: v.y });
    }
    if (
      kind === "loops" &&
      finite(v.slot) &&
      Number.isInteger(v.slot) &&
      v.slot >= 0 &&
      v.slot < 8 &&
      finite(v.loop) &&
      Number.isInteger(v.loop) &&
      v.loop >= 0 &&
      v.loop < 16
    ) {
      e.loops ??= Array(8).fill(0) as number[];
      e.loops[v.slot] = v.loop;
    }
    if (
      kind === "path" &&
      finite(v.x) &&
      finite(v.y) &&
      v.x >= 0 &&
      v.x <= 1 &&
      v.y >= 0 &&
      v.y <= 1
    ) {
      e.path ??= [];
      if (e.path.length < 60) e.path.push([v.x, v.y]);
    }
    if (
      kind === "draft" &&
      finite(v.unit) &&
      Number.isInteger(v.unit) &&
      v.unit >= 0 &&
      v.unit < 12
    ) {
      e.draft ??= [];
      const slot = Math.floor(Math.max(0, s.elapsed - 10) / 12);
      if (
        e.draft.length < 5 &&
        !e.draft.includes(v.unit) &&
        e.draftSlot !== slot
      ) {
        e.draft.push(v.unit);
        e.draftSlot = slot;
      }
    }
    s.entries[id] = e;
  },
  tick(s, dt) {
    time(s, dt);
    const make = number(s.def, "makeSeconds", 140),
      revealStart = 10 + make,
      voteStart = revealStart + s.players.length * 6,
      end = voteStart + 15;
    s.stage =
      s.elapsed < 10
        ? "prompt"
        : s.elapsed < revealStart
          ? "make"
          : s.elapsed < voteStart
            ? "reveal"
            : s.elapsed < end
              ? "vote"
              : "results";
    s.reveal =
      s.stage === "reveal"
        ? (s.players[
            Math.min(
              s.players.length - 1,
              Math.floor((s.elapsed - revealStart) / 6),
            )
          ]?.id ?? "")
        : "";
    if (s.stage === "results" || s.ended) {
      s.ended = true;
      for (const id of Object.keys(s.scores))
        s.scores[id] = Object.values(s.votes).filter((v) => v === id).length;
      if (text(s.def, "entry", "text") === "draft") {
        for (const a of s.players)
          for (const b of s.players) {
            if (a.id === b.id) continue;
            const aa = s.entries[a.id]?.draft ?? [],
              bb = s.entries[b.id]?.draft ?? [];
            const strength = (team: number[], other: number[]) =>
              team.reduce(
                (n, u) =>
                  n +
                  10 +
                  u +
                  other.filter((v) => (u - v + 12) % 3 === 1).length * 4,
                0,
              );
            if (strength(aa, bb) > strength(bb, aa)) s.scores[a.id]++;
          }
      }
      const winner = workshop.result(s).rank[0];
      if (s.def.id === "rpg.quest-board")
        s.adventure = {
          question: s.entries[winner]?.text ?? "Follow the mysterious trail?",
          choices: ["Explore the forest", "Visit the tavern"],
          outcomes: {},
        };
      if (s.def.id === "other.map-makers")
        s.winnerPath = s.entries[winner]?.path;
    }
  },
  done: (s) => s.ended,
  result(s) {
    const r = rank(s.scores);
    if (s.def.id === "chat.hot-take")
      r.rank.sort(
        (a, b) =>
          s.scores[b] - s.scores[a] ||
          (s.entries[a]?.text?.length ?? 999) -
            (s.entries[b]?.text?.length ?? 999) ||
          a.localeCompare(b),
      );
    return r;
  },
  snapshot(s, forPlayer) {
    const visible =
      (s.stage === "prompt" || s.stage === "make") &&
      s.def.id !== "horror.ghost-story"
        ? Object.fromEntries(
            Object.entries(s.entries).filter(([id]) => id === forPlayer),
          )
        : s.entries;
    return {
      engine: "workshop",
      elapsed: s.elapsed,
      players: s.players,
      scores: s.scores,
      stage: s.stage,
      prompt: s.prompt,
      entries: visible,
      reveal: s.reveal,
      writer:
        s.def.id === "horror.ghost-story"
          ? s.players[
              Math.min(
                s.players.length - 1,
                Math.floor(
                  Math.max(0, s.elapsed - 10) /
                    (number(s.def, "makeSeconds", 200) / s.players.length),
                ),
              )
            ]?.id
          : undefined,
      voted: !!s.votes[forPlayer],
      adventure: s.adventure,
      winnerPath: s.winnerPath,
    };
  },
};
