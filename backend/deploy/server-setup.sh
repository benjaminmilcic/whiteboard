#!/usr/bin/env bash
#
# One-time server setup for the kids' chat API (Sovica) of the whiteboard app.
# Run as root from a checkout of the repository:
#   sudo bash backend/deploy/server-setup.sh
#
# Idempotent: running it again changes nothing that already exists - the env
# file in particular is only created once.
#
# What it does:
#   1. creates the system user `kidschat` (runs the backend)
#   2. creates the code directory (written by `deploy`) and the env directory
#   3. creates the env file from the example (the Groq key has to be added by hand)
#   4. installs the systemd unit, the Apache vHost and the sudoers rule
#
# It does not touch any other service, vHost or sudoers file.
# Everything here is specific to benjamin-milcic.dev - adapt names, paths and
# the domain before using it on your own server.

set -euo pipefail

DOMAIN=chat-api.benjamin-milcic.dev
API_DIR=/opt/kids-chat-api
ENV_DIR=/etc/kids-chat-api
ENV_FILE=$ENV_DIR/kids-chat-api.env
SERVICE=kids-chat-api
SUDOERS_NAME=93-deploy-kids-chat
SUDOERS_FILE=/etc/sudoers.d/$SUDOERS_NAME

HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo bash $0)"; exit 1; }
id deploy >/dev/null 2>&1 || { echo "User 'deploy' does not exist"; exit 1; }
for f in "systemd/$SERVICE.service" "apache/$DOMAIN.conf" \
         "sudoers/$SUDOERS_NAME" "kids-chat-api.env.example"; do
  [ -f "$HERE/$f" ] || { echo "Missing $HERE/$f"; exit 1; }
done

echo "== 1. system user"
if id kidschat >/dev/null 2>&1; then
  echo "   kidschat exists"
else
  useradd --system --no-create-home --home-dir /nonexistent \
          --shell /usr/sbin/nologin kidschat
  echo "   created kidschat"
fi

echo "== 2. directories"
# Code: written by deploy, only readable for the service user (setgid keeps
# the group on files that rsync creates).
install -d -o deploy -g kidschat -m 2750 "$API_DIR"
install -d -o root   -g root     -m 0700 "$ENV_DIR"

echo "== 3. env file"
if [ -f "$ENV_FILE" ]; then
  echo "   $ENV_FILE exists - left untouched"
else
  (
    umask 077
    cp "$HERE/kids-chat-api.env.example" "$ENV_FILE"
  )
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "   created $ENV_FILE - add GROQ_API_KEY before the first start!"
fi

echo "== 4a. systemd unit"
install -o root -g root -m 644 "$HERE/systemd/$SERVICE.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
echo "   enabled $SERVICE (starts with the first deploy)"

echo "== 4b. Apache vHost"
install -o root -g root -m 644 "$HERE/apache/$DOMAIN.conf" /etc/apache2/sites-available/
a2ensite -q "$DOMAIN"
# A broken config must not stay enabled - the next Apache restart would fail for ALL sites
if ! apache2ctl configtest; then
  a2dissite -q "$DOMAIN"
  echo "Apache config test failed - $DOMAIN disabled again, nothing reloaded."
  exit 1
fi
systemctl reload apache2

echo "== 4c. sudoers"
visudo -cf "$HERE/sudoers/$SUDOERS_NAME"
install -o root -g root -m 440 "$HERE/sudoers/$SUDOERS_NAME" "$SUDOERS_FILE"
visudo -c >/dev/null

echo
echo "Done. Next steps:"
if ! grep -q '^GROQ_API_KEY=.\+' "$ENV_FILE"; then
  echo "  - add the Groq key:   sudo nano $ENV_FILE"
fi
echo "  - Cloudflare: DNS record 'chat-api' -> this server, proxied (orange cloud)"
echo "  - GitHub: secret DEPLOY_SSH_KEY in the whiteboard repo, then run the"
echo "    'Deploy backend' workflow (or push a change under backend/)"
