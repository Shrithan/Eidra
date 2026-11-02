import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStationStore, weekOf } from "./persistence.js";
import { GAMES } from "./catalog.js";

test("scores, wallets, idempotency, rolling hourly cap, guests, practice, week rollover and disk restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "station-store-"));
  const path = join(dir, "test.sqlite");
  let db = new DatabaseSync(path);
  try {
    let store = createStationStore(db);
    const now = Date.UTC(2026, 10, 2);
    const users = new Map([
      ["a", { id: "user-a", name: "Alice" }],
      ["b", { id: "user-b", name: "Bob" }],
    ]);
    const result = {
      rank: ["a", "b", "guest"],
      scores: { a: 100, b: 50, guest: 10 },
    };
    store.record("practice", "chat.hot-take", result, users, true, now);
    assert.equal(store.coins("user-a"), 0);
    store.record("round-1", "chat.hot-take", result, users, false, now);
    store.record("round-1", "chat.hot-take", result, users, false, now);
    assert.equal(store.coins("user-a"), 10);
    assert.equal(store.coins("user-b"), 6);
    assert.equal(store.coins("guest"), 0);
    assert.equal(store.leaderboard("chat.hot-take", now).length, 2);
    for (let i = 2; i <= 30; i++)
      store.record(
        `round-${i}`,
        "chat.hot-take",
        result,
        users,
        false,
        now + i,
      );
    assert.equal(store.coins("user-a"), 200);
    store.record("later", "chat.hot-take", result, users, false, now + 3601000);
    assert.equal(store.coins("user-a"), 210);
    assert.equal(store.leaderboard("chat.hot-take", now + 604800000).length, 0);
    assert.equal(weekOf(now + 604800000), weekOf(now) + 1);
    db.close();
    db = new DatabaseSync(path);
    store = createStationStore(db);
    assert.equal(store.coins("user-a"), 210);
    assert.equal(
      (store.leaderboard("chat.hot-take", now)[0] as { plays: number }).plays,
      31,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
