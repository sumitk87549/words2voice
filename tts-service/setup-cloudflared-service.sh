#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  words2voice — Cloudflare Tunnel → nginx systemd service setup
#  Run this AFTER: cloudflared tunnel login && cloudflared tunnel create words2voice
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TUNNEL_NAME="words2voice"
CLOUDFLARED_DIR="$HOME/.cloudflared"

echo ""
echo "▶  Looking up tunnel ID for '$TUNNEL_NAME'..."
TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null \
  | python3 -c "
import sys, json
tuns = json.load(sys.stdin)
match = [t for t in tuns if t['name'] == '$TUNNEL_NAME']
if not match:
    print('ERROR: tunnel $TUNNEL_NAME not found', file=sys.stderr)
    sys.exit(1)
print(match[0]['id'])
")
echo "   Tunnel ID: $TUNNEL_ID"

CREDENTIALS_FILE="$CLOUDFLARED_DIR/${TUNNEL_ID}.json"
if [[ ! -f "$CREDENTIALS_FILE" ]]; then
  echo "❌  Credentials file not found: $CREDENTIALS_FILE"
  echo "   Run: cloudflared tunnel login && cloudflared tunnel create $TUNNEL_NAME"
  exit 1
fi

# ── Write config.yml ──────────────────────────────────────────────────────────
mkdir -p "$CLOUDFLARED_DIR"
cat > "$CLOUDFLARED_DIR/config.yml" << EOF
# words2voice — Cloudflare Tunnel config
tunnel: ${TUNNEL_ID}
credentials-file: ${CREDENTIALS_FILE}

# Point tunnel at local nginx (which serves frontend + proxies API)
ingress:
  - hostname: https://words2voice.vercel.app/
    service: http://localhost:80
    originRequest:
      connectTimeout: 30s
      proxyReadTimeout: 240s
      noTLSVerify: false
  - hostname: www.https://words2voice.vercel.app/
    service: http://localhost:80
    originRequest:
      connectTimeout: 30s
      proxyReadTimeout: 240s
  - service: http_status:404
EOF

echo "✅  Config written: $CLOUDFLARED_DIR/config.yml"

# ── Test tunnel connectivity ───────────────────────────────────────────────────
echo ""
echo "▶  Testing tunnel (10s test run)..."
timeout 10 cloudflared tunnel run --config "$CLOUDFLARED_DIR/config.yml" "$TUNNEL_NAME" \
  2>&1 | grep -E "(INF|ERR|connection)" | head -5 || true
echo "✅  Tunnel connectivity test done"

# ── Install as systemd service ────────────────────────────────────────────────
echo ""
echo "▶  Installing cloudflared as system service..."
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅  Cloudflare Tunnel is live!"
echo ""
echo "  Your site is now accessible at:"
echo "  https://words2voice.vercel.app/"
echo "  https://www.https://words2voice.vercel.app/"
echo ""
echo "  All services auto-start on reboot:"
echo "    nginx            — systemd (serves frontend + proxies API)"
echo "    words2voice-backend — systemd (Spring Boot API)"
echo "    cloudflared      — systemd (tunnel to Cloudflare)"
echo "    tts-service      — Docker (--restart unless-stopped)"
echo ""
echo "  Check status anytime:"
echo "    sudo systemctl status words2voice-backend"
echo "    sudo systemctl status cloudflared"
echo "    sudo systemctl status nginx"
echo "    docker ps"
echo "═══════════════════════════════════════════════════════════"
