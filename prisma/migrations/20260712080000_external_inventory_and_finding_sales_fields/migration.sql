-- Lead Intelligence sales UX + External Inventory

ALTER TABLE "agent_findings"
  ADD COLUMN IF NOT EXISTS "person_name" TEXT,
  ADD COLUMN IF NOT EXISTS "need_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "score_status" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "promoted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promoted_by" TEXT,
  ADD COLUMN IF NOT EXISTS "external_inventory_item_id" TEXT,
  ADD COLUMN IF NOT EXISTS "external_inventory_saved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "external_inventory_saved_by" TEXT;

CREATE INDEX IF NOT EXISTS "agent_findings_score_status_idx" ON "agent_findings"("score_status");

CREATE TABLE IF NOT EXISTS "external_inventory_items" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "finding_id" TEXT,
  "scanned_content_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "original_content" TEXT NOT NULL,
  "property_type" TEXT,
  "transaction_type" TEXT NOT NULL DEFAULT 'unknown',
  "asking_price_min" BIGINT,
  "asking_price_max" BIGINT,
  "rent_price" BIGINT,
  "city" TEXT,
  "district" TEXT,
  "ward" TEXT,
  "street" TEXT,
  "project" TEXT,
  "area_min_m2" DOUBLE PRECISION,
  "area_max_m2" DOUBLE PRECISION,
  "frontage_meters" DOUBLE PRECISION,
  "depth_meters" DOUBLE PRECISION,
  "bedrooms" INTEGER,
  "floors" INTEGER,
  "legal_status" TEXT,
  "direction" TEXT,
  "contact_name" TEXT,
  "contact_phone" TEXT,
  "contact_facebook_url" TEXT,
  "source_url" TEXT,
  "source_name" TEXT,
  "source_type" TEXT,
  "content_hash" TEXT,
  "verification_status" TEXT NOT NULL DEFAULT 'unverified',
  "status" TEXT NOT NULL DEFAULT 'active',
  "duplicate_of_id" TEXT,
  "raw_data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "external_inventory_items_company_id_status_created_at_idx"
  ON "external_inventory_items"("company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "external_inventory_items_company_id_transaction_type_idx"
  ON "external_inventory_items"("company_id", "transaction_type");
CREATE INDEX IF NOT EXISTS "external_inventory_items_company_id_verification_status_idx"
  ON "external_inventory_items"("company_id", "verification_status");
CREATE INDEX IF NOT EXISTS "external_inventory_items_company_id_contact_phone_idx"
  ON "external_inventory_items"("company_id", "contact_phone");
CREATE INDEX IF NOT EXISTS "external_inventory_items_source_url_idx" ON "external_inventory_items"("source_url");
CREATE INDEX IF NOT EXISTS "external_inventory_items_content_hash_idx" ON "external_inventory_items"("content_hash");
CREATE INDEX IF NOT EXISTS "external_inventory_items_finding_id_idx" ON "external_inventory_items"("finding_id");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_inventory_items_duplicate_of_id_fkey'
  ) THEN
    ALTER TABLE "external_inventory_items"
      ADD CONSTRAINT "external_inventory_items_duplicate_of_id_fkey"
      FOREIGN KEY ("duplicate_of_id") REFERENCES "external_inventory_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "external_inventory_sources" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "source_url" TEXT,
  "source_name" TEXT,
  "author_name" TEXT,
  "author_url" TEXT,
  "published_at" TIMESTAMP(3),
  "collected_at" TIMESTAMP(3),
  "raw_content" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_inventory_sources_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "external_inventory_sources_item_id_idx" ON "external_inventory_sources"("item_id");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_inventory_sources_item_id_fkey'
  ) THEN
    ALTER TABLE "external_inventory_sources"
      ADD CONSTRAINT "external_inventory_sources_item_id_fkey"
      FOREIGN KEY ("item_id") REFERENCES "external_inventory_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "external_inventory_events" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "note" TEXT,
  "user_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_inventory_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "external_inventory_events_item_id_created_at_idx"
  ON "external_inventory_events"("item_id", "created_at");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_inventory_events_item_id_fkey'
  ) THEN
    ALTER TABLE "external_inventory_events"
      ADD CONSTRAINT "external_inventory_events_item_id_fkey"
      FOREIGN KEY ("item_id") REFERENCES "external_inventory_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "agent_finding_match_events" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "finding_id" TEXT NOT NULL,
  "inventory_kind" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "match_score" INTEGER NOT NULL,
  "reasons" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  "user_id" TEXT,
  "sent_to_client" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_finding_match_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "agent_finding_match_events_finding_id_created_at_idx"
  ON "agent_finding_match_events"("finding_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_finding_match_events_company_id_idx"
  ON "agent_finding_match_events"("company_id");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_findings_external_inventory_item_id_fkey'
  ) THEN
    ALTER TABLE "agent_findings"
      ADD CONSTRAINT "agent_findings_external_inventory_item_id_fkey"
      FOREIGN KEY ("external_inventory_item_id") REFERENCES "external_inventory_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "agent_findings_external_inventory_item_id_idx"
  ON "agent_findings"("external_inventory_item_id");
