# Watchworld

A Twitch-only 3D world. Every genre is a planet, every game is a country on it, and every live streamer is a building. Walk the streets, step into a streamer's theatre, watch together, play multiplayer games, build a planet of your own and invite friends.

Live demo: https://watchworld.onrender.com (free hosting: the first load after a quiet period can take about a minute).

## What it does

- **Nine genre planets plus a central island.** Streamers are placed by game and by size (hut, cottage, house, tower, skyscraper by viewer count). Elite streamers (3,000+ viewers) live on the central island. Wonders, blimps with each game's box art, roads, trains, traffic and terrain are generated per planet.
- **Walk or fly anywhere.** Click any point on a planet to fly down to it, then walk (WASD, Shift to run, Space to jump). `O` goes back up to orbit. Wonders are solid and land you at their front.
- **Theatres.** Walk into a streamer's building (or press the Enter theatre button) to watch their real Twitch stream with other viewers, sit, wave, emote and chat. Logged-in viewers chat to the real Twitch chat.
- **People.** Everyone on a planet sees each other live, with world chat, emotes (`1`-`6`) and a People list. Press **Q** next to someone to open a card with emotes, a private message, a planet invite, add friend and mute. Outfits are shared, so friends see your clothes, hat and necklace.
- **Games.** Four multiplayer games per planet in the form of game blocks scattered through the cities: chess-style board games, pool, shooters with projectiles, cover maps and more.
- **Your own planet.** Pick favourite streamers (or press "Add to my planet" on any building), get an invite link, search your planet's streamers and fly straight to them. Friends who open the link visit your planet.
- **Rewards.** Log in with Twitch to earn credits from quests (theatre time, social quests, and the 15-minute "Hidden Gems" quest on small streamers, whose watch time is counted by the server) and spend them on outfits, hats and necklaces. The Character and Quests buttons are visible to everyone; only logged-in players can use them. A Quests tab in the in-theatre phone tracks your progress.

## Run it locally

Use **Node.js 22.13+**.

```sh
npm run setup
cp server/.env.example server/.env
npm run dev
```

Open **http://localhost:5173**. One command starts Vite (5173) and the Express/Colyseus server (2567). Without Twitch credentials the server runs on seeded demo data, so everything works for a first look.

### With real Twitch data and login

1. Register a confidential application in the [Twitch developer console](https://dev.twitch.tv/console/apps).
2. Add the OAuth redirect URL exactly: `http://localhost:2567/auth/twitch/callback` (and for a deployment, `https://YOUR-SITE/auth/twitch/callback`).
3. In `server/.env` set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` (optional on a deployment) and a long random `SESSION_SECRET`.
4. Restart and click **Log in with Twitch**. Scopes: `user:read:chat`, `user:write:chat`, `user:read:follows`.

Never commit `.env` or `server/data/`; both are gitignored.

### Settings

| Variable | Effect |
| --- | --- |
| `BOTS=0` / `VITE_BOTS=0` | No simulated bot residents or viewers: only real people appear. Used on the deployed site. |
| `MAX_INDEXED_STREAMS` | Caps how many live streams are indexed (unset means no cap; Render uses 5000). |
| `DEMO_STREAMS=1` | Keep the labelled demo streamers alongside real data. Off by default, so a real Twitch index never shows invented channels. |
| `PUBLIC_URL`, `ALLOWED_ORIGINS` | The public address and any extra allowed origins (Render fills the first in itself). |

See [DEPLOY.md](DEPLOY.md) for the Render and Docker setup.

## Controls

| Key | Action |
| --- | --- |
| WASD, Shift, Space | Walk, run, jump |
| Mouse (click the scene first), Esc | Look, release the mouse |
| O | Back to orbit |
| T | World chat |
| 1-6 | Emotes |
| Q | Talk to the person next to you |
| H | Add the building you are near to your planet |
| E / button | Enter a theatre or use a game block |

## Tests and build

```sh
npm run build                  # server and web
npm --prefix server test       # realtime end-to-end checks
npm --prefix server run test:catalog
npm --prefix server run test:twitch
```

The REST and realtime contract is in [CONTRACT.md](CONTRACT.md); the game catalogue is in [GAMES.md](GAMES.md).

## How we built it

Watchworld was built by a team of two with AI coding tools, each used for different parts:

- **Codex (OpenAI):** the multiplayer station-games system (the four games per planet, game engines and the 3D variants), written from the brief in [STATIONS_PROMPT.md](STATIONS_PROMPT.md) and [STATIONS_UPDATE_PROMPT.md](STATIONS_UPDATE_PROMPT.md); and the avatar, quest, in-theatre phone and Twitch-follows features.
- **Claude Code (Anthropic):** the sphere world renderer (planets, terrain, roads, wonders, blimps), the central island, custom planets, viewer crowds, player interactions, rewards fixes, deployment and the review and testing passes.
- **[Team to confirm before submitting: which tool wrote the original Express/Colyseus backend, the catalog and the theatre rooms.]**

## Credits

Third-party models and licences are listed in [CREDITS.md](CREDITS.md). Twitch is a trademark of Twitch Interactive; Watchworld is an independent project.
