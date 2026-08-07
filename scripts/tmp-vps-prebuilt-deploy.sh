#!/bin/bash
# Prebuilt-dist safe deploy — migrate only, skip Vite (OOM avoidance).
set -euo pipefail
REMOTE_DIR="/var/www/real-estate-ai-cms"
ARCHIVE="/tmp/deploy-agent-safe.tar.gz"
PM2_NAME="real-estate-ai-cms"
BACKUP_DIST="dist.prev"

cd "$REMOTE_DIR"
test -f .env
cp .env /tmp/env-preserve-agent-deploy.bak
test -f "$ARCHIVE"

echo "==> Snapshot dist"
if [ -d dist ]; then
  rm -rf "$BACKUP_DIST"
  cp -a dist "$BACKUP_DIST"
fi

echo "==> Extract archive with prebuilt dist"
tar -xzf "$ARCHIVE"
cp /tmp/env-preserve-agent-deploy.bak .env
test -f dist/server.cjs
test -f dist/index.html

echo "==> npm ci"
npm ci

echo "==> prisma validate + migrate deploy + generate"
npx prisma validate
npx prisma migrate status || true
npx prisma migrate deploy
npx prisma generate

echo "==> Skip Vite - using uploaded dist"
ls -lh dist/server.cjs dist/index.html | head -5

echo "==> pm2 restart"
pm2 restart "$PM2_NAME" --update-env
sleep 12
pm2 status "$PM2_NAME"

echo "==> Health"
HEALTH_OK=0
for i in 1 2 3 4 5 6; do
  if curl -fsS "http://127.0.0.1:3025/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 5
done
if [ "$HEALTH_OK" -ne 1 ]; then
  echo "HEALTH_FAIL"
  if [ -d "$BACKUP_DIST" ]; then
    rm -rf dist
    mv "$BACKUP_DIST" dist
    pm2 restart "$PM2_NAME" --update-env || true
  fi
  exit 1
fi

curl -fsS "http://127.0.0.1:3025/api/health" || true
echo
rm -f "$ARCHIVE"
echo "REMOTE_DEPLOY_OK"
