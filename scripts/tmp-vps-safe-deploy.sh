#!/bin/bash
# Safe VPS deploy — migrate deploy only (db-push is forbidden).
set -euo pipefail
REMOTE_DIR="/var/www/real-estate-ai-cms"
ARCHIVE="/tmp/deploy-agent-safe.tar.gz"
PM2_NAME="real-estate-ai-cms"
BUILD_DIR="dist.next"
BACKUP_DIST="dist.prev"

cd "$REMOTE_DIR"
test -f .env
cp .env /tmp/env-preserve-agent-deploy.bak
test -f "$ARCHIVE"

echo "==> Preflight"
command -v node >/dev/null
command -v npm >/dev/null
command -v pm2 >/dev/null
npx prisma --version >/dev/null

echo "==> Extract archive (keep current dist until build succeeds)"
# Extract over tree but preserve live dist by moving aside only after extract of sources.
if [ -d dist ]; then
  rm -rf "$BACKUP_DIST"
  cp -a dist "$BACKUP_DIST"
fi
tar -xzf "$ARCHIVE"
cp /tmp/env-preserve-agent-deploy.bak .env
# Restore live dist for now if tar wiped it with empty/missing
if [ ! -d dist ] && [ -d "$BACKUP_DIST" ]; then
  cp -a "$BACKUP_DIST" dist
fi

echo "==> Stage A feature flags (preserve existing .env values)"
grep -q '^AGENT_INGEST_ENABLED=' .env || echo 'AGENT_INGEST_ENABLED=true' >> .env
grep -q '^AGENT_TELEGRAM_ENABLED=' .env || echo 'AGENT_TELEGRAM_ENABLED=false' >> .env
grep -q '^AGENT_LOCAL_SYNC_ENABLED=' .env || echo 'AGENT_LOCAL_SYNC_ENABLED=false' >> .env
grep -q '^AGENT_SCHEDULER_ENABLED=' .env || echo 'AGENT_SCHEDULER_ENABLED=false' >> .env
grep -q '^FACEBOOK_GRAPH_LEGACY_ENABLED=' .env || echo 'FACEBOOK_GRAPH_LEGACY_ENABLED=true' >> .env
grep -q '^TELEGRAM_CONSOLE_ENABLED=' .env || echo 'TELEGRAM_CONSOLE_ENABLED=1' >> .env
grep -q '^TELEGRAM_CONSOLE_MODE=' .env || echo 'TELEGRAM_CONSOLE_MODE=polling' >> .env
grep -q '^TELEGRAM_POLL_INTERVAL_MS=' .env || echo 'TELEGRAM_POLL_INTERVAL_MS=2500' >> .env
grep -q '^TELEGRAM_EVENT_NOTIFY_MS=' .env || echo 'TELEGRAM_EVENT_NOTIFY_MS=15000' >> .env
grep -q '^TELEGRAM_RATE_LIMIT_PER_MIN=' .env || echo 'TELEGRAM_RATE_LIMIT_PER_MIN=20' >> .env
grep -q '^TELEGRAM_SUMMARY_TICK_MS=' .env || echo 'TELEGRAM_SUMMARY_TICK_MS=60000' >> .env
sed -i 's/^AGENT_INGEST_ENABLED=.*/AGENT_INGEST_ENABLED=true/' .env
sed -i 's/^TELEGRAM_CONSOLE_ENABLED=.*/TELEGRAM_CONSOLE_ENABLED=1/' .env
sed -i 's/^AGENT_TELEGRAM_ENABLED=.*/AGENT_TELEGRAM_ENABLED=true/' .env

set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "==> npm ci"
npm ci

echo "==> migrate status (before)"
npx prisma migrate status || true

echo "==> prisma validate + migrate deploy + generate"
npx prisma validate
npx prisma migrate deploy
npx prisma generate

echo "==> build"
npm run build
test -f dist/server.cjs || test -f dist/index.html

echo "==> Swap verified: keep dist.prev for rollback"
# Current npm build writes to dist/; we already snapshot as dist.prev
rm -rf "$BACKUP_DIST"
if [ -d dist ]; then
  cp -a dist "$BACKUP_DIST"
fi

echo "==> pm2 restart"
pm2 restart "$PM2_NAME" --update-env
sleep 3
pm2 status "$PM2_NAME"

echo "==> Health (local)"
if curl -fsS "http://127.0.0.1:3025/api/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  echo "HEALTH_OK"
else
  echo "HEALTH_FAIL — attempting app rollback to dist.prev"
  if [ -d "$BACKUP_DIST" ]; then
    rm -rf dist
    mv "$BACKUP_DIST" dist
    pm2 restart "$PM2_NAME" --update-env || true
  fi
  exit 1
fi

rm -f "$ARCHIVE"
echo "REMOTE_DEPLOY_OK"
