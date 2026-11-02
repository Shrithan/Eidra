import { db } from "../db.js";
import { weekOf } from "./persistence.js";
import type { Express } from "express";
import { identity } from "../auth.js";
import { gamesById, GAMES } from "./catalog.js";
import { stationStore } from "./store.js";
export { stationStore } from "./store.js";
import { occupancy } from "./StationRoom.js";
export { StationRoom } from "./StationRoom.js";

export function installStations(app: Express) {
  app.get("/api/stations/leaderboard", (req, res) => {
    if (typeof req.query.game !== "string" || !gamesById.has(req.query.game)) {
      res.status(400).json({ error: "Unknown game" });
      return;
    }
    res.json(stationStore.leaderboard(req.query.game));
  });
  app.get("/api/stations/art", (req, res) => {
    if (req.query.game !== "other.map-makers") {
      res.status(400).json({ error: "Unknown art station" });
      return;
    }
    const row = db
      .prepare("SELECT payload FROM station_art WHERE game=? AND week=?")
      .get("other.map-makers", weekOf()) as { payload: string } | undefined;
    res.json({ path: row ? JSON.parse(row.payload) : null });
  });
  app.get("/api/stations/me", (req, res) => {
    const user = identity(req.headers);
    if (!user) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    res.json({ coins: stationStore.coins(user.id) });
  });
  let cache = { at: 0, rows: [...occupancy.values()] };
  app.get("/api/stations/occupancy", (req, res) => {
    const planet = req.query.planet;
    if (
      typeof planet !== "string" ||
      !GAMES.some((game) => game.planet === planet)
    ) {
      res.status(400).json({ error: "Unknown planet" });
      return;
    }
    if (Date.now() - cache.at >= 2000)
      cache = { at: Date.now(), rows: [...occupancy.values()] };
    res
      .set("Cache-Control", "public, max-age=2")
      .json(cache.rows.filter((row) => row.planet === planet));
  });
}
