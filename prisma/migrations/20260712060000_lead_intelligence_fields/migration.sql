-- Lead Intelligence: indexed columns on agent_findings + content dedupe fields

ALTER TABLE "scanned_contents"
  ADD COLUMN IF NOT EXISTS "normalized_content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "near_duplicate_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "dedupe_version" TEXT;

CREATE INDEX IF NOT EXISTS "scanned_contents_source_id_normalized_content_hash_idx"
  ON "scanned_contents"("source_id", "normalized_content_hash");
CREATE INDEX IF NOT EXISTS "scanned_contents_source_id_near_duplicate_fingerprint_idx"
  ON "scanned_contents"("source_id", "near_duplicate_fingerprint");

ALTER TABLE "agent_findings"
  ADD COLUMN IF NOT EXISTS "classification" TEXT,
  ADD COLUMN IF NOT EXISTS "intent" TEXT,
  ADD COLUMN IF NOT EXISTS "actor_role" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "keyword_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "ai_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "lead_fit_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "final_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "primary_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "primary_location" TEXT,
  ADD COLUMN IF NOT EXISTS "budget_min" BIGINT,
  ADD COLUMN IF NOT EXISTS "budget_max" BIGINT,
  ADD COLUMN IF NOT EXISTS "asking_price" BIGINT,
  ADD COLUMN IF NOT EXISTS "property_type" TEXT,
  ADD COLUMN IF NOT EXISTS "dismissed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dismissed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "dismiss_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "dismiss_note" TEXT,
  ADD COLUMN IF NOT EXISTS "duplicate_of_finding_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dedupe_status" TEXT NOT NULL DEFAULT 'unique',
  ADD COLUMN IF NOT EXISTS "similarity_score" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "dedupe_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "intelligence_version" TEXT;

-- Backfill final_score from existing score
UPDATE "agent_findings" SET "final_score" = "score" WHERE "final_score" IS NULL;

CREATE INDEX IF NOT EXISTS "agent_findings_company_id_status_created_at_idx"
  ON "agent_findings"("company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "agent_findings_company_id_classification_status_idx"
  ON "agent_findings"("company_id", "classification", "status");
CREATE INDEX IF NOT EXISTS "agent_findings_company_id_final_score_idx"
  ON "agent_findings"("company_id", "final_score");
CREATE INDEX IF NOT EXISTS "agent_findings_company_id_primary_phone_idx"
  ON "agent_findings"("company_id", "primary_phone");
CREATE INDEX IF NOT EXISTS "agent_findings_company_id_primary_location_idx"
  ON "agent_findings"("company_id", "primary_location");
CREATE INDEX IF NOT EXISTS "agent_findings_company_id_dedupe_status_idx"
  ON "agent_findings"("company_id", "dedupe_status");
CREATE INDEX IF NOT EXISTS "agent_findings_duplicate_of_finding_id_idx"
  ON "agent_findings"("duplicate_of_finding_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_findings_duplicate_of_finding_id_fkey'
  ) THEN
    ALTER TABLE "agent_findings"
      ADD CONSTRAINT "agent_findings_duplicate_of_finding_id_fkey"
      FOREIGN KEY ("duplicate_of_finding_id") REFERENCES "agent_findings"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
