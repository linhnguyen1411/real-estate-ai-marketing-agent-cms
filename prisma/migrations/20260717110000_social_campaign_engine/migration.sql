-- Multi-destination campaign engine (Phase E1)
CREATE TABLE IF NOT EXISTS "social_campaigns" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "name" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "destination_channel_ids" JSONB NOT NULL DEFAULT '[]',
    "schedule" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "social_campaign_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "campaign_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "trigger_type" TEXT NOT NULL DEFAULT 'manual',
    "triggered_by" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "progress" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_campaign_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "social_campaign_targets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "campaign_run_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "destination_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "publish_job_id" TEXT,
    "mission_run_id" TEXT,
    "permalink" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_campaign_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_campaign_targets_publish_job_id_key" ON "social_campaign_targets"("publish_job_id");
CREATE INDEX IF NOT EXISTS "social_campaigns_company_id_idx" ON "social_campaigns"("company_id");
CREATE INDEX IF NOT EXISTS "social_campaigns_draft_id_idx" ON "social_campaigns"("draft_id");
CREATE INDEX IF NOT EXISTS "social_campaigns_status_idx" ON "social_campaigns"("status");
CREATE INDEX IF NOT EXISTS "social_campaign_runs_company_id_idx" ON "social_campaign_runs"("company_id");
CREATE INDEX IF NOT EXISTS "social_campaign_runs_campaign_id_created_at_idx" ON "social_campaign_runs"("campaign_id", "created_at");
CREATE INDEX IF NOT EXISTS "social_campaign_runs_status_idx" ON "social_campaign_runs"("status");
CREATE INDEX IF NOT EXISTS "social_campaign_targets_company_id_idx" ON "social_campaign_targets"("company_id");
CREATE INDEX IF NOT EXISTS "social_campaign_targets_campaign_run_id_sort_order_idx" ON "social_campaign_targets"("campaign_run_id", "sort_order");
CREATE INDEX IF NOT EXISTS "social_campaign_targets_channel_id_idx" ON "social_campaign_targets"("channel_id");
CREATE INDEX IF NOT EXISTS "social_campaign_targets_status_idx" ON "social_campaign_targets"("status");

DO $$ BEGIN
  ALTER TABLE "social_campaigns" ADD CONSTRAINT "social_campaigns_draft_id_fkey"
    FOREIGN KEY ("draft_id") REFERENCES "social_post_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_campaign_runs" ADD CONSTRAINT "social_campaign_runs_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "social_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_campaign_targets" ADD CONSTRAINT "social_campaign_targets_campaign_run_id_fkey"
    FOREIGN KEY ("campaign_run_id") REFERENCES "social_campaign_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
