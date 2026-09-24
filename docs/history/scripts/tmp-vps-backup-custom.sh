#!/bin/bash
set -euo pipefail
BACKUP_DIR="/var/www/real-estate-ai-cms/backups"
REMOTE_DIR="/var/www/real-estate-ai-cms"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cd "$REMOTE_DIR"
test -f .env
set -a
# shellcheck disable=SC1091
. ./.env
set +a
test -n "${DATABASE_URL:-}"
DB_URL="${DATABASE_URL%%\?*}"
command -v pg_dump >/dev/null
command -v pg_restore >/dev/null

DUMP_FILE="$BACKUP_DIR/pre-agent-production-${STAMP}.dump"
META_FILE="$BACKUP_DIR/pre-agent-production-${STAMP}.meta.txt"
LIST_FILE="$BACKUP_DIR/pre-agent-production-${STAMP}.list.txt"

# Host/db without password
DB_META=$(node -e "const u=process.env.DATABASE_URL||''; const m=u.match(/\/\/([^:@]+)(?::[^@]*)?@([^/]+)\/([^?]+)/); if(!m){process.exit(1)}; console.log('user='+m[1]+'\\nhost='+m[2]+'\\ndb='+m[3]);")

pg_dump "$DB_URL" --format=custom --file="$DUMP_FILE"
test -s "$DUMP_FILE"
SIZE=$(wc -c < "$DUMP_FILE")

{
  echo "timestamp=$STAMP"
  echo "$DB_META"
  echo "dump_file=$DUMP_FILE"
  echo "dump_bytes=$SIZE"
  echo "git_note=VPS_not_git; local_target=feature/ai-employee-platform"
  echo "schema_note=pre-agent; no _prisma_migrations"
} > "$META_FILE"

pg_restore --list "$DUMP_FILE" > "$LIST_FILE"
test -s "$LIST_FILE"
LIST_LINES=$(wc -l < "$LIST_FILE")

# Also snapshot current dist for code rollback
if [ -d dist ]; then
  tar -czf "$BACKUP_DIR/dist-pre-agent-${STAMP}.tar.gz" dist
fi
cp .env "$BACKUP_DIR/env-pre-agent-${STAMP}.bak"

echo "BACKUP_OK"
echo "DUMP=$DUMP_FILE"
echo "BYTES=$SIZE"
echo "LIST_LINES=$LIST_LINES"
echo "META=$META_FILE"
ls -lh "$DUMP_FILE" "$LIST_FILE" "$META_FILE"
