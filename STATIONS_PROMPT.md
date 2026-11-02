# Build prompt: Watchworld station games (54 games, 6 engines)

Paste everything below into Codex.

---

You are building the multiplayer station games for Watchworld, a Twitch-only metaverse. Read `CONTRACT.md` and `GAMES.md` in the repo root first. `GAMES.md` has the design (six engines, nine planets, six games per planet). This prompt is the full build spec. Follow it exactly and tell me when something in it cannot be done.

## 0. What exists already

- Monorepo: `web/` (Vite 8, React 19, TypeScript, `@react-three/fiber` 9, `@react-three/drei` 10, `three` 0.186 pinned, `colyseus.js`) and `server/` (Node, Express, Colyseus, SQLite via `server/src/db.ts`).
- The world: `web/src/WatchSphere.tsx` renders a solar system of 9 genre planets. Each planet is a sphere with a layout (`SphereLayout` in `web/src/sphereLayout.ts`): `R`, `plots`, `lattice` (cube-sphere cells, see `sphereLattice.ts`), `countries`, `categories`, `ground(dir)` (height above sea level at a unit direction), `terrain`, `theme`. The player state lives in a ref `S` inside `Scene` (mode `orbit` / `walk` / `travel`, position `P` as a unit vector, forward `F`, `alt`, `vel`). You may read these; do not restructure them.
- Plots are cells on the lattice: `plot.cell` indexes `layout.lattice.cells`; cells have `centre` (unit vector), `corners`, `size` (metres). Streets run along some cell edges (`sphereCity.ts`, `RoadNet`). Hut cells are the countryside; cells with a larger tier are the city centres. Cells that are not in `layout.plots` are wilderness.
- Rooms: the theatre room is in `server/src/theater.ts` and `web/src/useRoom.ts` (the pattern to copy: rate limits, session ids, `joinOrCreate`).
- Streams come from `/api/streams`. Games must never reveal a streamer's real-world location or anything not already public on the stream object.

## 1. File ownership

Work in new folders only:

- `web/src/stations/**` for everything on the client.
- `server/src/stations/**` for everything on the server.
- `shared/stations/**` for types and constants both sides import (create it and add a path alias for it in both `tsconfig` files and in Vite).

You may make these small edits outside those folders, and nothing else:

1. `server/src/index.ts`: register the `station` room.
2. `web/src/WatchSphere.tsx`: add one `<StationLayer layout={layout} S={S} />` line inside `Scene` (next to `<Lots .../>`) and its import. Add a `Stations` row to the controls hint. Do not touch any other line of that file.
3. `CONTRACT.md`: document the new room and REST endpoint.
4. `web/src/styles.css` or a new `web/src/stations/stations.css` for HUD styling (prefer the new file).

Do not edit any `sphere*.ts(x)` file.

## 2. Architecture

### 2.1 Shared types (`shared/stations/types.ts`)

```ts
export type EngineId = 'arena' | 'track' | 'table' | 'pulse' | 'siege' | 'workshop'
export type PlanetId = 'chat' | 'creative' | 'strategy' | 'rpg' | 'sandbox' | 'arcade' | 'shooter' | 'horror' | 'other'
export type Phase = 'lobby' | 'countdown' | 'play' | 'results'
export type GameDef = {
  id: string            // e.g. 'chat.hot-take'
  planet: PlanetId
  engine: EngineId
  name: string
  blurb: string
  minPlayers: number
  maxPlayers: number
  roundSeconds: number
  space: '2d' | '3d'               // 2d games are flat (top-down or UI); the 9 marked 3D in section 5.8 are real 3D spaces
  view?: 'topdown' | 'third' | 'first'   // camera for 3D games; 2d games use topdown or ui
  config: Record<string, unknown>   // engine-specific parameters, see section 5
  theme: { accent: string; props: string[] }  // colours and prop names used for the skin
}
export const GAMES: GameDef[]        // all 54, filled in from section 5
```

`GAMES` is the single source of truth. Server and client both import it.

### 2.2 Engines (`server/src/stations/engines/*.ts`)

Each engine implements:

```ts
interface Engine<State, Input> {
  init(def: GameDef, players: PlayerInfo[], seed: number): State
  input(state: State, playerId: string, input: Input, now: number): void   // validate and clamp everything
  tick(state: State, dt: number, now: number): void                        // 20 Hz
  done(state: State): boolean
  result(state: State): { rank: string[]; scores: Record<string, number>; highlight?: string }
  snapshot(state: State, forPlayer: string): unknown                       // hide secret info per player
}
```

Engines are pure: no network, no clock calls other than the `now` passed in, seeded randomness (`mulberry32(seed)`), so they are unit-testable. Write Vitest tests for every engine (init, a scripted round, result ranking, illegal inputs rejected).

### 2.3 Room (`server/src/stations/StationRoom.ts`)

- Room name `station`. Join options `{ planet: PlanetId, game: string, name: string }`. Reject unknown game ids. One room per station: room id `station:<planet>:<gameId>:<n>` where `n` is the station copy number (stations of the same game are separate rooms).
- Phases: `lobby` (waits for `minPlayers`; once reached, starts a 15 s countdown, and starts early when the room is full), `countdown`, `play`, `results` (8 s), then back to `lobby`.
- Authoritative loop at 20 Hz via `setSimulationInterval`. Send `snapshot` at 10 Hz (arena, track, pulse) or on change (table, workshop, siege).
- Messages in: `ready`, `leave`, `input` (typed per engine). Messages out: `phase`, `snapshot`, `event` (toasts, sounds), `result`.
- Limits per client: at most 60 `input` messages per second, payloads capped at 512 bytes, text capped at 80 characters and stripped of control characters. Use the same moderation filter as the theatre chat for any free text. Kick for repeated violations.
- Seats are bound to the Colyseus session id; a player who disconnects has 20 s to rejoin, after which a bot takes the seat for arena, track and pulse, or the seat is dropped for table, siege and workshop (finish the round with fewer players if still above `minPlayers`, otherwise void it).
- Bots (`server/src/stations/bots.ts`): every engine has a simple bot so a station can start with one human (solo practice mode, no scoring toward weekly records). Bots are labelled "Bot" in the UI.

### 2.4 Persistence

Add tables in the existing SQLite database:

- `station_scores(game TEXT, week INTEGER, user_id TEXT, name TEXT, best REAL, wins INTEGER, plays INTEGER, PRIMARY KEY(game, week, user_id))`
- `station_wallet(user_id TEXT PRIMARY KEY, coins INTEGER)` (guests have no wallet; they play for fun)

REST (document in `CONTRACT.md`):

- `GET /api/stations/leaderboard?game=<id>` returns the top 10 of this week.
- `GET /api/stations/me` returns `{ coins }` for the logged-in user.

Coins: win +10, 2nd +6, 3rd +4, everyone else +2, never more than 200 coins per hour per user. Bots never award weekly records.

### 2.5 Client (`web/src/stations/`)

- `StationLayer.tsx`: the R3F component that places stations on the planet and handles proximity. Section 3.
- `StationHUD.tsx`: DOM overlay for the join prompt, lobby, per-engine UI, results.
- `useStation.ts`: joins and leaves the room, exposes `{ phase, snapshot, send, result }`.
- `engines/*.tsx`: one client view per engine (R3F scene for arena, track, pulse board visuals; DOM for table and workshop). Each takes the `GameDef` and renders the skin from `def.theme`.
- Reuse the existing low-poly look: flat colours, boxes, Kenney and Cube World models already in `web/public/models` (`/models/kenney`, `/models/cube`, `/models/blocky`, `/models/city`). Do not add new binary assets; build props from boxes and the existing models.
- While you are in a game: the world is paused for you only (stop sending movement to the world room, ignore WASD for walking, show a "Leave" button and the Escape key), then restore the walking state afterwards.

## 3. Placing the stations

`StationLayer` receives `layout: SphereLayout` and `S` (the player ref). It must be deterministic from the layout so every player sees the same stations: no randomness other than seeded by `layout.R` and the planet theme id.

**Plazas.** For each of the planet's countries (`layout.countries`, skip the "Other games" one unless there are fewer than 3 others), choose its plaza cell:
- the city cell closest to the country's `centroid` that has a street on at least two sides (`roadSides` in `sphereLattice.ts`),
- then use the cell and its 8 neighbours (a 3 by 3 block) as the plaza footprint. These neighbours are plots; do not remove them. Put the plaza in the **free ground inside the cell next to the plot**, between the plot's lot and the kerb, on the side of the cell furthest from the building. If that does not fit, use the nearest wilderness cell instead (a cell that is not in `layout.plots`; search by `lattice.cells` and skip any whose `centre` is a plot's direction).
- Maximum 6 plazas per planet, one per top country by viewers.
- Each plaza holds the planet's 6 games, one station per game, arranged on a circle of radius 14 m around a fountain. Each station is the same landmark footprint (about 5 by 5 m): a coloured kiosk with a roof in the game's accent colour, a big sign (canvas texture) with the game's name, a live line ("3/6 playing" or "Round 1:12"), and the best score this week.

**Outposts.** Additionally, for every 2,000 buildings on the planet, add one outpost in a wilderness cell near a road junction: one or two stations (chosen by seed) on a dirt crossing. They use the same kiosk look. Maximum 20 outposts per planet.

**Rules.**
- Stations sit on `layout.ground(dir)` height. Use the same projection idea as the plots (flat local frame projected onto the sphere).
- Never overlap a street (keep 10 m from any edge where `roadSides` is true) or a plot's footprint.
- `n` is the copy number of the station: plaza stations are copy 0 of the country's plaza id, outposts count upward. Room id is `station:<planet>:<gameId>:<n>`.

**Proximity.** When the player (`S.current.mode === 'walk'`) is within 5 m of a station, show the join prompt ("Press E to play <name> · 2/6 waiting"). Subscribe to live occupancy through a lightweight `GET /api/stations/occupancy?planet=<id>` (cached 2 s) rather than joining every room. Only render station signs (with their canvas textures) for stations within 150 m; show only the kiosk colours beyond that.

## 4. Quality bar

- TypeScript strict, no `any` in `shared/` or engines, lint-clean.
- 60 fps on a mid laptop with 6 stations visible: instanced geometry for kiosks and props, one canvas texture per sign.
- Every engine has a bot, a unit test, and a deterministic seed so a replay is reproducible.
- Sound is optional; if you add it, use the Web Audio API with synthesised blips (no assets) and a mute toggle.
- Accessibility: all game input has a keyboard path; colour is never the only signal (add shapes or labels).
- Do not mention any AI tool in code comments, commit messages or documentation.

## 5. Engine specifications and all 54 games

The six engines take parameters through `GameDef.config`. For each game below: `players` is `min-max`, `round` is seconds, and the config keys are exactly what the engine reads.

### 5.1 Arena (real time, top-down)

Map: a square or circular arena (`size` metres). Player: radius 0.5 m, speed 5 m/s, a dash (3 m, 2 s cooldown), and one attack. All state on the server.

Input: `{ move: [x, z] (normalised), aim: angle, attack: boolean, dash: boolean }`. Config keys:
- `size`: arena width in metres.
- `shape`: `square` or `circle`.
- `attack`: `bump` (knockback), `shoot` (projectile, speed, range, cooldown), `paint` (marks the floor), `melee` (arc, stamina).
- `hp`: hit points (0 for knockback-only games).
- `lives`: lives per player.
- `floor`: `solid`, `crumble` (tiles that vanish after being stepped on), `shrink` (the playable area shrinks every 15 s), `zone` (a moving scoring circle).
- `win`: `last` (last standing), `score` (most points), `tiles` (most floor painted), `zone` (most time in the zone).
- `team`: `none` or `2v2` or `lanes`.
- `pickups`: list of pickup kinds.

### 5.2 Track (race)

A generated course along a spline (seeded), `length` metres, with `checkpoints`. Each player runs it on a lane; collisions are ghost (no player-to-player blocking) but items can hit others.

Input: `{ steer: -1..1, throttle: 0..1, jump: boolean, boost: boolean }`. Config keys: `mode` (`foot`, `kart`, `cart`, `handcar`, `corridor`, `strafe`), `length`, `hazards`, `items`, `lives`, `scoring` (`time` or `time+accuracy`), `laps`.

### 5.3 Table (turn-based)

Server holds an authoritative game state; clients send a single `move` object that the server validates against the legal move set it computes. Config keys: `rules` (a named rule set implemented in `engines/table/rules/<name>.ts`), `turnSeconds` (30), `hands`.

### 5.4 Pulse (simultaneous cues)

A timed sequence of cues sent to everyone at the same server time. Clients send `{ cue: number, t: number }` where `t` is the client's estimate of server time; the server uses its own receive time minus the player's measured latency, clamped to 250 ms. Config keys: `cue` (`lane`, `target`, `blink`, `choice`, `cast`, `timing`, `corner`), `bpm` or `interval`, `windows` (perfect, good, ok in ms), `combo`, `drain` (shared bar), `rounds`.

### 5.5 Siege (co-op waves)

Players share a base. Each has a role that grants buttons. Waves spawn enemies on paths toward the base; between waves players spend points on upgrades. Config keys: `waves` (8), `roles` (list of `{ id, name, buttons }`), `enemies` (list), `base` (hit points), `upgrades`.

### 5.6 Workshop (create, then vote)

Phases: `prompt` (10 s), `make` (`makeSeconds`), `reveal` (show each entry for 6 s), `vote` (15 s), `results`. Entries are structured data, never raw uploads: `text` (80 characters), `pixels` (a 32 by 32 palette canvas), `blocks` (up to 60 blocks on a 12 by 12 by 8 grid), `layout` (widgets on a grid), `loops` (a track of 8 slots), `path` (a map island polygon from a brush). A player cannot vote for their own entry. Score = votes received. Config keys: `entry` (one of the kinds above), `makeSeconds`, `prompts` (list of 12 prompts the server picks from by seed).

### 5.8 The nine 3D games

Exactly nine games are real 3D spaces that players walk, jump or drive around in. Every other game is `space: '2d'` (flat play, drawn in 3D or as UI). The nine are:

| Planet | Game | View | What the 3D version is |
| --- | --- | --- | --- |
| Chat Isles | `chat.pool-party-brawl` | third | A pool with floating rings and a wave machine. Run, jump between rings and shoulder-barge others into the water. Water is a kill plane. |
| Creator Coast | `creative.paint-wars` | third | A three-level playground of ramps and platforms. Shoot or stamp paint onto walls and floors; score is surface area by colour (count tagged surface patches, not pixels). |
| Strategy Heights | `strategy.lane-push` | third | Three lanes with minions, towers and a base on each side. Heroes have a primary attack and two abilities. Teams of up to four. |
| Realm of Quests | `rpg.dungeon-delve` | third | Connected dungeon rooms with doors, chests, traps and waves. Four roles (tank, healer, striker, scout) with one ability each. Co-op. |
| Sandbox Lands | `sandbox.parkour-run` | third | A seeded tower of platforms: moving blocks, wall-slides, ziplines, checkpoints. First to the top wins; falling returns you to the last checkpoint. |
| Arcade & Sports | `arcade.kart-dash` | third | A short banked kart circuit with drift, boost pads and item boxes (boost, oil, shell). Two laps. |
| Battlefront | `shooter.last-drop` | third | A small island with buildings, loot crates and a shrinking safe zone. Hitscan guns, armour and medkits. Last player standing wins. |
| Haunted Hollow | `horror.lights-out` | first | A dark mansion with a torch (battery drains). One player is the monster and hunts; the others must find three fuses and reach the exit. |
| Frontier | `other.rail-rush` | first | A handcar on a rail network with switches and tunnels. Pump to speed up, throw switches to choose routes, first to the depot wins. |

**Shared 3D requirements.**

- **Space.** Server state holds `x, y, z`, `yaw`, `pitch` and velocity for every player. Gravity 22 m/s squared, jump impulse 8 m/s, walk 5 m/s, sprint 8 m/s (kart and handcar have their own speeds).
- **Collision.** Levels are lists of axis-aligned boxes (and a few ramps as wedge boxes) generated from the seed. Players are capsules (radius 0.4, height 1.8). Resolve movement server-side in fixed steps; clients predict and reconcile (replay unacknowledged inputs).
- **Input.** `{ seq, dt, move: [x, z], yaw, pitch, jump, sprint, primary, secondary, interact }`. The server clamps `dt` to 50 ms, rejects speeds above the limit, and ignores inputs with a sequence number it has already seen.
- **Camera.** Third person: orbit camera behind the player with mouse look (pointer lock), wall collision so the camera never goes through geometry. First person: eye at 1.65 m. Both reuse the world's controls (WASD, Shift, Space) and add Esc to leave.
- **Visuals.** Same low-poly flat-colour style as the world, built from boxes and the models already in `web/public/models`. Players appear as the blocky characters from `/models/blocky` (they keep the player's colour as a tint on the body). No new binary assets.
- **Performance.** At most 8 players and 600 level boxes per game; render the level as one merged mesh. Send snapshots at 15 Hz with interpolation on the client.
- **Fairness.** The server owns hit detection (raycasts against boxes and capsules), damage, pickups, timers and win conditions. Never trust a client position or hit report.
- **Bots.** Each has a simple navigation bot (waypoints through the level boxes, simple aim and timing noise) so a station can run with one human.
- **Tests.** Each 3D engine variant gets Vitest tests for collision (no tunnelling at high speed), jump height, kill planes, a scripted round to a winner, and rejection of impossible movement.

Implementation note: these nine are variants of the same engines (`arena`, `track`, `siege`) with `space: '3d'`, not new engines. Build one shared `world3d` module (physics, level generation helpers, camera, input) in `shared/stations/world3d/` and `web/src/stations/world3d/`, and use it for all nine.

### 5.7 The 54 games

**Chat Isles** (`planet: 'chat'`, accent `#ff9f6b`)

1. `chat.hot-take` Hot Take. Workshop, 3-8 players, 180 s. `entry: text`, prompts about harmless opinions (food, games, tech habits). Winner is the entry with the most votes; tie-break by fewer characters.
2. `chat.who-said-it` Who Said It. Pulse, 2-8, 90 s. `cue: choice`, 12 rounds of 6 s. The server picks four streamers of the planet at random and a short generic line from a bank of 200 written lines in `server/src/stations/data/chatLines.ts` (do not use real chat logs). Correct answers score 100 minus 10 per second. Wrong or late scores 0.
3. `chat.emote-charades` Emote Charades. Table, 3-6, 300 s. `rules: charades`. The describer gets a secret phrase from a bank and may send only emotes from a palette of 12. Others guess by typing. First correct guess scores the describer and the guesser; roles rotate each round; 6 rounds.
4. `chat.pool-party-brawl` Pool Party Brawl (**3D**, third person). Arena, 2-8, 90 s. `space: '3d'`. `shape: circle, size: 30, attack: bump, hp: 0, lives: 1, floor: shrink, win: last`.
5. `chat.subathon` Subathon. Siege, 2-6, 480 s. `waves: 8`, roles host, mod, clipper, editor. Enemies are "troll" (needs a mod button), "lag spike" (needs the editor), "chat flood" (needs the host), "viral clip" (needs the clipper, gives bonus points). `base`: the "stream health" bar.
6. `chat.road-trip` Road Trip. Track, 2-8, 120 s. `mode: kart, length: 1200, items: ['snack', 'battery'], hazards: ['traffic', 'cones'], scoring: time`. A battery meter drains; snacks refill it; running out ends the run.

**Creator Coast** (`planet: 'creative'`, accent `#f56bd6`)

7. `creative.beat-drop` Beat Drop. Pulse, 2-8, 120 s. `cue: lane` (4 lanes), `bpm: 110`, `windows: [50, 110, 180]`, `combo: true`, `drain: true`. A 120-second synthesised pattern generated from the seed.
8. `creative.speed-sketch` Speed Sketch. Workshop, 3-8, 210 s. `entry: pixels` (32 by 32, 16-colour palette), `makeSeconds: 180`.
9. `creative.remix-battle` Remix Battle. Table, 2-4, 360 s. `rules: remix`: 8 bars, 6 loop slots; players take turns placing loop tiles from a hand of 5; a loop must fit the key; players score for tiles that stay unchallenged for two turns.
10. `creative.paint-wars` Paint Wars (**3D**, third person). Arena, 2-8, 90 s. `space: '3d'`. `size: 36, shape: square, attack: paint, hp: 0, lives: 1, floor: solid, win: tiles`.
11. `creative.stream-overlay` Build Stream Overlay. Workshop, 3-8, 240 s. `entry: layout`, a 16 by 9 grid with widgets (webcam, chat, alerts, goal bar, now playing); the prompt names a vibe.
12. `creative.glitch-rescue` Glitch Rescue. Siege, 2-4, 300 s. `waves: 6`; roles each own a quadrant of a tile grid; enemies are corrupted tiles that need rotate, swap or recolour actions; the base is the "signal" bar.

**Strategy Heights** (`planet: 'strategy'`, accent `#5aa9ff`)

13. `strategy.lane-push` Lane Push (**3D**, third person). Arena, 2-8, 240 s. `space: '3d'`. `team: lanes`, `size: 60`, three lanes, minion waves every 12 s, towers with 20 hp, `attack: shoot`, `win: score` (destroy the enemy base).
14. `strategy.gambit` Gambit. Table, 2, 600 s. `rules: gambit`: chess with a shared deck of 8 power cards (extra move, shield, swap, teleport, and so on); win by checkmate or by collecting 3 cards.
15. `strategy.draft-night` Draft Night. Workshop, 3-8, 150 s. `entry: draft` (pick 5 of 12 units, 6 picks max time 12 s each); then the server auto-battles each pair and scores wins.
16. `strategy.tower-siege` Tower Siege. Siege, 2-6, 480 s. `waves: 10`; each player owns a lane and builds towers with points between waves.
17. `strategy.macro-dash` Macro Dash. Track, 2-8, 120 s. `mode: foot`, `length: 900`; spend points (earned along the way) to speed up your unit; `scoring: time`.
18. `strategy.read-the-meta` Read the Meta. Pulse, 2-8, 90 s. `cue: choice`, 3 s per round, 25 rounds; a matchup grid (rock-paper-scissors-lizard-spock style with 6 units); streak multiplies.

**Realm of Quests** (`planet: 'rpg'`, accent `#a98bff`)

19. `rpg.dungeon-delve` Dungeon Delve (**3D**, third person). Siege, 2-4, 420 s. `space: '3d'`. Roles tank, healer, striker, scout. Rooms of enemies with doors; `waves: 7`.
20. `rpg.raid-night` Raid Night. Siege, 3-6, 360 s. One boss, three phases, floor hazards (fire, orbs). A player standing in a hazard damages the shared base.
21. `rpg.fishing-hole` Fishing Hole. Pulse, 2-8, 120 s. `cue: cast`, `rounds: 8`; a moving gauge to stop in the green zone; heavier fish need a smaller zone.
22. `rpg.tavern-dice` Tavern Dice. Table, 2-4, 420 s. `rules: bluff-dice`: Liar's dice, 5 dice each.
23. `rpg.duel-of-bards` Duel of Bards. Arena, 2-8, 180 s. `shape: circle, size: 24, attack: melee, hp: 100, lives: 1, floor: solid, win: last` with stamina and parry.
24. `rpg.quest-board` Quest Board. Workshop, 3-8, 180 s. `entry: text`; each entry is a one-line quest; then the table votes; the winning quest is shown as a short two-choice text adventure the server generates from templates.

**Sandbox Lands** (`planet: 'sandbox'`, accent `#6bdc8b`)

25. `sandbox.block-build-off` Block Build-off. Workshop, 3-8, 210 s. `entry: blocks`, 60 blocks, 3 minutes.
26. `sandbox.parkour-run` Parkour Run (**3D**, third person). Track, 2-8, 120 s. `space: '3d'`. `mode: foot`, procedural platforms, `checkpoints: 8`, `scoring: time`.
27. `sandbox.spleef` Spleef. Arena, 2-8, 120 s. `size: 28, floor: crumble, attack: bump, win: last`.
28. `sandbox.heist-crew` Heist Crew. Siege, 4, 360 s. Roles driver, hacker, lockpick, lookout; each wave is a timed step each role must complete in sequence.
29. `sandbox.chaos-cart` Chaos Cart. Track, 2-8, 90 s. `mode: cart`, forks every 10 s, `hazards: ['lava','gap']`.
30. `sandbox.trade-post` Trade Post. Table, 2-4, 480 s. `rules: barter`: complete 3 recipes by trading resource cards.

**Arcade & Sports** (`planet: 'arcade'`, accent `#ffd84d`)

31. `arcade.street-brawl` Street Brawl. Arena, 2 (plus spectators), 120 s. `attack: melee, hp: 100, lives: 2, size: 16, shape: square, win: last`; spectators place coin bets (cosmetic only).
32. `arcade.kart-dash` Kart Dash (**3D**, third person). Track, 2-8, 100 s. `space: '3d'`. `mode: kart, laps: 2, items: ['boost','oil','shell']`.
33. `arcade.penalty-shootout` Penalty Shootout. Pulse, 2, 120 s. `cue: corner`, best of 5 rounds, roles swap each round.
34. `arcade.pong-royale` Pong Royale. Arena, 2-8, 120 s. `shape: circle, size: 30`, paddles on a ring, `lives: 5`, one ball.
35. `arcade.hoops` Hoops. Pulse, 2-8, 90 s. `cue: timing`; release at the peak; streaks light the net.
36. `arcade.pit-stop` Pit Stop. Siege, 2-5, 240 s. Roles per wheel and fuel; `waves: 6`; enemies are the arriving cars with a timer.

**Battlefront** (`planet: 'shooter'`, accent `#ff5a5a`)

37. `shooter.last-drop` Last Drop (**3D**, third person). Arena, 4-8, 240 s. `space: '3d'`. `size: 80, shape: circle, attack: shoot, hp: 100, lives: 1, floor: shrink, pickups: ['ammo','medkit','armor'], win: last`.
38. `shooter.bomb-site` Bomb Site. Table, 2-4, 480 s. `rules: site-plan`: attackers and defenders pick positions in secret, the server resolves; best of 7.
39. `shooter.aim-lab` Aim Lab. Pulse, 2-8, 60 s. `cue: target`; targets appear; score for speed and accuracy.
40. `shooter.horde` Horde. Siege, 2-6, 480 s. `waves: 10`, limited ammo, revives.
41. `shooter.hot-zone` Hot Zone. Arena, 2-8, 150 s. `size: 40, attack: shoot, floor: zone, win: zone`.
42. `shooter.strafe-run` Strafe Run. Track, 2-8, 90 s. `mode: strafe`, small targets along the course; `scoring: time+accuracy`.

**Haunted Hollow** (`planet: 'horror'`, accent `#18d6c4`)

43. `horror.lights-out` Lights Out (**3D**, first person). Arena, 3-8, 150 s. `space: '3d'`. One player is the monster (chosen by seed); `size: 36`, a torch cone with a battery; `win` for the monster is catching all.
44. `horror.seance` Séance. Table, 3-5, 360 s. `rules: seance`: each player sees one third of a symbol grid and must describe it; the group solves 4 rituals.
45. `horror.dont-blink` Don't Blink. Pulse, 2-8, 90 s. `cue: blink`: statues advance when you release the hold button; you can hold for at most 3 s before your hand shakes and you lose a second.
46. `horror.haunted-house-dash` Haunted House Dash. Track, 2-8, 90 s. `mode: corridor`, rooms rearrange (seeded); a ghost chases; `scoring: time`.
47. `horror.last-candle` Last Candle. Siege, 2-5, 360 s. `waves: 8`; place wards and light lamps; the base is a candle.
48. `horror.ghost-story` Ghost Story. Workshop, 3-8, 240 s. `entry: text`; each player adds one sentence in turn; then the table votes the scariest.

**Frontier** (`planet: 'other'`, accent `#9aa0aa`)

49. `other.wild-card` Wild Card. Pulse, 2-8, 120 s. 6 rounds, each a random `cue` type and rules from the other Pulse games.
50. `other.wagon-trail` Wagon Trail. Siege, 2-5, 420 s. `waves: 8` events (river, bandits, storm, trade); roles wagon, scout, hunter, trader.
51. `other.treasure-dig` Treasure Dig. Table, 2-4, 360 s. `rules: dig`: a hidden 8 by 8 grid; each turn digs a cell or scans a row.
52. `other.map-makers` Map Makers. Workshop, 3-8, 210 s. `entry: path`; the winning island is stored and shown as a tiny model on the station for a week.
53. `other.rail-rush` Rail Rush (**3D**, first person). Track, 2-8, 90 s. `space: '3d'`. `mode: handcar`, switches the players can throw; `scoring: time`.
54. `other.town-hall` Town Hall. Table, 3-8, 300 s. `rules: town-hall`: propose and vote on a station prize; trade votes.

## 6. Milestones (commit after each, with passing tests)

1. Shared types, the `GAMES` list, the room skeleton, persistence, the leaderboard endpoint.
2. `StationLayer`: placement, kiosks, signs, proximity and the join prompt, `useStation`.
3. Pulse engine (server and client), then its 9 games.
4. Arena (include the `world3d` module and the five Arena 3D games: Pool Party Brawl, Paint Wars, Lane Push, Last Drop, Lights Out), then Track (Parkour Run, Kart Dash, Rail Rush), Workshop, Table, Siege (Dungeon Delve), in that order.
5. Bots for every engine, then balance and polish.
6. Docs: update `CONTRACT.md` and `GAMES.md` with anything that changed.

After each milestone give me: what is done, how to test it by hand, and what I should look at in the browser. Do not start the next milestone until I confirm.
