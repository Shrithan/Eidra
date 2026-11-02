export type {
  EngineId,
  PlanetId,
  Phase,
  PlayerInfo,
  GameResult,
  Engine,
} from "./model.d.ts";
export { GAMES } from "./games.js";

import type { GameDef as CatalogueGameDef } from "./model.d.ts";
export type GameDef = CatalogueGameDef & {
  space: "2d" | "3d";
  view?: "topdown" | "third" | "first" | "ui";
};
