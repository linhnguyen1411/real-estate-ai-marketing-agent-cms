#!/bin/bash
set -euo pipefail
REMOTE_DIR="/var/www/real-estate-ai-cms"
ARCHIVE="/tmp/deploy-agent-safe.tar.gz"
PM2_NAME="real-estate-ai-cms"

cd "$REMOTE_DIR"
test -f .env
cp .env /tmp/env-preserve-agent-deploy.bak
test -f "$ARCHIVE"

echo "==> Extract archive"
rm -rf dist
tar -xzf "$ARCHIVE"
cp /tmp/env-preserve-agent-deploy.bak .env

echo "==> Stage A feature flags (preserve existing .env values)"
grep -q '^AGENT_INGEST_ENABLED=' .env || echo 'AGENT_INGEST_ENABLED=true' >> .env
grep -q '^AGENT_TELEGRAM_ENABLED=' .env || echo 'AGENT_TELEGRAM_ENABLED=false' >> .env
grep -q '^AGENT_LOCAL_SYNC_ENABLED=' .env || echo 'AGENT_LOCAL_SYNC_ENABLED=false' >> .env
grep -q '^AGENT_SCHEDULER_ENABLED=' .env || echo 'AGENT_SCHEDULER_ENABLED=false' >> .env
grep -q '^FACEBOOK_GRAPH_LEGACY_ENABLED=' .env || echo 'FACEBOOK_GRAPH_LEGACY_ENABLED=true' >> .env
# Only force ingest on; do NOT reset telegram/scheduler/local-sync — those wipe prod config on every deploy.
sed -i 's/^AGENT_INGEST_ENABLED=.*/AGENT_INGEST_ENABLED=true/' .env

set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "==> npm ci"
npm ci

echo "==> prisma validate + migrate deploy + generate"
npx prisma validate
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status

echo "==> build"
npm run build

echo "==> pm2 restart"
pm2 restart "$PM2_NAME" --update-env
pm2 status "$PM2_NAME"

rm -f "$ARCHIVE"
echo "REMOTE_DEPLOY_OK"
