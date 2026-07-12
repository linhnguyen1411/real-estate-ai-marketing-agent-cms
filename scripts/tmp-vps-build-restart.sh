#!/bin/bash
set -euo pipefail
cd /var/www/real-estate-ai-cms
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Ensure stage A flags exist; preserve telegram/scheduler/local-sync if already set
grep -q '^AGENT_INGEST_ENABLED=' .env || echo 'AGENT_INGEST_ENABLED=true' >> .env
grep -q '^AGENT_TELEGRAM_ENABLED=' .env || echo 'AGENT_TELEGRAM_ENABLED=false' >> .env
grep -q '^AGENT_LOCAL_SYNC_ENABLED=' .env || echo 'AGENT_LOCAL_SYNC_ENABLED=false' >> .env
grep -q '^AGENT_SCHEDULER_ENABLED=' .env || echo 'AGENT_SCHEDULER_ENABLED=false' >> .env
sed -i 's/^AGENT_INGEST_ENABLED=.*/AGENT_INGEST_ENABLED=true/' .env

# Reload env after edits
set -a
. ./.env
set +a

echo "==> prisma generate"
npx prisma generate

echo "==> build (keep old dist until success)"
npm run build

echo "==> pm2 restart"
pm2 restart real-estate-ai-cms --update-env
sleep 3
pm2 status real-estate-ai-cms
curl -sS -m 10 http://127.0.0.1:3025/api/health || true
echo
echo "BUILD_RESTART_OK"
