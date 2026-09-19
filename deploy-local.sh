#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  words2voice — Full Local Deployment Script
#  Installs nginx, sets up systemd services, and configures everything to
#  auto-start on reboot. Run with: bash deploy-local.sh
#
#  Run this ONCE. After that, everything starts automatically on boot.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIST="$REPO_ROOT/frontend/dist/frontend/browser"
BACKEND_JAR="$REPO_ROOT/backend/target/backend-0.0.1-SNAPSHOT.jar"
TTS_CACHE="$HOME/.cache/supertonic3"
USER_NAME="$USER"
JWT_SECRET="6RZGSfFc65TdepCcXHxVaeJfrkvnVVUTOcZUJVfX6fZezoXtVoVtMrGk7FAhKopf"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  words2voice — Local Deployment"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Verify builds exist ───────────────────────────────────────────────────────
if [[ ! -f "$FRONTEND_DIST/index.html" ]]; then
  echo "❌  Angular build not found. Run: cd frontend && npx ng build --configuration=production"
  exit 1
fi
if [[ ! -f "$BACKEND_JAR" ]]; then
  echo "❌  Spring Boot JAR not found. Run: cd backend && ./mvnw package -DskipTests"
  exit 1
fi
echo "✅  Builds verified"

# ── 1. Install nginx and cloudflared ─────────────────────────────────────────
echo ""
echo "▶  Installing nginx..."
sudo apt-get install -y nginx -q

if ! command -v cloudflared &>/dev/null; then
  echo "▶  Installing cloudflared..."
  if [[ ! -f /tmp/cloudflared.deb ]]; then
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  fi
  sudo dpkg -i /tmp/cloudflared.deb
fi
echo "✅  cloudflared $(cloudflared --version | head -1)"

# ── 2. Configure nginx ────────────────────────────────────────────────────────
echo ""
echo "▶  Configuring nginx..."

sudo tee /etc/nginx/sites-available/words2voice > /dev/null << NGINXCONF
# words2voice — nginx config
# Serves Angular SPA and proxies /api/* to Spring Boot backend

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Angular production build
    root ${FRONTEND_DIST};
    index index.html;

    # ── API → Spring Boot ────────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:8080/api/;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 180s;   # TTS synthesis can take up to 2 min on CPU
        proxy_connect_timeout 10s;

        # If backend is down → show maintenance page
        proxy_intercept_errors on;
    }

    # ── Audio file downloads (larger, needs higher timeout) ───────────────────
    location /api/public/tts/ {
        proxy_pass         http://127.0.0.1:8080/api/public/tts/;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_read_timeout 240s;
        proxy_connect_timeout 10s;
        proxy_intercept_errors on;
    }

    # ── Angular SPA — all routes fallback to index.html ──────────────────────
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # ── Custom error pages (shown when services are down) ─────────────────────
    error_page 502 503 504 /maintenance.html;
    location = /maintenance.html {
        # Already in the Angular dist folder — serve directly
        root ${FRONTEND_DIST};
        internal;
    }

    # ── Security headers ──────────────────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ── Caching for static assets ─────────────────────────────────────────────
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # ── llms.txt, robots.txt, sitemap.xml — no cache, crawlers need fresh ─────
    location ~ ^/(llms\.txt|robots\.txt|sitemap\.xml|site\.webmanifest)$ {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }
}
NGINXCONF

# Enable site, disable default
sudo ln -sf /etc/nginx/sites-available/words2voice /etc/nginx/sites-enabled/words2voice
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
echo "✅  nginx configured and running"

# ── 3. Spring Boot systemd service ───────────────────────────────────────────
echo ""
echo "▶  Creating Spring Boot systemd service..."

sudo tee /etc/systemd/system/words2voice-backend.service > /dev/null << SVCEOF
[Unit]
Description=words2voice Spring Boot Backend
Documentation=https://https://words2voice.vercel.app/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${REPO_ROOT}/backend
ExecStart=/usr/bin/java \\
  -Xmx512m -Xms128m \\
  -Djava.security.egd=file:/dev/./urandom \\
  -jar ${BACKEND_JAR}
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal
SyslogIdentifier=words2voice-backend

# Environment — local profile, CORS allows https://words2voice.vercel.app/
Environment="SPRING_PROFILES_ACTIVE=local"
Environment="ALLOWED_ORIGINS=https://https://words2voice.vercel.app/,http://localhost:4200"
Environment="JWT_SECRET=${JWT_SECRET}"
Environment="JAVA_OPTS=-Xmx512m"

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable words2voice-backend
sudo systemctl restart words2voice-backend
echo "✅  Spring Boot service enabled and started"

# ── 4. TTS Docker container ───────────────────────────────────────────────────
echo ""
echo "▶  Ensuring TTS Docker container is running with restart policy..."
if sg docker -c "docker ps --filter name=tts-service --format '{{.Names}}'" 2>/dev/null | grep -q tts-service; then
  echo "✅  TTS container already running"
else
  sg docker -c "
    docker run -d \
      --name tts-service \
      --restart unless-stopped \
      -p 8000:8000 \
      -e PORT=8000 \
      -v ${TTS_CACHE}:/home/user/.cache/supertonic3:ro \
      words2voice-tts
  " 2>/dev/null || true
  echo "✅  TTS container started"
fi

# Ensure Docker itself auto-starts
sudo systemctl enable docker 2>/dev/null || true

# ── 5. Cloudflare tunnel setup ────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅  All services configured for auto-start!"
echo ""
echo "  Next: Set up Cloudflare Tunnel (requires browser login)"
echo "  Run these commands in a new terminal:"
echo ""
echo "  cloudflared tunnel login"
echo "  cloudflared tunnel create words2voice"
echo "  cloudflared tunnel route dns words2voice https://words2voice.vercel.app/"
echo "  cloudflared tunnel route dns words2voice www.https://words2voice.vercel.app/"
echo ""
echo "  Then run: bash ${REPO_ROOT}/tts-service/setup-cloudflared-service.sh"
echo "═══════════════════════════════════════════════════════════"
