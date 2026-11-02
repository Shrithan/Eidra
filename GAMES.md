> **Superseded:** the catalogue is now four games (Zombie Siege, Gunpoint Duel, Eight Ball, Chess) repeated on every planet, 50 of each per planet. See `shared/stations/games.js`. The 54-game design below is kept for reference only.

# Watchworld station games

Six multiplayer games on every planet, nine planets, 54 games in all. Each planet's six are themed on its genre, but they share six game engines, so we build six things and skin them nine ways.

## The six engines

| # | Engine | Players | Round | What the engine does |
| --- | --- | --- | --- | --- |
| 1 | **Arena** | 2 to 8 | 90 s | Top-down real-time. Move, one attack, one dash, pickups. Last one standing or most points. |
| 2 | **Track** | 2 to 8 | 60 to 120 s | A short course run on foot or in a vehicle. Checkpoints, boosts, hazards. Fastest wins. |
| 3 | **Table** | 2 to 4 | 5 to 10 min | Turn-based board or card game on a shared table. |
| 4 | **Pulse** | 2 to 8 | 90 s | Everyone hits the same cues at once (reaction, rhythm, memory). Score by accuracy and speed. |
| 5 | **Siege** | 2 to 6 | 8 waves | Co-op. Hold a point against waves, with roles and upgrades between waves. |
| 6 | **Workshop** | 2 to 8 | 3 min + vote | Everyone builds or performs from the same prompt, then the table votes. |

Every game is a station you walk up to and press **E**. A sign above it shows who is playing, the round timer, and the best score this week.

## Chat Isles (Just Chatting, IRL, talk shows)

| Game | Engine | How it works |
| --- | --- | --- |
| **Hot Take** | Workshop | A spicy prompt appears ("pineapple belongs on pizza"). Everyone writes a one-line defence, then votes for the funniest. Votes you get are your score. |
| **Who Said It** | Pulse | An authored fictional community line flashes up. Pick which of 4 streamers' communities said it before the timer runs out. Faster is worth more. |
| **Emote Charades** | Table | One player gets a secret phrase and can only send emotes. The others guess in chat. Roles rotate. |
| **Pool Party Brawl** | Arena | Everyone on inflatable rings in a pool. Bump people off the edge. Last ring floating wins. |
| **Subathon** | Siege | Keep the stream "alive" for 8 waves: answer chat, throw to ads, calm trolls. Each role (host, mod, clipper) has its own button. |
| **Road Trip** | Track | An IRL stream by car. Dodge traffic, grab snacks, reach the next city before the battery dies. |

## Creator Coast (music, art, creative, tech)

| Game | Engine | How it works |
| --- | --- | --- |
| **Beat Drop** | Pulse | Falling notes, four lanes, everyone on the same song. Combos stack, sloppy notes drain the shared hype bar. |
| **Speed Sketch** | Workshop | Draw the prompt on a pixel canvas in 3 minutes. Vote on the best; the winner's art hangs on the station. |
| **Remix Battle** | Table | Take turns placing loops on a shared 8-bar track. Each turn must keep the key. Players score for loops the others keep. |
| **Paint Wars** | Arena | Splat the floor with your colour and cover the most tiles. Overpaint rivals. |
| **Build Stream Overlay** | Workshop | Arrange widgets on a fake stream layout to a brief ("cozy art stream"). Vote on the nicest. |
| **Glitch Rescue** | Siege | A broken broadcast. Fix corrupted tiles (rotate, swap, recolour) before the signal dies. Co-op with split view. |

## Strategy Heights (MOBA, strategy, chess, card games)

| Game | Engine | How it works |
| --- | --- | --- |
| **Lane Push** | Arena | Three lanes, minions, one tower each. Win a lane, then the base. Teams of up to 4. |
| **Gambit** | Table | A compact chess variant with a shared deck of power cards. Win by checkmate or by collecting 3 cards. |
| **Draft Night** | Workshop | Everyone drafts a team from the same shuffled pool, then it auto-battles. Vote on the draft, tie-break by battle. |
| **Tower Siege** | Siege | Co-op tower defence. Place and upgrade towers between waves; each player owns one lane. |
| **Macro Dash** | Track | An RTS-flavoured race. Spend resources to speed units along a path before rivals do. |
| **Read the Meta** | Pulse | Counter-pick. A matchup flashes, choose the right counter in under 3 seconds. Streaks multiply. |

## Realm of Quests (RPG, MMO, fantasy)

| Game | Engine | How it works |
| --- | --- | --- |
| **Dungeon Delve** | Siege | A tiny dungeon with a tank, healer, damage dealer and a scout. Open doors, hold the room, loot between waves. |
| **Raid Night** | Siege | One big boss with phases. Dodge mechanics together; the whole table fails if one player stands in fire. |
| **Fishing Hole** | Pulse | Timing minigame. Everyone casts, the best catch of the round wins a trophy fish for the station. |
| **Tavern Dice** | Table | A bluffing dice game. Raise the bid, call the bluff, win coins for the tavern's wall of fame. |
| **Duel of Bards** | Arena | Melee duels in a small arena with stamina and parry. Bracket for 8. |
| **Quest Board** | Workshop | Players write a one-line quest for the group. The table votes the best, then plays it as a quick text adventure. |

## Sandbox Lands (Minecraft, Roblox, GTA, survival)

| Game | Engine | How it works |
| --- | --- | --- |
| **Block Build-off** | Workshop | Build the prompt ("a treehouse") with 60 blocks in 3 minutes. Vote. |
| **Parkour Run** | Track | A procedural obstacle course. Sprint, jump, wall-slide. Checkpoints save your progress. |
| **Spleef** | Arena | The floor crumbles where you step. Last one standing. |
| **Heist Crew** | Siege | A four-role co-op heist. The driver, hacker, lockpick and lookout each have to hit their part of the beat. |
| **Chaos Cart** | Track | Rollercoaster mine carts. Choose forks, stack boosts, avoid the lava. |
| **Trade Post** | Table | A resource trading game. Barter blocks to complete recipes before the others. |

## Arcade & Sports (fighting, racing, sports)

| Game | Engine | How it works |
| --- | --- | --- |
| **Street Brawl** | Arena | Side-on fighting for two, with spectators betting coins. Combos and a super meter. |
| **Kart Dash** | Track | Short cartoon kart laps with items. |
| **Penalty Shootout** | Pulse | One shoots, one saves, both pick a corner at the same moment. Best of 5. |
| **Pong Royale** | Arena | Pong for up to 8 with paddles on a ring. Last paddle with lives wins. |
| **Hoops** | Pulse | Rhythm shooting: release at the peak of the arc. Streaks light the net. |
| **Pit Stop** | Siege | Co-op pit crew. Each player has one tool; change four tyres fast while the car waits. |

## Battlefront (shooters, battle royale)

| Game | Engine | How it works |
| --- | --- | --- |
| **Last Drop** | Arena | A tiny battle royale on a shrinking island. Loot, shoot, survive. 8 players. |
| **Bomb Site** | Table | Plan, then execute. Attackers and defenders pick positions in secret, then the round resolves. |
| **Aim Lab** | Pulse | Targets pop up in sequence. Hit them fast and clean. Head-to-head or solo for the weekly board. |
| **Horde** | Siege | Hold a position against waves with limited ammo. Revive each other. |
| **Hot Zone** | Arena | King of the hill. The zone moves; stand in it to score. |
| **Strafe Run** | Track | Run an obstacle course with mini-targets along the way. Time plus accuracy. |

## Haunted Hollow (horror)

| Game | Engine | How it works |
| --- | --- | --- |
| **Lights Out** | Arena | Hide and seek in the dark. One is the monster and hunts by sound; the others hold a torch with a fading battery. |
| **Séance** | Table | A cooperative puzzle. Everyone sees only part of the clue and must describe it to solve the ritual. |
| **Don't Blink** | Pulse | Statues move when you look away. Tap to hold them, but your hand will tire. |
| **Haunted House Dash** | Track | A corridor that rearranges itself. Reach the exit before the ghost does. |
| **Last Candle** | Siege | Defend a candle through the night. Place wards, light lamps, and keep it alive until dawn. |
| **Ghost Story** | Workshop | Everyone adds one sentence to a story. The table votes for the scariest. |

## Frontier (everything else, special events)

| Game | Engine | How it works |
| --- | --- | --- |
| **Wild Card** | Pulse | A mixed bag of quick games with random rules. Every round is different. |
| **Wagon Trail** | Siege | A co-op trail across the planet with events, trade and hunting. |
| **Treasure Dig** | Table | Dig-and-deduce. Clues narrow the grid; spend a turn to dig or scan. |
| **Map Makers** | Workshop | Draw a tiny island from a prompt, then vote. The winning map is seeded as a real island for the week. |
| **Rail Rush** | Track | A handcar race along rails with switches. |
| **Town Hall** | Table | A vote-and-trade game that decides next week's station prize. |

## Where the stations go

Most of the planet is empty, so each planet gets a **station plaza** in the middle of each of its biggest countries (the busiest game's district) and a few smaller **outposts** out in the wilderness between districts.

- A plaza holds all six stations around a small paved square, with a fountain and benches. Each country's plaza uses its game's accent colour.
- Outposts hold one or two stations on a dirt crossing, so players find a game as they travel.
- The plaza is on a street, so cars can stop there.
- Stations are fixed in the world, so the same game is in the same place for everyone.

## How it plays

1. Walk up to a station and press **E**. A ring around the station shows who is already in.
2. The station fills from the seats around it (2 to 8 depending on the game). It starts when it's full or 15 seconds after the second player joins.
3. The camera pulls in over the table or arena. The rest of the world is paused for you only.
4. When the round ends, coins go to the winners, the sign updates, and you drop back into the world.

## What the server needs

The server (the integration teammate's side) needs one new room type.

- **Room:** `station`, one room per station, logical key `station:<planet>:<gameId>:<copy>` (transport ID as documented in CONTRACT.md). Joined with `joinOrCreate("station", { planet, game })`.
- **Authority:** the server runs the game loop at 20 Hz and sends state. Clients send only inputs (move, press, vote, choose).
- **State:** `phase` (`lobby`, `countdown`, `play`, `results`), `players`, `timer`, and an engine-specific `game` object.
- **Messages out:** `input`, `ready`, `leave`. In: `snapshot`, `event`, `result`.
- **Persistence:** weekly best score and wins per station, in the existing SQLite database.
- **Rate limits:** same as the theatre room (inputs per second, chat per 2 seconds).
- **No stream data:** the games must not reveal where a real streamer lives or anything else from Twitch that isn't already public.

Build order: station placement and the join flow, then **Pulse** (simplest; one input), then **Arena**, **Track**, **Workshop**, **Table**, **Siege**.

## Open questions

- Do coins matter outside the stations (cosmetics, plot decorations)? If so the server needs a wallet.
- Should viewers watching a station from outside be able to bet or vote?
- Should the six games on each planet rotate weekly, so the same six aren't there forever?

## Implemented build

All six engines and all 54 catalogue entries are wired to the station lifecycle. Exactly
nine entries use the shared real 3D module; the remaining 45 retain flat boards/UI. Games
remain compact arcade experiences, rather than full standalone racing, dungeon or fighting games.
The latest instruction authorizes finishing all milestones together without review pauses.

The 3D module is `shared/stations/world3d/src` (strict TypeScript); checked-in `runtime` JS/types
support both existing builds. Rebuild with `npm --prefix shared/stations/world3d run build`.
The client in `web/src/stations/world3d` supplies first/third-person cameras, wall avoidance,
mouse/keyboard look, merged level geometry, existing character models, interpolation and
prediction/reconciliation. Server variants stay inside arena/track/siege and send at 15 Hz.
All physics, ray hits, health, loot, checkpoints and objectives remain authoritative.

| Planet | 3D station | View | Core mechanics |
| --- | --- | --- | --- |
| Chat | Pool Party Brawl | Third | Floating platforms, waves, jumping, barges, water kill plane |
| Creative | Paint Wars | Third | Three levels, wedges, persistent tagged wall/floor surface patches |
| Strategy | Lane Push | Third | Three lanes, waves of minions, towers/bases, attack, shockwave and shield |
| RPG | Dungeon Delve | Third | Seven connected rooms, opening doors, traps, chests, four role abilities |
| Sandbox | Parkour Run | Third | Moving platforms, wall slides, zipline traversal, checkpoints and finish |
| Arcade | Kart Dash | Third | Height-varying circuit, drift, boost pads, items, two laps |
| Shooter | Last Drop | Third | Buildings/loot, hitscan, armour/medkits, visible shrinking safe zone |
| Horror | Lights Out | First | Mansion, draining torch, seeded monster, three fuses and exit |
| Frontier | Rail Rush | First | Pumping handcar, branch switches, tunnels, depot finish |

Flat engines include shrinking/crumbling/zone arenas and ring Pong; seeded lane races with
resource upgrades, hazards, forks, item effects and time/accuracy; cue timing, target aiming,
casting, holding, counter choices and alternating shoot/save roles; all nine named table rule
sets; structured workshop editors, hidden entries/reveal/votes, drafting, collaborative story,
quest choices and weekly island art; role-gated co-op waves, bosses/hazards, tower upgrades,
sequential heists, pit-stop repair parts, ammo/revives and candle wards/lamps.

Bots support every engine and 3D level navigation. Solo/bot-containing rounds are unranked;
real-time disconnect replacements also turn a round unranked. Guests play without wallets.
Authenticated records and rewards persist with idempotent writes and rolling hourly coin caps.
Spectator predictions are cosmetic and never change wallet balances.

Documented clarifications:

- Who Said It uses 200 authored fictional lines and seeded public display names, never real
  chat logs. An attribution preview makes the memory question answerable.
- The `view` union includes `ui` per the explicit update, despite its omission in the example.
- Complete plaza rings fall back to nearby safe wilderness; occupied plots/streets stay intact.
- Use explicit station copies and transport-safe room IDs; logical colon-based keys are retained.
- Workshop duration expands to preserve the full creation, reveal and vote stages (eight-player
  Speed Sketch is 253 seconds). Draft Night adds structured `draft` entries.
- Map Makers stores ranked art for the current UTC week. Guest/practice art is not persisted.
- Sound remains optional and is omitted. There are no new model or audio binaries.

Validation includes seeded replay/ranking/illegal-input checks for every definition, dedicated
3D collision/jump/kill-plane/objective/flood/raycast/prediction tests, private table rules,
co-op repair/boss/spawn regressions, restart persistence, nine-planet placement, and two-client
websocket suites for all engines and all nine 3D variants. The UI includes a live FPS reading;
a sustained 60 fps certification across unspecified mid-range laptop hardware is not claimed.
Browser checks are representative, not a human playthrough of every full-length round.

See `server/src/stations/TESTING.md` for exact commands and manual checks. The development-only
picker at `/src/stations/preview.html` joins the same authoritative rooms as the world's kiosks.
