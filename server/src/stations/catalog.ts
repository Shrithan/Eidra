import { GAMES } from "../../../shared/stations/games.js";
export { GAMES };
export const gamesById = new Map(GAMES.map((game) => [game.id, game]));
