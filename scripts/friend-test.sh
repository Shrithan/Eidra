#!/bin/zsh
# Share your running Watchworld with a friend on another network.
#   1. opens a public https tunnel to the web app (port 5173)
#   2. restarts the game server so it accepts connections from that tunnel address
# Run the web app first (npm --prefix web run dev). Ctrl-C closes the tunnel.
cd "$(dirname "$0")/.." || exit 1

if ! command -v cloudflared >/dev/null; then echo "Install the tunnel first: brew install cloudflared"; exit 1; fi
if ! curl -s -o /dev/null http://localhost:5173; then echo "The web app is not running on port 5173. Start it with: npm --prefix web run dev"; exit 1; fi

# the old game server would refuse the tunnel's address, so stop it
OLD=$(lsof -tiTCP:2567 -sTCP:LISTEN 2>/dev/null)
[ -n "$OLD" ] && kill $OLD && sleep 1

LOG=$(mktemp)
cloudflared tunnel --url http://localhost:5173 --http-host-header localhost:5173 >"$LOG" 2>&1 &
TUNNEL=$!
trap 'kill $TUNNEL 2>/dev/null; rm -f "$LOG"' EXIT INT TERM

URL=""
for i in $(seq 1 45); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then echo "The tunnel did not start:"; cat "$LOG"; exit 1; fi

echo ""
echo "================================================"
echo " Send this link to your friend:"
echo "   $URL"
echo " (you can keep using http://localhost:5173)"
echo "================================================"
echo ""
ALLOWED_ORIGINS="http://localhost:5173,$URL" npm --prefix server run dev
