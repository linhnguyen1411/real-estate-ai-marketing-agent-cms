-- Pipeline lifecycle: Finding consumption, InvestorLead call/CRM conversion,
-- External Inventory call/official conversion, VPS ingest credentials/outbox, Telegram.

-- Lead (Investor) enrichment + call/conversion
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "finding_id" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "scanned_content_id" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "priority" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "need_summary" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "facebook_profile_url" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "secondary_phones" JSONB;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_locations" JSONB;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "property_types" JSONB;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "budget_min" BIGINT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "budget_max" BIGINT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "call_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_called_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_called_by" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "callback_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "call_note" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "converted_customer_id" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "converted_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "converted_by" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "first_seen_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "leads_finding_id_idx" ON "leads"("finding_id");
CREATE INDEX IF NOT EXISTS "leads_converted_customer_id_idx" ON "leads"("converted_customer_id");
CREATE INDEX IF NOT EXISTS "leads_callback_at_idx" ON "leads"("callback_at");

-- AgentFinding consumption
ALTER TABLE "agent_findings" ADD COLUMN IF NOT EXISTS "consumption_type" TEXT DEFAULT 'none';
ALTER TABLE "agent_findings" ADD COLUMN IF NOT EXISTS "consumed_at" TIMESTAMP(3);
ALTER TABLE "agent_findings" ADD COLUMN IF NOT EXISTS "consumed_by" TEXT;
ALTER TABLE "agent_findings" ADD COLUMN IF NOT EXISTS "consumed_resource_id" TEXT;
ALTER TABLE "agent_findings" ADD COLUMN IF NOT EXISTS "consumed_resource_type" TEXT;

CREATE INDEX IF NOT EXISTS "agent_findings_consumption_type_status_idx" ON "agent_findings"("consumption_type", "status");
CREATE INDEX IF NOT EXISTS "agent_findings_consumed_resource_id_idx" ON "agent_findings"("consumed_resource_id");

-- Backfill consumption from legacy promote / external save
UPDATE "agent_findings"
SET
  "status" = 'promoted_to_investor_lead',
  "consumption_type" = 'investor_lead',
  "consumed_at" = COALESCE("promoted_at", "updated_at"),
  "consumed_by" = "promoted_by",
  "consumed_resource_id" = "promoted_lead_id",
  "consumed_resource_type" = 'investor_lead'
WHERE "promoted_lead_id" IS NOT NULL
  AND ("consumption_type" IS NULL OR "consumption_type" = 'none');

UPDATE "agent_findings"
SET
  "status" = 'saved_to_external_inventory',
  "consumption_type" = 'external_inventory',
  "consumed_at" = COALESCE("external_inventory_saved_at", "updated_at"),
  "consumed_by" = "external_inventory_saved_by",
  "consumed_resource_id" = "external_inventory_item_id",
  "consumed_resource_type" = 'external_inventory'
WHERE "external_inventory_item_id" IS NOT NULL
  AND ("consumption_type" IS NULL OR "consumption_type" = 'none')
  AND "promoted_lead_id" IS NULL;

-- External inventory call + official conversion
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "call_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "last_called_at" TIMESTAMP(3);
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "last_called_by" TEXT;
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "callback_at" TIMESTAMP(3);
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "call_note" TEXT;
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "official_property_id" TEXT;
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "converted_at" TIMESTAMP(3);
ALTER TABLE "external_inventory_items" ADD COLUMN IF NOT EXISTS "converted_by" TEXT;

CREATE INDEX IF NOT EXISTS "external_inventory_items_official_property_id_idx" ON "external_inventory_items"("official_property_id");
CREATE INDEX IF NOT EXISTS "external_inventory_items_callback_at_idx" ON "external_inventory_items"("callback_at");

-- API credentials
CREATE TABLE IF NOT EXISTS "agent_api_credentials" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "key_id" TEXT NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "encrypted_secret" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "scopes" JSONB NOT NULL DEFAULT '["findings:ingest"]',
  "allowed_ips" JSONB,
  "last_used_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "created_by" TEXT,
  CONSTRAINT "agent_api_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_api_credentials_key_id_key" ON "agent_api_credentials"("key_id");
CREATE INDEX IF NOT EXISTS "agent_api_credentials_company_id_status_idx" ON "agent_api_credentials"("company_id", "status");

-- Ingestion events
CREATE TABLE IF NOT EXISTS "agent_ingestion_events" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "ingestion_id" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "local_worker_id" TEXT,
  "key_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "source_id" TEXT,
  "scanned_content_id" TEXT,
  "finding_id" TEXT,
  "request_hash" TEXT,
  "payload_meta" JSONB,
  "warnings" JSONB,
  "telegram_queued" BOOLEAN NOT NULL DEFAULT false,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_ingestion_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_ingestion_events_company_id_ingestion_id_key" ON "agent_ingestion_events"("company_id", "ingestion_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_ingestion_events_company_id_idempotency_key_key" ON "agent_ingestion_events"("company_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "agent_ingestion_events_company_id_created_at_idx" ON "agent_ingestion_events"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_ingestion_events_finding_id_idx" ON "agent_ingestion_events"("finding_id");

-- Sync outbox
CREATE TABLE IF NOT EXISTS "agent_sync_outbox" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "ingestion_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "remote_finding_id" TEXT,
  "remote_content_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "synced_at" TIMESTAMP(3),
  CONSTRAINT "agent_sync_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_sync_outbox_ingestion_id_key" ON "agent_sync_outbox"("ingestion_id");
CREATE INDEX IF NOT EXISTS "agent_sync_outbox_status_next_attempt_at_idx" ON "agent_sync_outbox"("status", "next_attempt_at");

-- Nonces
CREATE TABLE IF NOT EXISTS "agent_ingest_nonces" (
  "id" TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_ingest_nonces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_ingest_nonces_key_id_nonce_key" ON "agent_ingest_nonces"("key_id", "nonce");
CREATE INDEX IF NOT EXISTS "agent_ingest_nonces_expires_at_idx" ON "agent_ingest_nonces"("expires_at");

-- Telegram delivery
CREATE TABLE IF NOT EXISTS "telegram_delivery_logs" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "event_key" TEXT NOT NULL,
  "finding_id" TEXT,
  "chat_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "telegram_msg_id" TEXT,
  "payload_preview" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "telegram_delivery_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_delivery_logs_company_id_event_key_key" ON "telegram_delivery_logs"("company_id", "event_key");
CREATE INDEX IF NOT EXISTS "telegram_delivery_logs_finding_id_idx" ON "telegram_delivery_logs"("finding_id");
CREATE INDEX IF NOT EXISTS "telegram_delivery_logs_status_created_at_idx" ON "telegram_delivery_logs"("status", "created_at");
