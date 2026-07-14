-- Hotfix: local→VPS full sync metadata + outbox event types
ALTER TABLE "agent_sources"
  ADD COLUMN IF NOT EXISTS "external_source_key" TEXT,
  ADD COLUMN IF NOT EXISTS "sync_status" TEXT NOT NULL DEFAULT 'local_only',
  ADD COLUMN IF NOT EXISTS "remote_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sync_error" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_sources_company_id_external_source_key_key"
  ON "agent_sources"("company_id", "external_source_key");

CREATE INDEX IF NOT EXISTS "agent_sources_sync_status_idx" ON "agent_sources"("sync_status");

ALTER TABLE "scanned_contents"
  ADD COLUMN IF NOT EXISTS "sync_status" TEXT NOT NULL DEFAULT 'local_only',
  ADD COLUMN IF NOT EXISTS "remote_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sync_error" TEXT,
  ADD COLUMN IF NOT EXISTS "sync_version" TEXT;

CREATE INDEX IF NOT EXISTS "scanned_contents_sync_status_idx" ON "scanned_contents"("sync_status");

ALTER TABLE "agent_findings"
  ADD COLUMN IF NOT EXISTS "sync_status" TEXT NOT NULL DEFAULT 'local_only',
  ADD COLUMN IF NOT EXISTS "remote_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sync_error" TEXT,
  ADD COLUMN IF NOT EXISTS "sync_version" TEXT;

CREATE INDEX IF NOT EXISTS "agent_findings_sync_status_idx" ON "agent_findings"("sync_status");

ALTER TABLE "agent_sync_outbox"
  ADD COLUMN IF NOT EXISTS "event_type" TEXT NOT NULL DEFAULT 'finding_upsert',
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dependency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "remote_source_id" TEXT;

CREATE INDEX IF NOT EXISTS "agent_sync_outbox_event_type_status_idx"
  ON "agent_sync_outbox"("event_type", "status");

CREATE INDEX IF NOT EXISTS "agent_sync_outbox_entity_id_idx"
  ON "agent_sync_outbox"("entity_id");
