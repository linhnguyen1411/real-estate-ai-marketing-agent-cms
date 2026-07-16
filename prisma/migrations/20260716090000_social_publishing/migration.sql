-- Social Publishing MVP: channels, drafts, media, jobs, audit logs

CREATE TABLE IF NOT EXISTS "social_channels" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "external_id" TEXT,
    "profile_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "execution_mode" TEXT NOT NULL,
    "browser_session_id" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_channels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_channels_company_id_idx" ON "social_channels"("company_id");
CREATE INDEX IF NOT EXISTS "social_channels_type_idx" ON "social_channels"("type");
CREATE INDEX IF NOT EXISTS "social_channels_status_idx" ON "social_channels"("status");

CREATE TABLE IF NOT EXISTS "social_post_drafts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "link_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "body_hash" TEXT,
    "normalized_body_hash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_post_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_post_drafts_company_id_idx" ON "social_post_drafts"("company_id");
CREATE INDEX IF NOT EXISTS "social_post_drafts_status_idx" ON "social_post_drafts"("status");
CREATE INDEX IF NOT EXISTS "social_post_drafts_body_hash_idx" ON "social_post_drafts"("body_hash");
CREATE INDEX IF NOT EXISTS "social_post_drafts_normalized_body_hash_idx" ON "social_post_drafts"("normalized_body_hash");

CREATE TABLE IF NOT EXISTS "social_post_media" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "alt_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_post_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_post_media_draft_id_idx" ON "social_post_media"("draft_id");

CREATE TABLE IF NOT EXISTS "social_publish_jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "draft_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "idempotency_key" TEXT NOT NULL,
    "claimed_by" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_publish_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_publish_jobs_idempotency_key_key" ON "social_publish_jobs"("idempotency_key");
CREATE INDEX IF NOT EXISTS "social_publish_jobs_status_scheduled_at_idx" ON "social_publish_jobs"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "social_publish_jobs_channel_id_status_idx" ON "social_publish_jobs"("channel_id", "status");
CREATE INDEX IF NOT EXISTS "social_publish_jobs_company_id_idx" ON "social_publish_jobs"("company_id");
CREATE INDEX IF NOT EXISTS "social_publish_jobs_draft_id_idx" ON "social_publish_jobs"("draft_id");

CREATE TABLE IF NOT EXISTS "social_publish_audit_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_publish_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_publish_audit_logs_entity_type_entity_id_idx"
  ON "social_publish_audit_logs"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "social_publish_audit_logs_company_id_idx" ON "social_publish_audit_logs"("company_id");
CREATE INDEX IF NOT EXISTS "social_publish_audit_logs_created_at_idx" ON "social_publish_audit_logs"("created_at");

DO $$ BEGIN
  ALTER TABLE "social_post_media"
    ADD CONSTRAINT "social_post_media_draft_id_fkey"
    FOREIGN KEY ("draft_id") REFERENCES "social_post_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "social_publish_jobs"
    ADD CONSTRAINT "social_publish_jobs_draft_id_fkey"
    FOREIGN KEY ("draft_id") REFERENCES "social_post_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "social_publish_jobs"
    ADD CONSTRAINT "social_publish_jobs_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "social_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
