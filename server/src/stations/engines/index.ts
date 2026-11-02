import { worldVariant } from "./world3d/variant.js";
import {
  record,
  type BaseState,
  type GameDef,
  type PlayerInfo,
  type Engine,
} from "./common.js";
import { pulse } from "./pulse.js";
import { arena } from "./arena.js";
import { track } from "./track.js";
import { table } from "./table.js";
import { workshop } from "./workshop.js";
import { siege } from "./siege.js";
import { pool } from "./pool.js";
export const engines = { pulse, arena, track, table, workshop, siege, pool };
function bind<S extends BaseState>(
  engine: Engine<S, unknown>,
  def: GameDef,
  players: PlayerInfo[],
  seed: number,
) {
  const state = engine.init(def, players, seed);
  return {
    input: (id: string, v: unknown, now: number) =>
      engine.input(state, id, v, now),
    tick: (dt: number, now: number) => engine.tick(state, dt, now),
    done: () => engine.done(state),
    result: () => engine.result(state),
    snapshot: (id: string) => engine.snapshot(state, id),
    latency: (id: string, ms: number) => {
      const value = record(state);
      const latency = record(value?.latency);
      if (latency) latency[id] = Math.min(250, Math.max(0, ms));
    },
    depart: (id: string, bot: boolean) => {
      if (bot) {
        const p = state.players.find((p) => p.id === id);
        if (p) {
          p.bot = true;
          p.name = "Bot";
        }
      } else {
        state.players = state.players.filter((p) => p.id !== id);
        delete state.scores[id];
      }
    },
    state,
  };
}
export type Runner = Omit<ReturnType<typeof bind<BaseState>>, "state">;
export function createRunner(
  def: GameDef,
  players: PlayerInfo[],
  seed: number,
): Runner {
  if (def.space === "3d") return bind(worldVariant, def, players, seed);
  switch (def.engine) {
    case "pulse":
      return bind(pulse, def, players, seed);
    case "arena":
      return bind(arena, def, players, seed);
    case "track":
      return bind(track, def, players, seed);
    case "table":
      return bind(table, def, players, seed);
    case "workshop":
      return bind(workshop, def, players, seed);
    case "siege":
      return bind(siege, def, players, seed);
    case "pool":
      return bind(pool, def, players, seed);
  }
}
