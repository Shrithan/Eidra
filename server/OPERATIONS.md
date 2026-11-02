# Backend operations

See the root README and CONTRACT.md for exact setup, filters, research controls and commands.

- Node 22.13+ / Node 24; built-in SQLite may emit its experimental notice.
- `data/sessions.json`: durable signed-cookie sessions and rotating Twitch credentials. Stable SESSION_SECRET required; file permissions 0600.
- `data/world.sqlite`: live snapshot, staged crawl/cursor, opt-ins, researched results, queue/leases, budgets and EMA history. WAL mode; private data directory. Mock mode uses `world-mock.sqlite` so real snapshots are preserved.
- Legacy `cities.json` and `audiences.json` migrate once; SQLite is authoritative thereafter. Full research descriptions and raw model coordinates are never persisted.
- Snapshot crawl resumes after restart and retains the previous completed index on failure. Targets a three-minute start cadence, or 15 seconds after a longer crawl completes. It uses Twitch rate headers and retries 429 on GET only, never automatically resending chat POSTs.
- HTTP result arrays are bounded at 5,000; default 3,000. SQL filters and offset expose every row. Planet counts describe the whole index. No full in-memory catalogue or LLM queue exists.
- Research is off unless RESEARCH_ENABLED=1 and OPENAI_API_KEY is present. Batch size <=25 (tail batches allowed), concurrency 1–4. Durable daily attempted-login reservations are separate from dollar spend. Logs contain usage counters only.
- Research retry delay 15 minutes; in-flight leases expire after 5 minutes. Cache re-research: 30 days or changed description; profile hash check at most daily. Public Helix descriptions are fetched just-in-time and discarded after hashing/requesting. Unavailable panel text is never invented.
- Known municipal centroids are coarsened then jittered about 2–8 km; unknown cities degrade to a country centroid. Country codes are checked against the bundled country catalogue. Only high/medium usable research produces Earth pins. No language-location inference.
- Opt-in city choice takes precedence immediately, including while Helix is unavailable. The route also attempts a targeted live-stream refresh so a just-started stream can appear without waiting for the next full crawl.
- Theatre movement is 120 m × 120 m, 9 m/s, yaw in -PI..PI. Capacity 12–240 is fixed on creation from average/current viewers; seats exclusive. Existing room states are intentionally not persisted; the client reconnects after restart.
- EventSub heartbeat/reconnect, chat and channel-update delivery, notification deduplication and reference-counted cleanup remain enabled. Optional hype relay reserves its two-minute per-channel cooldown durably.

Read-only status: `/api/index-status`. Test scripts use temporary SQLite databases and dummy responses, except `live-twitch.ts`, which deliberately sends one real message. Back up the whole private data directory with the server stopped; keep SESSION_SECRET with it. Do not run multiple backend writers against one store. Node's synchronous SQLite work is bounded per page/request, but full snapshot publication briefly holds a write transaction.
