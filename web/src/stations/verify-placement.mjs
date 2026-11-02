// From web/: node --import ../server/node_modules/tsx/dist/loader.mjs src/stations/verify-placement.mjs
import assert from "node:assert/strict";
import { layoutSystem } from "../sphereLayout.ts";
import { placeStations } from "./placement.ts";
const categories = [
  "Just Chatting",
  "Art",
  "Chess",
  "World of Warcraft",
  "Minecraft",
  "Retro",
  "Valorant",
  "Phasmophobia",
  "Other",
];
const streams = Array.from({ length: Number(process.env.N ?? 5000) }, (_, i) => ({
  id: String(i),
  login: `stream${i}`,
  displayName: `Stream ${i}`,
  title: "Demo",
  game: categories[i % 9],
  viewers: 1000 - (i % 1000),
  language: "en",
  thumbnail: "",
  location: null,
}));
for (const { layout } of layoutSystem(streams)) {
  const start = performance.now();
  const a = placeStations(layout),
    b = placeStations(layout);
  assert.ok(a.stations.length >= 8, `${layout.theme.id} has game blocks`);
  assert.deepEqual(
    a.stations.map((s) => s.key),
    b.stations.map((s) => s.key),
  );
  assert.equal(new Set(a.stations.map((s) => s.key)).size, a.stations.length);
  for (const s of a.stations) {
    assert.ok(
      layout.plots.every(
        (p) => p.dir.angleTo(s.dir) * layout.R > p.footprint * 0.71 + 4,
      ),
    );
    assert.ok(
      Math.abs(s.position.length() - layout.R - layout.ground(s.dir)) < 0.001,
    );
  }
  console.log(
    "PASS",
    layout.theme.id,
    a.stations.length,
    "stations",
    Math.round(performance.now() - start),
    "ms (two placements)",
  );
}
