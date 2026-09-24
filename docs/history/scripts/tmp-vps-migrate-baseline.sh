#!/bin/bash
set -euo pipefail
cd /var/www/real-estate-ai-cms
set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "==> Baseline existing CMS DB for Prisma Migrate (P3005 fix)"
# Mark no-op baseline as applied WITHOUT requiring empty DB
npx prisma migrate resolve --applied 20260630000000_baseline_existing_cms

echo "==> migrate deploy (agent migrations)"
npx prisma migrate deploy
npx prisma migrate status

echo "==> verify agent tables"
node <<'NODE'
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN (
      'agent_sources','agent_findings','scanned_contents','external_inventory_items',
      'agent_api_credentials','agent_ingestion_events','agent_sync_outbox',
      'telegram_delivery_logs','_prisma_migrations'
    ) ORDER BY table_name`);
  console.log(JSON.stringify(rows, null, 2));
  const mig = await p.$queryRawUnsafe('SELECT migration_name, finished_at::text FROM _prisma_migrations ORDER BY migration_name');
  console.log('MIGRATIONS', JSON.stringify(mig, null, 2));
  await p.$disconnect();
})();
NODE

echo "MIGRATE_OK"
