#!/bin/bash
# Wipe Lead Intelligence + External Inventory on production DB.
# Keeps: AgentSource, CRM customers, official properties, scan jobs config.
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/var/www/real-estate-ai-cms}"
cd "$REMOTE_DIR"
test -f .env
set -a
# shellcheck disable=SC1091
. ./.env
set +a
test -n "${DATABASE_URL:-}"
DB_URL="${DATABASE_URL%%\?*}"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${REMOTE_DIR}/backups"
mkdir -p "$BACKUP_DIR"
DUMP_FILE="$BACKUP_DIR/pre-lead-intelligence-wipe-${STAMP}.dump"

echo "==> Backup before wipe"
pg_dump "$DB_URL" --format=custom --file="$DUMP_FILE"
ls -lh "$DUMP_FILE"

echo "==> Counts before"
psql "$DB_URL" -At -c "
SELECT 'scanned_contents', COUNT(*) FROM scanned_contents
UNION ALL SELECT 'agent_findings', COUNT(*) FROM agent_findings
UNION ALL SELECT 'external_inventory_items', COUNT(*) FROM external_inventory_items
UNION ALL SELECT 'agent_notifications', COUNT(*) FROM agent_notifications WHERE finding_id IS NOT NULL
UNION ALL SELECT 'telegram_delivery_logs', COUNT(*) FROM telegram_delivery_logs;
"

echo "==> Wipe (transaction)"
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

DELETE FROM agent_action_proposals;
DELETE FROM agent_notifications WHERE finding_id IS NOT NULL;
DELETE FROM agent_finding_match_events;
DELETE FROM telegram_delivery_logs;

UPDATE agent_workflow_step_runs SET finding_id = NULL, scanned_content_id = NULL WHERE finding_id IS NOT NULL OR scanned_content_id IS NOT NULL;
UPDATE leads SET finding_id = NULL, scanned_content_id = NULL WHERE finding_id IS NOT NULL OR scanned_content_id IS NOT NULL;

UPDATE agent_findings SET duplicate_of_finding_id = NULL WHERE duplicate_of_finding_id IS NOT NULL;
UPDATE agent_findings SET external_inventory_item_id = NULL WHERE external_inventory_item_id IS NOT NULL;
UPDATE external_inventory_items SET duplicate_of_id = NULL WHERE duplicate_of_id IS NOT NULL;
UPDATE external_inventory_items SET finding_id = NULL WHERE finding_id IS NOT NULL;

DELETE FROM external_inventory_sources;
DELETE FROM external_inventory_events;
DELETE FROM external_inventory_items;

DELETE FROM agent_findings;
DELETE FROM scanned_contents;

DELETE FROM agent_ingestion_events;
DELETE FROM agent_sync_outbox WHERE event_type IN ('finding_upsert', 'content_upsert', 'scanned_content_upsert');

COMMIT;
SQL

echo "==> Counts after"
psql "$DB_URL" -At -c "
SELECT 'scanned_contents', COUNT(*) FROM scanned_contents
UNION ALL SELECT 'agent_findings', COUNT(*) FROM agent_findings
UNION ALL SELECT 'external_inventory_items', COUNT(*) FROM external_inventory_items
UNION ALL SELECT 'agent_notifications_finding', COUNT(*) FROM agent_notifications WHERE finding_id IS NOT NULL;
"

echo "WIPE_OK backup=$DUMP_FILE"
