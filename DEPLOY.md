# Deploying Watchworld

## Quickest free option: Render (no card needed)

1. Push the repo to GitHub.
2. On render.com: **New → Blueprint**, pick this repo. It reads `render.yaml` and builds the `Dockerfile` as a free web service named `watchworld`.
3. When it finishes, the site is at `https://watchworld.onrender.com` (or the name Render gives you). Nothing else has to be typed in: the server reads its own address from Render.
4. Optional, for Twitch login: in the service's **Environment** tab set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`, and add `https://YOUR-SERVICE.onrender.com/auth/twitch/callback` as a redirect URL in the Twitch developer console. Without them, everyone joins as a guest.

Free-plan limits to expect: the service goes to sleep after about 15 minutes with nobody on it and takes up to a minute to wake; the disk is not kept between restarts, so sessions and game scores reset and the stream list is crawled again at start; it runs one copy, which is what we want.

## Vercel later

Vercel can serve the website but not the live game server (it cannot keep WebSockets open), so Vercel is only ever the front door: keep the server on Render (or Fly) and point the site at it. That needs a small change (the site's server address, and the Twitch login cookie across two domains), so do the single-host setup first.

One container serves the website, the API and the live game rooms on a single port. The deployed build runs with **no bots**: no simulated residents, no crowds of viewer bots, no practice opponents, and nobody is replaced by a bot when they leave a game. Everyone who joins a planet (or the central island) is visible to everyone else on it.

## Fly.io (the settings are already in `fly.toml`)

```bash
brew install flyctl
fly auth login
fly launch --no-deploy --copy-config      # pick your app name; update PUBLIC_URL in fly.toml to match
fly volumes create watchworld_data --size 1
fly secrets set SESSION_SECRET=$(openssl rand -hex 32) TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... TWITCH_REDIRECT_URI=https://YOUR-APP.fly.dev/auth/twitch/callback
fly deploy
```

Add `https://YOUR-APP.fly.dev/auth/twitch/callback` as a redirect URL in your Twitch developer console, or login will not work. Without Twitch credentials the server still runs, in demo mode, and visitors join as guests.

## Any other host that runs Docker (Render, Railway, a VPS)

- Build with the `Dockerfile` in the repo root. It listens on `$PORT` (default 8080) and needs WebSocket support.
- Environment: `PUBLIC_URL` (the site's https address, required), `SESSION_SECRET`, optional Twitch variables, `BOTS=0`.
- Mount a persistent disk at `/app/server/data`. Run exactly one instance: the data directory has a single writer.

## Settings

| Variable | Meaning |
| --- | --- |
| `PUBLIC_URL` | The site's public https address. Origin checks, cookies and the Twitch redirect all derive from it. |
| `BOTS` | `0` for no bots (the default in the container). `1` or unset allows practice bots. |
| `VITE_BOTS` | Build-time twin of `BOTS` for the website; the Dockerfile sets it to `0`. |
| `ALLOWED_ORIGINS` | Extra comma-separated origins allowed to connect (a second domain, a staging address). |
| `PORT` | Port to listen on (default 2567 locally, 8080 in the container). |
