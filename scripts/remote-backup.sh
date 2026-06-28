#!/bin/bash
set -e
REMOTE_DIR="/var/www/real-estate-ai-cms"
BACKUP_DIR="/var/www/real-estate-ai-cms/backups"
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
cd "$REMOTE_DIR"
set -a && . ./.env && set +a
DB_URL="${DATABASE_URL%%\?*}"
DB_FILE="$BACKUP_DIR/db-$TS.sql"
pg_dump "$DB_URL" --no-owner --clean --if-exists --format=plain -f "$DB_FILE"
ls -lh "$DB_FILE"
echo "BACKUP_DB=$DB_FILE"
