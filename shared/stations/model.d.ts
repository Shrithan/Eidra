export type EngineId =
  "arena" | "track" | "table" | "pulse" | "siege" | "workshop" | "pool";
export type PlanetId =
  | "chat"
  | "creative"
  | "strategy"
  | "rpg"
  | "sandbox"
  | "arcade"
  | "shooter"
  | "horror"
  | "other"
  | "home";
export type Phase = "lobby" | "countdown" | "play" | "results";
export type GameDef = {
  id: string;
  planet: PlanetId;
  engine: EngineId;
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  roundSeconds: number;
  space: "2d" | "3d";
  view?: "topdown" | "third" | "first" | "ui";
  config: Record<string, unknown>;
  theme: { accent: string; props: string[] };
};
export type PlayerInfo = { id: string; name: string; bot: boolean };
export type GameResult = {
  rank: string[];
  scores: Record<string, number>;
  highlight?: string;
};
export interface Engine<State, Input> {
  init(def: GameDef, players: PlayerInfo[], seed: number): State;
  input(state: State, playerId: string, input: Input, now: number): void;
  tick(state: State, dt: number, now: number): void;
  done(state: State): boolean;
  result(state: State): GameResult;
  snapshot(state: State, forPlayer: string): unknown;
}
