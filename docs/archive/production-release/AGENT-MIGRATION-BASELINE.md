# Agent Migration Baseline (Production)

Date: 2026-07-13  
VPS DB: `real_estate_ai` @ `localhost:5432`  
Backup before changes: `/var/www/real-estate-ai-cms/backups/pre-agent-production-20260713-135015.dump` (21MB, `pg_restore --list` = 180 lines)

## Pre-state

| Check | Result |
|-------|--------|
| `_prisma_migrations` | **Missing** |
| `prisma/migrations` on VPS | **Missing** |
| Agent tables | **None** |
| Prior apply method | `prisma db push` (legacy deploy.ps1) |

## Migration matrix (pre-deploy)

| Migration | In repo | In `_prisma_migrations` | Schema objects on VPS | Checksum | Action |
|-----------|---------|-------------------------|----------------------|----------|--------|
| 20260710103000_add_ai_agent_platform | Yes | No | Missing (agent_*) | N/A | **migrate deploy** |
| 20260711040000_add_agent_action_proposals | Yes | No | Missing | N/A | **migrate deploy** |
| 20260712060000_lead_intelligence_fields | Yes | No | Missing (needs agent_findings) | N/A | **migrate deploy** |
| 20260712080000_external_inventory_and_finding_sales_fields | Yes | No | Missing | N/A | **migrate deploy** |
| 20260713050000_pipeline_lifecycle_ingest_telegram | Yes | No | Missing | N/A | **migrate deploy** |

**No `migrate resolve --applied`** — schema objects are absent, so resolve would be incorrect.

## SQL safety review

All five migrations reviewed: **no** `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER TYPE`, or unexpected cascade deletes.  
New Lead columns use `ADD COLUMN IF NOT EXISTS`. Agent tables are greenfield `CREATE TABLE`.

## Apply method

Use `scripts/deploy-safe.ps1` → `npx prisma migrate deploy`  
**Forbidden:** `prisma db push`, `prisma db push --accept-data-loss`, stock `scripts/deploy.ps1`.

## Post-apply verification checklist

1. `npx prisma migrate status` → Database schema is up to date  
2. `_prisma_migrations` has 5 rows  
3. Tables exist: `agent_sources`, `agent_findings`, `scanned_contents`, `external_inventory_items`, `agent_api_credentials`, `agent_ingestion_events`, `agent_sync_outbox`, `agent_ingest_nonces`, `telegram_delivery_logs`  
4. Columns: `agent_findings.consumption_type`, `leads.metadata`, `leads.call_count`, `external_inventory_items.official_property_id`

## Risks

- First-time agent schema on production; large additive change.  
- If migrate fails mid-way, keep old PM2 process / restore dump.  
- Do not restart onto new code if migrate fails.

## Post-apply (2026-07-13 13:55 +07)

`migrate resolve --applied 20260630000000_baseline_existing_cms` then `migrate deploy` applied all 5 agent migrations.

Evidence: `_prisma_migrations` has 6 rows; agent tables listed in verification report.

**No further resolve needed.**
