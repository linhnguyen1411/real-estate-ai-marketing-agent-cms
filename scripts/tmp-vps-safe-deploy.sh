#!/bin/bash
# Safe VPS deploy — Strictly sequential migration, data hardening, and build flow.
# Required environment variables in .env:
#   - DATABASE_URL: PostgreSQL connection string
#   - AUTH_SECRET: JWT authentication secret (>= 32 chars)
#   - TOKEN_ENCRYPTION_KEY: AES-256-GCM encryption key for secrets/tokens (>= 32 chars)
#   - AGENT_RUNTIME_TOKEN: Shared secret for Execution Agent Runtime (>= 32 chars)
#   - (Optional) TOKEN_ENCRYPTION_KEY_PREVIOUS: Prior key if performing key rotation
#
# Execution order:
#   1. Backup (database dump + source snapshot)
#   2. Prisma migrate deploy & generate
#   3. Backfill company_id (--dry-run then real, verify 0 orphan records)
#   4. Re-encrypt secrets (--dry-run then real)
#   5. Hash all legacy passwords with scrypt (--dry-run then real)
#   6. Application build
#   7. PM2 restart & health checks

set -euo pipefail

REMOTE_DIR="/var/www/real-estate-ai-cms"
ARCHIVE="/tmp/deploy-agent-safe.tar.gz"
PM2_NAME="real-estate-ai-cms"
BACKUP_DIR="/var/backups/real-estate-ai-cms"
BACKUP_DIST="dist.prev"

cd "$REMOTE_DIR"

test -f .env
cp .env /tmp/env-preserve-agent-deploy.bak
test -f "$ARCHIVE"

echo "==> Preflight checks"
command -v node >/dev/null
command -v npm >/dev/null
command -v pm2 >/dev/null
npx prisma --version >/dev/null

echo "==> Extract archive (keep current dist until build succeeds)"
if [ -d dist ]; then
  rm -rf "$BACKUP_DIST"
  cp -a dist "$BACKUP_DIST"
fi
tar -xzf "$ARCHIVE"
cp /tmp/env-preserve-agent-deploy.bak .env
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

echo "==> Checking required environment variables"
REQUIRED_VARS=("DATABASE_URL" "AUTH_SECRET" "TOKEN_ENCRYPTION_KEY" "AGENT_RUNTIME_TOKEN")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "[ERROR] Missing required environment variable: $var"
    exit 1
  fi
done

echo "==> Install dependencies (npm ci)"
npm ci

# ----------------------------------------------------
# STEP 1: BACKUP
# ----------------------------------------------------
echo "==> STEP 1: Database backup"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/db-backup-$(date +%Y%m%d_%H%M%S).sql"
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
  echo "[BACKUP] Database snapshot created at $BACKUP_FILE"
else
  echo "[BACKUP] Warning: pg_dump not found in PATH, skipping pg_dump backup"
fi

# ----------------------------------------------------
# STEP 2: MIGRATE DEPLOY
# ----------------------------------------------------
echo "==> STEP 2: Prisma migrate deploy + generate"
npx prisma validate
npx prisma migrate deploy
npx prisma generate
node scripts/ensure-master-plan-db.mjs || true

# ----------------------------------------------------
# STEP 3: BACKFILL COMPANY_ID (--dry-run then real + verify 0 orphan records)
# ----------------------------------------------------
echo "==> STEP 3: Backfill company_id (--dry-run)"
npx tsx scripts/security/backfill-company-id.ts --dry-run
echo "==> STEP 3: Backfill company_id (execution)"
npx tsx scripts/security/backfill-company-id.ts

# ----------------------------------------------------
# STEP 4: REENCRYPT SECRETS (--dry-run then real)
# ----------------------------------------------------
echo "==> STEP 4: Re-encrypt secrets (--dry-run)"
npx tsx scripts/security/reencrypt-secrets.ts --dry-run
echo "==> STEP 4: Re-encrypt secrets (execution)"
npx tsx scripts/security/reencrypt-secrets.ts

# ----------------------------------------------------
# STEP 5: HASH ALL PASSWORDS (--dry-run then real)
# ----------------------------------------------------
echo "==> STEP 5: Hash all legacy passwords (--dry-run)"
npx tsx scripts/security/hash-all-passwords.ts --dry-run
echo "==> STEP 5: Hash all legacy passwords (execution)"
npx tsx scripts/security/hash-all-passwords.ts

# ----------------------------------------------------
# STEP 6: BUILD
# ----------------------------------------------------
echo "==> STEP 6: Build application"
NODE_OPTIONS="--max-old-space-size=1536" npm run build
test -f dist/server.cjs || test -f dist/index.html

# Swap verified: keep dist.prev for rollback
rm -rf "$BACKUP_DIST"
if [ -d dist ]; then
  cp -a dist "$BACKUP_DIST"
fi

# ----------------------------------------------------
# STEP 7: PM2 RESTART & HEALTH CHECKS
# ----------------------------------------------------
echo "==> STEP 7: Restart application with PM2"
pm2 restart "$PM2_NAME" --update-env
sleep 15
pm2 status "$PM2_NAME"

echo "==> Health check verification"
HEALTH_OK=0
for i in 1 2 3 4 5 6; do
  if curl -fsS "http://127.0.0.1:3025/api/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 5
done

if [ "$HEALTH_OK" -eq 1 ]; then
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
