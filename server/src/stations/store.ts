import { db } from "../db.js";
import { createStationStore } from "./persistence.js";
export const stationStore = createStationStore(db);
db.exec(
  "CREATE TABLE IF NOT EXISTS station_art(game TEXT,week INTEGER,payload TEXT,PRIMARY KEY(game,week))",
);
