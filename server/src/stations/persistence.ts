import type { DatabaseSync } from "node:sqlite";
import type { GameResult } from "../../../shared/stations/model.d.ts";
export function weekOf(now = Date.now()): number {
  return Math.floor((now - Date.UTC(1970, 0, 5)) / 604800000);
}
export function createStationStore(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS station_scores(
    game TEXT, week INTEGER, user_id TEXT, name TEXT, best REAL, wins INTEGER, plays INTEGER,
    PRIMARY KEY(game,week,user_id));
    CREATE TABLE IF NOT EXISTS station_wallet(user_id TEXT PRIMARY KEY,coins INTEGER);
    CREATE TABLE IF NOT EXISTS station_awards(round_id TEXT,user_id TEXT,at INTEGER,coins INTEGER,
    PRIMARY KEY(round_id,user_id));
    CREATE INDEX IF NOT EXISTS station_awards_time ON station_awards(user_id,at);`);
  return {
    leaderboard(game: string, now = Date.now()) {
      return db
        .prepare(
          "SELECT user_id AS userId,name,best,wins,plays FROM station_scores WHERE game=? AND week=? ORDER BY best DESC,wins DESC,user_id LIMIT 10",
        )
        .all(game, weekOf(now));
    },
    coins(userId: string): number {
      return (
        (
          db
            .prepare("SELECT coins FROM station_wallet WHERE user_id=?")
            .get(userId) as { coins: number } | undefined
        )?.coins ?? 0
      );
    },
    record(
      roundId: string,
      game: string,
      result: GameResult,
      users: Map<string, { id: string; name: string }>,
      practice: boolean,
      now = Date.now(),
    ) {
      if (practice) return;
      const seen = new Set<string>();
      db.exec("BEGIN IMMEDIATE");
      try {
        result.rank.forEach((sessionId, index) => {
          const user = users.get(sessionId),
            score = result.scores[sessionId];
          if (!user || seen.has(user.id) || !Number.isFinite(score)) return;
          seen.add(user.id);
          if (
            db
              .prepare(
                "SELECT 1 FROM station_awards WHERE round_id=? AND user_id=?",
              )
              .get(roundId, user.id)
          )
            return;
          const earned = (
            db
              .prepare(
                "SELECT COALESCE(SUM(coins),0) AS total FROM station_awards WHERE user_id=? AND at>?",
              )
              .get(user.id, now - 3600000) as { total: number }
          ).total;
          const coins = Math.max(
            0,
            Math.min([10, 6, 4][index] ?? 2, 200 - earned),
          );
          db.prepare("INSERT INTO station_awards VALUES(?,?,?,?)").run(
            roundId,
            user.id,
            now,
            coins,
          );
          db.prepare(
            "INSERT INTO station_wallet VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET coins=coins+excluded.coins",
          ).run(user.id, coins);
          db.prepare(
            `INSERT INTO station_scores VALUES(?,?,?,?,?,?,1) ON CONFLICT(game,week,user_id)
            DO UPDATE SET name=excluded.name,best=MAX(best,excluded.best),wins=wins+excluded.wins,plays=plays+1`,
          ).run(
            game,
            weekOf(now),
            user.id,
            user.name,
            score,
            index === 0 ? 1 : 0,
          );
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
