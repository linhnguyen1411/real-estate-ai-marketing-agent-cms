#!/bin/bash
set -euo pipefail
cd /var/www/real-estate-ai-cms
set -a
. ./.env
set +a
mkdir -p /var/www/real-estate-ai-cms/backups
TS=$(date +%Y%m%d-%H%M%S)
DB_URL="${DATABASE_URL%%\?*}"
OUT="/var/www/real-estate-ai-cms/backups/db-${TS}.dump"
pg_dump "$DB_URL" --no-owner --format=custom -f "$OUT"
ls -lh "$OUT"
echo "--- pg_restore --list (first 40) ---"
pg_restore --list "$OUT" | head -40
echo "BACKUP_CUSTOM_OK=$OUT"
