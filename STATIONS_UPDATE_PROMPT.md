# Mid-run update for Codex (paste as a new message while it is running)

---

Change of plan to the station games spec. Do not restart and do not throw away what you have built. Finish the milestone you are on, then follow this.

1. Re-read `STATIONS_PROMPT.md` from the repo root. Two things changed: `GameDef` has two new fields, `space: '2d' | '3d'` and `view?: 'topdown' | 'third' | 'first' | 'ui'`, and there is a new section **5.8 The nine 3D games**.
2. Right now, before your next commit, add those two fields to `shared/stations/types.ts` and to every entry in the `GAMES` catalogue. Set `space: '3d'` on exactly these nine ids and `space: '2d'` on the other 45:
   `chat.pool-party-brawl`, `creative.paint-wars`, `strategy.lane-push`, `rpg.dungeon-delve`, `sandbox.parkour-run`, `arcade.kart-dash`, `shooter.last-drop`, `horror.lights-out`, `other.rail-rush`.
   Views: third person for all of them except `horror.lights-out` and `other.rail-rush`, which are first person. 2D games use `topdown` (Arena, Track, Pulse, Siege) or `ui` (Table, Workshop). Update the catalogue test so it asserts exactly nine 3D games, one per planet.
3. The 3D games are variants of the existing `arena`, `track` and `siege` engines, not new engines. Build one shared 3D module (`shared/stations/world3d/` for physics, collision, level generation; `web/src/stations/world3d/` for camera, input, prediction) and use it for all nine. The full requirements (capsule collision against box levels, server-authoritative hits, client prediction, third and first person cameras, bots, tests) are in section 5.8.
4. Milestone order now: Arena engine (build the `world3d` module here and ship the five 3D arena games with it: Pool Party Brawl, Paint Wars, Lane Push, Last Drop, Lights Out), then Track (Parkour Run, Kart Dash, Rail Rush), then Workshop, Table, and Siege (with Dungeon Delve). Everything else in the spec is unchanged.
5. In your report for the milestone you are on, list anything in the new section that conflicts with what you already built, and what you changed to fix it.

Keep every rule from before: new folders only, no edits to `sphere*` files, no mention of any AI tool in code or docs, and stop for my confirmation after each milestone.
