-- Mission 2.0: MissionRun / WorkflowStepRun / MissionSource + provenance columns

-- AgentMission pipeline fields
ALTER TABLE "agent_missions" ADD COLUMN IF NOT EXISTS "pipeline" JSONB;
ALTER TABLE "agent_missions" ADD COLUMN IF NOT EXISTS "pipeline_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "agent_missions" ADD COLUMN IF NOT EXISTS "template_key" TEXT;
ALTER TABLE "agent_missions" ADD COLUMN IF NOT EXISTS "next_run_at" TIMESTAMP(3);
ALTER TABLE "agent_missions" ADD COLUMN IF NOT EXISTS "last_run_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "agent_missions_status_next_run_at_idx" ON "agent_missions"("status", "next_run_at");
CREATE INDEX IF NOT EXISTS "agent_missions_template_key_idx" ON "agent_missions"("template_key");

-- Mission ↔ Source M2M
CREATE TABLE IF NOT EXISTS "agent_mission_sources" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "mission_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_mission_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_mission_sources_mission_id_source_id_key"
  ON "agent_mission_sources"("mission_id", "source_id");
CREATE INDEX IF NOT EXISTS "agent_mission_sources_company_id_idx" ON "agent_mission_sources"("company_id");
CREATE INDEX IF NOT EXISTS "agent_mission_sources_source_id_idx" ON "agent_mission_sources"("source_id");
CREATE INDEX IF NOT EXISTS "agent_mission_sources_mission_id_is_active_idx"
  ON "agent_mission_sources"("mission_id", "is_active");

-- Mission runs
CREATE TABLE IF NOT EXISTS "agent_mission_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "mission_id" TEXT NOT NULL,
    "mission_version" INTEGER NOT NULL DEFAULT 1,
    "pipeline_snapshot" JSONB NOT NULL,
    "pipeline_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "trigger_type" TEXT NOT NULL DEFAULT 'manual',
    "triggered_by" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "metrics" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_mission_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_mission_runs_company_id_idx" ON "agent_mission_runs"("company_id");
CREATE INDEX IF NOT EXISTS "agent_mission_runs_mission_id_created_at_idx"
  ON "agent_mission_runs"("mission_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_mission_runs_mission_id_status_idx"
  ON "agent_mission_runs"("mission_id", "status");
CREATE INDEX IF NOT EXISTS "agent_mission_runs_status_created_at_idx"
  ON "agent_mission_runs"("status", "created_at");

-- Workflow step runs
CREATE TABLE IF NOT EXISTS "agent_workflow_step_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "mission_run_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "job_id" TEXT,
    "source_id" TEXT,
    "scanned_content_id" TEXT,
    "finding_id" TEXT,
    "step_id" TEXT NOT NULL,
    "step_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "idempotency_key" TEXT,
    "input_ref" JSONB,
    "output" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_workflow_step_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_workflow_step_runs_mission_run_id_scanned_content_id_step_id_key"
  ON "agent_workflow_step_runs"("mission_run_id", "scanned_content_id", "step_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_workflow_step_runs_idempotency_key_key"
  ON "agent_workflow_step_runs"("idempotency_key");
CREATE INDEX IF NOT EXISTS "agent_workflow_step_runs_mission_run_id_status_idx"
  ON "agent_workflow_step_runs"("mission_run_id", "status");
CREATE INDEX IF NOT EXISTS "agent_workflow_step_runs_mission_id_created_at_idx"
  ON "agent_workflow_step_runs"("mission_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_workflow_step_runs_scanned_content_id_idx"
  ON "agent_workflow_step_runs"("scanned_content_id");
CREATE INDEX IF NOT EXISTS "agent_workflow_step_runs_job_id_idx"
  ON "agent_workflow_step_runs"("job_id");
CREATE INDEX IF NOT EXISTS "agent_workflow_step_runs_step_type_status_idx"
  ON "agent_workflow_step_runs"("step_type", "status");
CREATE INDEX IF NOT EXISTS "agent_workflow_step_runs_company_id_idx"
  ON "agent_workflow_step_runs"("company_id");
CREATE INDEX IF NOT EXISTS "agent_workflow_step_runs_status_started_at_idx"
  ON "agent_workflow_step_runs"("status", "started_at");

-- Job / Finding provenance
ALTER TABLE "agent_jobs" ADD COLUMN IF NOT EXISTS "mission_run_id" TEXT;
CREATE INDEX IF NOT EXISTS "agent_jobs_mission_run_id_status_idx" ON "agent_jobs"("mission_run_id", "status");

ALTER TABLE "agent_findings" ADD COLUMN IF NOT EXISTS "mission_run_id" TEXT;
ALTER TABLE "agent_findings" ADD COLUMN IF NOT EXISTS "workflow_step_run_id" TEXT;
CREATE INDEX IF NOT EXISTS "agent_findings_mission_run_id_idx" ON "agent_findings"("mission_run_id");

-- FKs
DO $$ BEGIN
  ALTER TABLE "agent_mission_sources"
    ADD CONSTRAINT "agent_mission_sources_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "agent_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_mission_sources"
    ADD CONSTRAINT "agent_mission_sources_source_id_fkey"
    FOREIGN KEY ("source_id") REFERENCES "agent_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_mission_runs"
    ADD CONSTRAINT "agent_mission_runs_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "agent_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_workflow_step_runs"
    ADD CONSTRAINT "agent_workflow_step_runs_mission_run_id_fkey"
    FOREIGN KEY ("mission_run_id") REFERENCES "agent_mission_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_workflow_step_runs"
    ADD CONSTRAINT "agent_workflow_step_runs_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "agent_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_workflow_step_runs"
    ADD CONSTRAINT "agent_workflow_step_runs_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "agent_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_workflow_step_runs"
    ADD CONSTRAINT "agent_workflow_step_runs_source_id_fkey"
    FOREIGN KEY ("source_id") REFERENCES "agent_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_workflow_step_runs"
    ADD CONSTRAINT "agent_workflow_step_runs_finding_id_fkey"
    FOREIGN KEY ("finding_id") REFERENCES "agent_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_jobs"
    ADD CONSTRAINT "agent_jobs_mission_run_id_fkey"
    FOREIGN KEY ("mission_run_id") REFERENCES "agent_mission_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_findings"
    ADD CONSTRAINT "agent_findings_mission_run_id_fkey"
    FOREIGN KEY ("mission_run_id") REFERENCES "agent_mission_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill mission sources from rules.sourceIds JSON
INSERT INTO "agent_mission_sources" ("id", "company_id", "mission_id", "source_id", "is_active", "created_at", "updated_at")
SELECT
  md5(m.id || ':' || src_id) AS id,
  m.company_id,
  m.id,
  src_id,
  true,
  NOW(),
  NOW()
FROM "agent_missions" m
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(COALESCE(m.rules->'sourceIds', '[]'::jsonb)) = 'array'
      THEN COALESCE(m.rules->'sourceIds', '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS src_id
WHERE src_id IS NOT NULL AND length(trim(src_id)) > 0
  AND EXISTS (SELECT 1 FROM "agent_sources" s WHERE s.id = src_id)
ON CONFLICT ("mission_id", "source_id") DO NOTHING;

-- Seed default pipeline for missions without one (legacy buyer-like flow)
UPDATE "agent_missions"
SET
  "pipeline" = COALESCE("pipeline", '{
    "version": 1,
    "steps": [
      {"id":"spam","type":"spam_filter","enabled":true,"executionTarget":"either"},
      {"id":"extract","type":"extract_structured_data","enabled":true,"dependsOn":["spam"],"executionTarget":"vps"},
      {"id":"classify","type":"classify_subject","enabled":true,"dependsOn":["extract"],"executionTarget":"vps"},
      {"id":"finding","type":"create_lead_intelligence","enabled":true,"dependsOn":["classify"],"executionTarget":"vps"},
      {"id":"notify_cms","type":"notify_cms","enabled":true,"dependsOn":["finding"],"executionTarget":"vps"},
      {"id":"telegram","type":"notify_telegram","enabled":true,"dependsOn":["finding"],"executionTarget":"vps"}
    ]
  }'::jsonb),
  "pipeline_version" = COALESCE(NULLIF("pipeline_version", 0), 1)
WHERE "pipeline" IS NULL;
