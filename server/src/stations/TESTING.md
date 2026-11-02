# Station verification

From the repository root:

```sh
npm --prefix server/src/stations ci
npm --prefix server/src/stations test
node --import ./server/node_modules/tsx/dist/loader.mjs --test server/src/stations/milestone1.test.ts
server/node_modules/.bin/tsc --noEmit -p server/src/stations/tsconfig.tests.json
npm --prefix shared/stations/world3d run check
npm run build
```

Station tests rebuild shared world3d automatically. Runtime has no new dependency; generated
JS/types are committed. When editing shared physics directly, run
`npm --prefix shared/stations/world3d run build` before starting/reloading dev. Normal app
builds exclude Vitest files/config and do not require the nested test-tool installation.

The test suite checks every catalogue definition and six engines; exact 9/45 space split and
camera choices; deterministic physics/levels; capsule tunnelling, jump height, ramps, kill
planes, objective winners, ray occlusion, impossible controls, bounded input queues and input
replay; private hands/clues/entries, accepted trades, chess special moves, four rituals;
co-op spawn boundaries, boss phases, role repair parts, wards and lamps. Persistence tests
cover restart, idempotency, weekly rollover, guests/practice and the rolling hourly award cap.

From `server/`, run the two isolated websocket suites (each uses its own temporary DB/port):

```sh
WATCHWORLD_DATA_DIR=$(mktemp -d) node --import tsx src/stations/verify.ts
WATCHWORLD_DATA_DIR=$(mktemp -d) node --import tsx src/stations/verify3d.ts
```

The lifecycle suite takes approximately 85 seconds because workshop stages and twenty-second
disconnect expiry are real. It checks six engines, phase/results cycling, reconnect, replacement
bots/voiding, packet kicks, spectators, predictions and practice. The 3D suite checks two clients
in every 3D variant, vertical state, approximately 15 Hz snapshots, bounded input bursts and
results. Both shorten round durations only in their process. Expected negative cases print
Colyseus errors; PASS lines and exit status are authoritative. No `.env` is loaded or Twitch
message sent. Full account-to-account wallet awards remain a manual multi-account check.

From `web/`, verify deterministic terrain/street/plot placement:

```sh
node --import ../server/node_modules/tsx/dist/loader.mjs src/stations/verify-placement.mjs
```

Run the existing root `npm run dev` and open:

http://localhost:5173/src/stations/preview.html

Choose a game and join. Use **Solo practice with bots**, or join the same game from other tabs
until its minimum is reached. Practice also fills required co-op roles. Full rooms start early;
otherwise countdown lasts fifteen seconds. This picker is development-only, not a production
entry. Street Brawl offers Watch fight when fighter seats are full; predictions are cosmetic.

3D checks: try Dungeon Delve for a third-person room/doors and role ability, Paint Wars for
ramps/coloured surface patches, Parkour for jumping/checkpoints, Kart Dash for drift/items,
and Rail Rush or Lights Out for first person. Click the scene for pointer lock. Keyboard look
is U/O/I/K; WASD move, Shift sprint, Space jump/drift/pump, J/Enter/mouse primary, Q secondary,
E collect/interact. At rail switches use A/D + E. Check wall camera avoidance, real height,
checkpoint recovery, remote interpolation and smooth correction. FPS is shown while playing.
Escape exits the station; Leave is always available. Active station rendering suspends the
background world canvas and resumes it with the previous walking position/heading.

Flat checks: drag paint on Speed Sketch; brush an island in Map Makers (numeric entry remains
available by keyboard); submit a Hot Take and vote for another player; use legal actions on a
table; aim at Pulse targets, use the timing gauge, hold statues with rests, or pick counter
units; switch co-op roles and avoid Raid Night's indicated hazard quadrant. All inputs have a
keyboard path. Tab remains within the modal. No audio assets or synthesized sound are enabled.

World integration: enter a planet, approach a coloured kiosk, then press E within 5 m. Signs
within 150 m show occupancy/timer and weekly best. Watch for clipped signs, overlaps and stuck
movement on exit. Kiosks are instanced; level geometry is merged. The tests are not a hardware
certification of sustained 60 fps on every mid-range laptop.

```sh
curl 'http://localhost:2567/api/stations/leaderboard?game=chat.hot-take'
curl 'http://localhost:2567/api/stations/occupancy?planet=chat'
curl 'http://localhost:2567/api/stations/me'
```

Empty boards/occupancy are `[]`; a guest wallet is 401. Authenticated users see coins in the
overlay. Map Makers' ranked winner is exposed by `/api/stations/art?game=other.map-makers`.
