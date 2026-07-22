#!/bin/bash
set -euo pipefail
DEST=/var/backups/real-estate-ai-cms/h0-v0.9.0
APP=/var/www/real-estate-ai-cms
mkdir -p "$DEST"
cp -a "$APP/.env" "$DEST/env.bak"
# Best-effort DB dump (may fail if pg_dump/user mismatch)
set +e
DBURL=$(grep -E '^DATABASE_URL=' "$APP/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -n "$DBURL" ] && command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DBURL" -Fc -f "$DEST/db.dump" 2>"$DEST/pg_dump.err"
  echo "pg_dump_exit=$?"
else
  echo "pg_dump_skipped"
fi
set -e
ls -la "$DEST"
echo "BACKUP_OK"
