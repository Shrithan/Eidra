# Watchworld: shared contract

Two teammates, one repo. Stay in your own folder; this file is the only meeting point. If you need to change the contract, edit this file and say so in your reply.

| Owner | Files | Scope |
| --- | --- | --- |
| Movement and interaction teammate | `web/src/World.tsx`, `web/src/Theatre.tsx`, `web/src/useRoom.ts`, `web/src/styles.css` | How players move, look, sit, wave, speak and react inside the 3D theatre |
| Integration teammate | `server/**`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/Globe.tsx`, `web/src/integration/**` (own CSS in `web/src/integration/integration.css`), root `package.json`, `README.md` | Everything between Twitch and the app: auth, real streams, locations, chat bridge, hype relay, movement validation, one-command dev start |

Do not edit files owned by the other teammate. If you need a change in their files, edit this contract and say so in your reply.

## Ports

- Server: `http://localhost:2567` (REST under `/api`, Colyseus websocket on the same port)
- Web: `http://localhost:5173`, Vite proxies `/api` and `/auth` to 2567

## REST

### `GET /api/streams`

Live streams for the globe. Always returns an array; `location` is `null` when unknown.

```json
[
  {
    "id": "123456",
    "login": "somestreamer",
    "displayName": "SomeStreamer",
    "title": "Late night ranked",
    "game": "Valorant",
    "viewers": 1342,
    "language": "en",
    "thumbnail": "https://static-cdn.jtvnw.net/previews-ttv/live_user_somestreamer-440x248.jpg",
    "location": { "lat": 43.07, "lng": -89.4, "city": "Madison", "source": "optin" }
  }
]
```

`location.source` is one of `"optin"` (streamer chose a city), `"researched"` (public base statement / model knowledge, approximate), `"language"` (legacy approximate demo), `"seed"` (hand-seeded demo data). Coordinates are city-level and jittered server-side; never return anything more precise.

Unplaced streams now use genre planets, as specified in "Full stream index and genre planets" below. Language is a filter, not evidence of a geographic base. The legacy `language` source remains parseable for older demo clients.

### `POST /api/me/location`

Body `{ "city": "Madison", "lat": 43.07, "lng": -89.4 }`. Requires a logged-in Twitch session. Stores the streamer's opt-in. `DELETE /api/me/location` removes it.

### Auth

- `GET /auth/twitch` starts Twitch OAuth (scopes: `user:read:chat`, `user:write:chat`), then redirects to `http://localhost:5173/`.
- `GET /api/me` returns `{ "id", "login", "displayName", "avatar" }` or `401`.
- `POST /auth/logout`.

## Realtime (Colyseus)

Room name: `theater`. One room per streamer, `roomId` = streamer `login` (lowercase). Use `joinOrCreate("theater", { channel: "<login>", name: "<display name>" })`.

### State (synced)

```ts
Player { id: string; name: string; seat: number; x: number; y: number; color: string }
RoomState { players: MapSchema<Player>; channel: string; viewerCount: number }
```

`seat` is `-1` when standing. `x`, `y` are room coordinates in `0..1`.

### Client to server messages

| Type | Payload | Effect |
| --- | --- | --- |
| `move` | `{ x, y }` | Update position (clamp to 0..1) |
| `sit` | `{ seat }` | Take a seat; reject if taken |
| `emote` | `{ emoji }` | Broadcast `emote` to the room (allow-list of ~8 emoji) |
| `chat` | `{ text }` | Send to Twitch chat as the logged-in user; also broadcast `room_chat` |

### Server to client messages

| Type | Payload |
| --- | --- |
| `emote` | `{ playerId, emoji }` |
| `room_chat` | `{ playerId, name, text }` |
| `twitch_chat` | `{ user, text, color? }` (live chat from the streamer's channel via EventSub) |

Rate-limit `chat` and `emote` per player (suggest 1 chat per 2s, 5 emotes per 5s).

## Mock mode

The server must run with no Twitch credentials: `GET /api/streams` returns the seed data, auth routes return 501, `chat` only broadcasts `room_chat`. The web app also has its own mock fallback, so neither side blocks the other.

## Env (server)

`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI=http://localhost:2567/auth/twitch/callback`, `SESSION_SECRET`. Provide `server/.env.example`.

## Movement v2 and interaction (added)

World units: the 3D theatre maps the 0..1 coordinates onto a fixed 120 m x 120 m plot (`meters_x = (x - 0.5) * 120`, `meters_z = y * 120`). Use these for the 9 m/s speed clamp. (This replaces the earlier 60 m x 50 m plot.)

Player state gains `yaw: number` (radians, 0 = facing the screen, wrapped to -PI..PI, default 0).

Client to server:

| Type | Payload | Effect |
| --- | --- | --- |
| `move` | `{ x, y, yaw? }` | As before, plus store `yaw`. Sent about 10 times per second while moving. Speed check: if the implied speed exceeds 9 m/s, clamp the new position along the movement vector instead of dropping the message. |
| `wave` | `{ targetId? }` | Broadcast `wave { playerId, targetId? }` to the room. Rate limit: 1 per 2 s per player. |

Server to client (additions):

| Type | Payload |
| --- | --- |
| `wave` | `{ playerId, targetId? }` |
| `hype` | `{ level: 1 \| 2 \| 3 }`, broadcast when the room's emote rate crosses a threshold (suggest: 8 emotes from at least 3 players within 10 s = level 1, double and triple that for 2 and 3, 20 s cooldown per level) |
| `system` | `{ text }`, shown in the chat panel in grey (for example "Log in with Twitch to talk to the streamer") |

When an unauthenticated viewer sends `chat` and Twitch sending is configured, reply with `system` instead of silently dropping the message. In mock mode, keep broadcasting `room_chat` as today.

## Audience-sized theatres (added)

The hall grows with the streamer's usual audience.

- `GET /api/streams` items gain an optional `avgViewers: number`: a rolling average of the `viewer_count` the poller has observed for that channel (persist it with the other data; use an exponential moving average, for example `avg = avg * 0.9 + current * 0.1`, seeded with the first observation). When there is no history yet, omit it and the client falls back to the current viewer count.
- `RoomState` gains `capacity: number`, chosen when the room is created and fixed for the room's lifetime, from `avgViewers` (or the current viewer count when unknown):

| Usual audience | `capacity` (seats) |
| --- | --- |
| under 30 | 12 |
| 30 to 299 | 24 |
| 300 to 2,999 | 60 |
| 3,000 to 14,999 | 128 |
| 15,000 and up | 240 |

- Valid seat ids are `0 .. capacity - 1` (the old fixed range of 0..23 no longer applies). Reject `sit` outside that range; seats stay exclusive. The client lays seats out itself, so the server only needs the number.
- Seed streams in mock mode should carry realistic `avgViewers` so every size can be demoed (add a couple of small channels under 300).

## Full stream index and genre planets (added)

Helix Get Streams is traversed to cursor exhaustion in the background, targeting a three-minute start cadence (or 15 seconds after a longer sweep completes). Twitch's changing ordering may repeat or omit channels during a sweep: the index is a best-effort live enumeration, not an atomic Twitch-wide snapshot. Rows are deduplicated by login. A completed snapshot replaces the previous one atomically; incomplete crawls persist a cursor and resume after restart (a crawl older than 30 minutes starts over). LLM research never blocks crawling.

`GET /api/streams` still returns a JSON array, sorted by viewers descending then login. It defaults to 3,000 rows; `limit=1..5000` and zero-based `offset` expose every indexed row. Filters are combined with AND:

- `planet=all` (default), `planet=earth`, or one of the eight planet IDs.
- `bbox=west,south,east,north` in degrees; west > east crosses the dateline. Uses displayed Earth coordinates or planet slots, never private positions.
- `language` (exact language code), `game` (exact Twitch category name or category ID), and `q` (case-insensitive substring of login, display name, game or displayed city).
- Headers: `X-Total-Count`, `X-Has-More`, `X-Watchworld-Mock`. Empty filtered results are valid, never an error. Bad filters return 400.

Stream additions:

```ts
location: null | {
  lat: number; lng: number; city: string;
  source: 'optin' | 'researched' | 'seed' | 'language';
  country?: string; // ISO 3166-1 alpha-2
  confidence?: 'high' | 'medium' | 'low' | 'none';
  precision?: 'city' | 'country';
  sources?: { url: string; title: string }[];
};
planet?: { id: string; slot: { lat: number; lng: number } };
gameId?: string;
demo?: boolean;
```

Every indexed stream has either an Earth location or a planet. `planet.slot` is a stable hash-derived position on a fictional sphere, unrelated to real geography. Real geographic precedence: opted-in city, then usable cached research (high/medium confidence). Otherwise use a genre planet. No country is inferred from language. Seed demos retain explicitly labeled locations; synthetic planet demos have `demo: true`.

Research is disabled by default. With `RESEARCH_ENABLED=1`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESEARCH_DAILY_BUDGET`, and `RESEARCH_CONCURRENCY`, a persistent highest-viewers-first queue processes up to 25 public profiles per call (smaller tail batches are allowed). Each requested login returns exactly one strict structured result. Only city/country base statements from the streamer or official public pages are allowed; widely public model knowledge may use medium confidence. Raw model coordinates are discarded and replaced with bundled municipal or country centroids. Unrecognized cities are reduced to country level, never guessed. Display coordinates are jittered at city scale. Tool source links, when available and matched to the channel, are exposed for attribution; unsourced results are labeled as model knowledge.

Research results, model, confidence, short basis, timestamps and description hashes persist in `server/data/world.sqlite`, alongside city opt-ins, the stream index, audience history, queue leases and usage budgets. Results are refreshed only after 30 days or a public-description hash change; profiles are rechecked at most daily. Full profile text is not persisted. Daily budgets count attempted logins, including failed calls, and survive restarts. Existing JSON opt-ins and averages are migrated once. A location opt-in must use a supported bundled city; submitted coordinates are validated but the stored point is the city's coarse centroid. DELETE removes the opt-in; an independently researched public city/country may still appear.

`GET /api/planets` returns `[{ id, name, color, count }]` for chatterra, arcadia, warzone, mythos, strata, harmonia, craftus, odyssey. Counts cover the complete indexed snapshot (including clearly labeled demos). Category mapping lives only in `server/src/planets.ts`.

`GET /api/index-status` returns `{ completeAt, inProgress, cursorSaved, count }` for snapshot freshness. The frontend provides world selection, global search, bounded pin counts and result paging. Planet textures are generated locally; existing Earth imagery is unchanged.

## Earth view on CesiumJS (added)

The Earth world now renders with CesiumJS instead of the plain globe. Planets still use `web/src/Globe.tsx`.

- New files owned by the movement and interaction teammate: `web/src/GeoWorld.tsx`, `web/src/geo.css`, `web/scripts/copy-cesium.mjs`, `web/.env.example`.
- One line in `web/src/App.tsx` (integration teammate's file) now renders `<GeoWorld ... />` when `world === 'earth'` and `<Globe ... />` otherwise. Keep that switch if you edit App.tsx. `GeoWorld` takes `streams`, `selected`, `onSelect` and `onEnter(stream)`.
- Selecting a stream (list click, pin click or card) fast travels the camera there; the player then walks with WASD, and `E` near the door calls `onEnter`. `O` returns to orbit.
- Each stream with a `location` is drawn as a theatre building sized by `capacityFor(viewers)` (same classes as the 3D hall). At most the 1,500 busiest streams in the current page get a building.
- Optional env: `VITE_CESIUM_ION_TOKEN` in `web/.env.local` enables Google's photorealistic 3D tiles and world terrain. Without it the map is OpenStreetMap on a flat globe.
- `npm run dev` and `npm run build` in `web/` copy Cesium's static assets into `web/public/cesium` first; `npm install` alone is not enough for Cesium to run.

## Watchworld sphere: every genre on one walkable planet (added)

A new world entry, `watchworld`, in the world picker. It is client-only; the server needs nothing new.

- New files owned by the movement and interaction teammate: `web/src/WatchSphere.tsx`, `web/src/sphereLayout.ts`, `web/src/sphere.css`.
- `App.tsx` (integration teammate's file) got small edits: a `WATCHWORLD` entry prepended to the picker's worlds, `fetchStreams` uses `planet: 'all'` while that world is selected, `select()` no longer switches world while in it, and `<WatchSphere ... />` renders for it. Keep those if you edit App.tsx.
- `WatchSphere` loads up to 5,000 streams itself (`GET /api/streams?planet=all&limit=2000&offset=...`, busiest first) and lays them out once per page load. Genre groups are keyword matches on `game` (see `GROUPS` in `sphereLayout.ts`); streams are ordered group -> game -> viewers and placed along a space-filling curve, so each genre is a continent and each game a country. Building size follows `viewers`.
- Selecting a stream (list, card or clicking a building) flies the player to it; walking, jumping and `E` to enter work like the Earth view.
- Ideas for later that need the server: a persistent plot per login so buildings do not move when streams change, a presence room per sphere region so other viewers are visible, and a game-category field from Twitch (`game_id`) to classify genres better than keywords.

## World room: everyone on the Watchworld sphere (added)

The sphere (`web/src/WatchSphere.tsx`) shows other people and a world chat. Until the server provides this room, the client simulates residents, so nothing blocks on it.

Room name: `world`. Join options: `{ name: string, shard?: string }` (`shard` defaults to `"main"`). Cap each shard at 100 clients; when `main` is full, create `main-2`, `main-3`, and so on, and join the first one with space.

State (`players`, a map keyed by session id), each player:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Twitch display name when logged in; otherwise the sent name, sanitized, with " (guest)" appended |
| `color` | string | CSS colour, assigned by the server (stable per session) |
| `px, py, pz` | number | Unit vector from the planet's centre to the player (where they stand) |
| `fx, fy, fz` | number | Unit vector, tangent to the planet at that point, the way they face |
| `alt` | number | Height above the ground in metres, 0 to 200 |

Client to server:

| Type | Payload | Effect |
| --- | --- | --- |
| `move` | `{ p: [x, y, z], f: [x, y, z], alt: number }` | Store the position. Reject non-finite numbers; normalize `p` and `f`; clamp `alt`. Rate limit about 20 per second per player. Do **not** enforce a speed limit: fast travel moves a player across the planet in a few seconds. |
| `chat` | `{ text: string }` | Trim, strip control characters, max 200 characters, 1 message per 1.5 seconds per player. Broadcast `chat` to the whole shard. World chat is **never** forwarded to Twitch. |

Server to client:

| Type | Payload |
| --- | --- |
| `chat` | `{ id, name, text }` (`id` = the sender's session id) |
| `system` | `{ text }` (for example "You are sending messages too fast") |

The planet's size depends on how many streams are shown, so the server must not assume a radius.

## Watchworld sphere look: a voxel (Crossy Road style) city (changed)

The sphere is now a daytime, blocky city, built entirely in code (no downloaded models):

- `web/src/sphereCity.ts` builds the street network from the building layout (the Voronoi diagram of the lattice, via a convex hull), so streets run between buildings.
- `web/src/sphereVisuals.tsx` draws houses (door, awning, pitched or flat roof), roads, trees, lamp posts, traffic (cars, buses, trucks on the street graph), elevated railways with trains, clouds and planes.
- `web/src/sphereLayout.ts`: buildings are lower and smaller so they fit between the streets (footprint up to about 9 m, height up to 34 m), and `frontDir(plot)` gives the direction a building's door faces. Fast travel lands in front of that door.
- People are blocky characters (`sphereResidents.tsx`). The server contract for them is unchanged.

## Watchworld sphere: real landscape and a bigger world (changed)

- `web/src/sphereTerrain.ts` defines the land as a pure function of direction (no randomness), so every player sees the same hills, mountain ranges, lakes and shorelines. City districts are flat at 2.2 m; sea level is 0 m; the highest peaks are about 235 m.
- `layoutSphere(streams, spacing = 56)` now places buildings only in the "urban" parts of that land (about half the planet), on a jittered lattice, with wilderness between the districts. For 5,000 streams the planet has a radius of about 1,580 m. `layout.ground(direction)` gives the land height anywhere.
- Anything that stands on the planet should use `R + layout.ground(dir)`, not `R`. The server never needs the terrain, only player positions as unit vectors; clients derive height themselves.
- Streets exist only inside city districts. Forests, the sea and waterfalls are generated from fixed seeds, so they are identical for everyone.
- Lakes block walking; trains run on a high railway and pass through mountains in tunnels.

## Watchworld as a solar system (changed)

Every genre group is now its own planet, all orbiting one sun (`web/src/sphereSystem.tsx`). Each planet has its own terrain seed and theme (`web/src/sphereThemes.ts`: sky, sea, tree and house colours, how mountainous or watery it is) and is laid out and walked exactly like the single planet before, using only its genre's streams (`layoutSystem` in `sphereLayout.ts`).

- Click a planet in the system view, or pick any stream in the list: the stream's planet is the one for its game's genre (`groupIndex(game)`).
- Planet relief is scaled to planet size (`terrain.scale`), so small planets get gentler hills.
- World chat and other players: the `world` room's `shard` join option is now the planet's genre id (`chat`, `creative`, `strategy`, `rpg`, `sandbox`, `arcade`, `shooter`, `horror`, `other`) instead of `main`. Each planet is its own crowd. Shards still cap at 100 clients (`chat-2`, ...). Chat is local to a planet.

## Building tiers by viewers (added)

Every building has a `tier` (0 to 4) from the stream's viewer count: Hut under 40, Cottage 40 to 99, House 100 to 299, Tower 300 to 999, Skyscraper 1,000 and up (`TIERS` and `tierOf` in `web/src/sphereLayout.ts`). Footprint and height come from the tier, with the position inside the tier on a log scale. Cut-offs were chosen from the top 5,000 streams (median 60 viewers). Changing them only needs `TIERS`.
