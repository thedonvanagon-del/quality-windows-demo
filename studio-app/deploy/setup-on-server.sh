#!/bin/bash
# One-time setup of the studio booking app on the EXISTING Lightsail server
# (the one that already runs the Bookie Bullies app). It adds a second service
# and a second Caddy site. It does not touch the first app, its data, or its
# Caddy block, and it is safe to run twice.
#
#   sudo bash setup-on-server.sh book.example.com owner@example.com
#
# Needs: the server's Node 22 and Caddy (already there), DNS for the new name
# pointing at this server's static IP, and ports 80 and 443 open (already are).
set -euo pipefail

DOMAIN="${1:?usage: setup-on-server.sh <domain> <owner-email>}"
OWNER="${2:?usage: setup-on-server.sh <domain> <owner-email>}"
PORT=3100
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "That doesn't look like a domain: $DOMAIN" >&2; exit 1; }
[[ "$OWNER" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$ ]] || { echo "That doesn't look like an email: $OWNER" >&2; exit 1; }
for tool in node caddy; do
  command -v "$tool" >/dev/null || { echo "$tool must already be installed on this server." >&2; exit 1; }
done
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "Node 22.13 or newer is needed (found $(node -v))." >&2; exit 1; }

id studioapp >/dev/null 2>&1 || useradd --system --home-dir /opt/studio-app --shell /usr/sbin/nologin studioapp
install -d -o ubuntu -g ubuntu /opt/studio-app
install -d -o studioapp -g studioapp -m 700 /var/lib/studio-app

# Settings. Never overwritten once they exist.
if [ ! -f /etc/studio-app.env ]; then
  cat > /etc/studio-app.env <<ENV
PORT=$PORT
HOST=127.0.0.1
DATABASE_PATH=/var/lib/studio-app/studio.db
TRUST_PROXY=1
TIMEZONE=America/Los_Angeles
APP_URL=https://$DOMAIN
# Who runs the studio. They get the owner pages after signing in with an emailed code.
ADMIN_EMAILS=$OWNER
# Email for sign-in codes, confirmations and reminders. Without these the app
# prints emails to its log instead, and nobody can sign in. Fill them in, then:
#   sudo systemctl restart studio-app
# SMTP_HOST=smtp.gmail.com
# SMTP_USER=hello@yourdomain.com
# SMTP_PASS=the-google-app-password
# MAIL_FROM=Your Studio <hello@yourdomain.com>
ENV
  chown root:studioapp /etc/studio-app.env
  chmod 640 /etc/studio-app.env
fi

cat > /etc/systemd/system/studio-app.service <<'UNIT'
[Unit]
Description=Studio booking app
After=network-online.target
Wants=network-online.target
# Nothing to run until the first deploy lands.
ConditionPathExists=/opt/studio-app/src/server.js

[Service]
User=studioapp
Group=studioapp
WorkingDirectory=/opt/studio-app
EnvironmentFile=/etc/studio-app.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/studio-app

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable studio-app

# Add a site block to Caddy next to the existing one, once.
if ! grep -q "^$DOMAIN {" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"
  cat >> /etc/caddy/Caddyfile <<CADDY

$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
CADDY
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy

echo
echo "Server is ready for $DOMAIN. Next: deploy the code (see studio-app/README.md), then fill in the SMTP lines in /etc/studio-app.env."
