-- Social publish production: channel connection fields + publish attempts

ALTER TABLE "social_channels" ADD COLUMN IF NOT EXISTS "last_verified_at" TIMESTAMP(3);
ALTER TABLE "social_channels" ADD COLUMN IF NOT EXISTS "last_verify_error" TEXT;
ALTER TABLE "social_channels" ADD COLUMN IF NOT EXISTS "token_expires_at" TIMESTAMP(3);
ALTER TABLE "social_channels" ADD COLUMN IF NOT EXISTS "connection_state" TEXT;

CREATE TABLE IF NOT EXISTS "social_publish_attempts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "job_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "worker_id" TEXT,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "facebook_post_id" TEXT,
    "facebook_post_url" TEXT,
    "request_json" JSONB,
    "response_json" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_publish_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_publish_attempts_job_id_idx"
  ON "social_publish_attempts"("job_id");
CREATE INDEX IF NOT EXISTS "social_publish_attempts_channel_id_created_at_idx"
  ON "social_publish_attempts"("channel_id", "created_at");
CREATE INDEX IF NOT EXISTS "social_publish_attempts_company_id_idx"
  ON "social_publish_attempts"("company_id");

DO $$ BEGIN
  ALTER TABLE "social_publish_attempts"
    ADD CONSTRAINT "social_publish_attempts_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "social_publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
