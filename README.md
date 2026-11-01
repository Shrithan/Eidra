# Watchworld

A Twitch-only world: explore Earth and eight fictional genre planets, walk into streamers' theatres, sit together, wave and emote, and talk through real Twitch chat.

## Setup and run

Use **Node.js 22.13+** (Node 24 recommended). The backend uses built-in SQLite; Node may print its experimental-feature notice.

```sh
npm run setup
cp server/.env.example server/.env
npm run dev
```

Open **http://localhost:5173**. One command starts Vite on 5173 and Express/Colyseus on 2567; Vite proxies `/api` and `/auth`. Stop existing processes if those ports are occupied. Mock mode works with empty Twitch credentials: 28 labeled demo streams span every hall size and all eight planets; room chat stays local and auth returns 501.

For real Twitch:

1. Register a confidential application in the [Twitch developer console](https://dev.twitch.tv/console/apps).
2. Register **http://localhost:2567/auth/twitch/callback** as its OAuth redirect URL.
3. Set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`, and a stable random `SESSION_SECRET` in `server/.env`. Generate a secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Click **Log in with Twitch**. Scopes are `user:read:chat` and `user:write:chat`. Login survives backend restarts; refresh tokens rotate and persist. Rooms reconnect separately.

Never commit `.env` or `server/data/`. Both are gitignored. Session cookies/tokens remain server-side in owner-only JSON; other persistent data uses SQLite in the private data directory. Keep `SESSION_SECRET` stable. This is a single-process development deployment.

## All live streams, honest locations

The Helix poller traverses `first=100` pages to cursor exhaustion, retries GET requests on 429 using Twitch's reset headers, deduplicates logins, and publishes a full sweep atomically. The previous snapshot remains usable during a crawl or upstream failure. A saved cursor resumes after restart; a crawl older than 30 minutes restarts. Sweeps target a three-minute start cadence; a long sweep schedules the next one 15 seconds after finishing. Full Twitch-wide crawls can themselves take several minutes. Twitch's changing viewer ordering can cause repeats/omissions, so the result is a best-effort enumeration rather than an instantaneous snapshot of every channel.

The entire index lives on disk; HTTP and UI use bounded pages. `/api/streams` defaults to 3,000 rows, allows `limit=1..5000` and `offset`, and supports combined `planet`, `bbox`, `language`, `game` and `q` filters. Responses are viewer-sorted arrays with total/paging headers. Examples:

```text
/api/streams?planet=earth&limit=2000
/api/streams?planet=arcadia&language=en&offset=2000
/api/streams?game=Minecraft&limit=100
/api/streams?planet=earth&bbox=-125,25,-65,50
/api/streams?q=streamerlogin
/api/planets
/api/index-status
```

Earth shows opted-in cities, usable researched public bases, and explicitly labeled geographic demos. **Language never establishes a real location.** Unplaced streams get stable hash-derived slots on Chatterra, Arcadia, Warzone, Mythos, Strata, Harmonia, Craftus or Odyssey. These are fictional places, not inferred residences. The genre/category mapping is in `server/src/planets.ts`.

Use the world selector to switch Earth/planets. Planet textures are generated locally. Search spans the full index across all worlds; selecting a result switches worlds as needed. The list pages through results and initially renders 80 rows; the globe shows up to 800 pins at far zoom or 2,000 nearby. On narrow screens, **Browse streams** opens the result drawer. Click a stream or pin, then **Enter theatre**.

Signed-in streamers can choose one of 230 bundled cities under **Your map location**. The server validates the input and replaces it with the municipal centroid, coarsened before storage and jittered for display. A live channel gets an opt-in pin; offline channels are never fabricated as live. Removing the opt-in removes that city declaration; independent public research or labeled demos may remain.

## Optional OpenAI location research

Research is **off by default**. Enable it deliberately in `server/.env`:

```dotenv
OPENAI_API_KEY=your-local-key
OPENAI_MODEL=gpt-5.5
RESEARCH_ENABLED=1
RESEARCH_DAILY_BUDGET=100
RESEARCH_CONCURRENCY=1
```

`RESEARCH_DAILY_BUDGET` limits attempted logins per UTC day, not dollars. `0` prevents spending; concurrency is clamped to 1–4. Up to 25 logins are processed per call, with smaller tail batches allowed. Reservations happen on disk before a paid call, so failures/restarts cannot reset the day's allowance. Workers never block the Helix crawl. Logs contain queue depth, login/call counts, input/output tokens, and search-call counters—not keys, descriptions, locations or logins.

The Responses API uses `web_search`, strict JSON-schema output, and the exact privacy rules in the request. Inputs contain only public channel login, display name, title, category, language and Helix description. Panel statements can be used only if available on the official public channel through search; there is no private panel API or invented panel text. Metadata/search content is treated as untrusted data.

Zod validates every result. Raw model coordinates are never retained: known cities resolve against the bundled municipal list, unknown cities reduce to a verified ISO country centroid, and city positions receive deterministic jitter of roughly 2–8 km. City/country are the finest retained fields. Thin evidence yields no location and a planet. Opt-ins always win. Research is labeled **researched, approximate**, includes confidence and precision, and links matched public citations when available. Uncited results are explicitly labeled model knowledge, which can be outdated.

Results (including no-location answers), source metadata, model, timestamps, queue leases, budget counters and description hashes persist in `server/data/world.sqlite`. Descriptions themselves are not persisted. Workers recheck public descriptions at most daily; the LLM runs again only after 30 days or a description change. Changed descriptions invalidate the old researched pin until refreshed. A failed batch retries later with durable budget accounting. Mock data uses a separate `world-mock.sqlite`, preserving the real index.

Illustrative cost per **1,000 researched channels** with GPT-5.5: **about $30–$60**, assuming 1–2 searches/channel, roughly 2,000 search input tokens/search, 200 other input tokens/channel and 200–640 billed output tokens/channel (including reasoning). This is an estimate, not a spending cap or a measured result. At the current published prices, model input/output is $5/$30 per million tokens and web search is $10 per 1,000 search calls plus model-priced search content. More searching, retries or a different model changes the cost. See [model pricing](https://developers.openai.com/api/docs/models/gpt-5.5) and [tool pricing](https://developers.openai.com/api/docs/pricing). Start with a small daily budget and use the emitted usage counters.

## Theatre integration

On entry, the **Start the stream** panel exposes the existing Twitch player. If it is paused, click Twitch’s Play button, then **Continue to theatre**. **Stream controls** reopens the same player without reloading the video or leaving the room.

The shared plot is 120 m × 120 m; movement is limited to 9 m/s. Audience averages persist as an EMA; room capacity is fixed on creation at 12/24/60/128/240 seats. Seats remain exclusive. Waves, eight emotes, room chat and three-level crowd hype use the rate limits in `CONTRACT.md`.

EventSub starts when an authenticated viewer joins, forwards channel chat, handles keepalives/reconnects and deduplicates notifications. It closes/deletes subscriptions when the room's subscribers leave. Room chat posts as the authenticated user and also broadcasts locally; Twitch echoes can appear separately. Anonymous visitors get a system login hint. Optional `HYPE_TO_TWITCH=1` relays one short hype message through an authorized participant, at most once per two minutes per channel; default off.

## Build and verify

```sh
npm run build
# With the normal server running:
npm run test:e2e
# Isolated tests; no paid API calls:
npm --prefix server run test:catalog
npm --prefix server run test:research
npm --prefix server run test:audience
# Port 2567 must be free for these isolated server tests:
npm --prefix server run test:persistence
npm --prefix server run test:twitch
```

The research test uses a stubbed LLM and checks schema failures, centroid snapping/jitter, coarse-only output, opt-in precedence, stable planet assignment, budget accounting, cache reuse and description changes. Catalog tests cover pagination, 429 retry, filters, counts and cursor resumption. E2E checks movement/yaw, seat bounds/exclusivity, wave, chat and hype.

For an explicit live chat smoke test after browser login, run `cd server && node --import tsx scripts/live-twitch.ts`. It posts **one real message** to the signed-in user's own Twitch channel and checks its EventSub echo. `LIVE_TWITCH_CHANNEL` selects another channel. No cookies/tokens are printed.

Backend build output is `server/dist/`; run it with `npm --prefix server start`. Frontend output is `web/dist/`. Built-in geodata is attributed to the bundled `world-countries` project (ODbL); the curated municipal list ships under `server/src/data/`. Colyseus 0.16 matches the frontend SDK and retains its documented legacy nanoid audit findings; a major upgrade needs coordination.

The source of truth for REST, realtime and ownership is [CONTRACT.md](CONTRACT.md).
