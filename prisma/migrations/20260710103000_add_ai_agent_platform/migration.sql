-- CreateTable
CREATE TABLE "agent_sources" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "scan_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "config" JSONB NOT NULL DEFAULT '{}',
    "checkpoint" JSONB,
    "last_scanned_at" TIMESTAMP(3),
    "next_scan_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_missions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "owner_user_id" TEXT,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "schedule" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "mission_id" TEXT,
    "source_id" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "worker_id" TEXT,
    "profile_path" TEXT NOT NULL,
    "current_url" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "last_error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanned_contents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "source_id" TEXT NOT NULL,
    "external_id" TEXT,
    "canonical_url" TEXT NOT NULL,
    "author_name" TEXT,
    "author_url" TEXT,
    "content_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'collected',
    "raw_data" JSONB,
    "metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanned_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_findings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "mission_id" TEXT,
    "source_id" TEXT NOT NULL,
    "scanned_content_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "extracted_data" JSONB NOT NULL DEFAULT '{}',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'new',
    "promoted_lead_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_notifications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT,
    "finding_id" TEXT,
    "type" TEXT NOT NULL,
    "event_key" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT NOT NULL DEFAULT 'unread',
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "agent_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_sources_company_id_idx" ON "agent_sources"("company_id");

-- CreateIndex
CREATE INDEX "agent_sources_status_next_scan_at_idx" ON "agent_sources"("status", "next_scan_at");

-- CreateIndex
CREATE INDEX "agent_sources_priority_idx" ON "agent_sources"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sources_company_id_url_key" ON "agent_sources"("company_id", "url");

-- CreateIndex
CREATE INDEX "agent_missions_company_id_idx" ON "agent_missions"("company_id");

-- CreateIndex
CREATE INDEX "agent_missions_owner_user_id_idx" ON "agent_missions"("owner_user_id");

-- CreateIndex
CREATE INDEX "agent_missions_status_idx" ON "agent_missions"("status");

-- CreateIndex
CREATE INDEX "agent_jobs_status_available_at_priority_idx" ON "agent_jobs"("status", "available_at", "priority");

-- CreateIndex
CREATE INDEX "agent_jobs_source_id_status_idx" ON "agent_jobs"("source_id", "status");

-- CreateIndex
CREATE INDEX "agent_jobs_mission_id_status_idx" ON "agent_jobs"("mission_id", "status");

-- CreateIndex
CREATE INDEX "agent_jobs_claimed_by_idx" ON "agent_jobs"("claimed_by");

-- CreateIndex
CREATE INDEX "agent_jobs_company_id_idx" ON "agent_jobs"("company_id");

-- CreateIndex
CREATE INDEX "browser_sessions_company_id_idx" ON "browser_sessions"("company_id");

-- CreateIndex
CREATE INDEX "browser_sessions_worker_id_idx" ON "browser_sessions"("worker_id");

-- CreateIndex
CREATE INDEX "browser_sessions_status_idx" ON "browser_sessions"("status");

-- CreateIndex
CREATE INDEX "browser_sessions_last_heartbeat_at_idx" ON "browser_sessions"("last_heartbeat_at");

-- CreateIndex
CREATE INDEX "scanned_contents_source_id_published_at_idx" ON "scanned_contents"("source_id", "published_at");

-- CreateIndex
CREATE INDEX "scanned_contents_source_id_external_id_idx" ON "scanned_contents"("source_id", "external_id");

-- CreateIndex
CREATE INDEX "scanned_contents_status_collected_at_idx" ON "scanned_contents"("status", "collected_at");

-- CreateIndex
CREATE INDEX "scanned_contents_company_id_idx" ON "scanned_contents"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "scanned_contents_source_id_content_hash_key" ON "scanned_contents"("source_id", "content_hash");

-- CreateIndex
CREATE INDEX "agent_findings_company_id_idx" ON "agent_findings"("company_id");

-- CreateIndex
CREATE INDEX "agent_findings_status_score_idx" ON "agent_findings"("status", "score");

-- CreateIndex
CREATE INDEX "agent_findings_source_id_created_at_idx" ON "agent_findings"("source_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_findings_mission_id_created_at_idx" ON "agent_findings"("mission_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_findings_promoted_lead_id_idx" ON "agent_findings"("promoted_lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_findings_scanned_content_id_type_key" ON "agent_findings"("scanned_content_id", "type");

-- CreateIndex
CREATE INDEX "agent_notifications_company_id_idx" ON "agent_notifications"("company_id");

-- CreateIndex
CREATE INDEX "agent_notifications_user_id_status_created_at_idx" ON "agent_notifications"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "agent_notifications_finding_id_idx" ON "agent_notifications"("finding_id");

-- CreateIndex
CREATE INDEX "agent_notifications_event_key_idx" ON "agent_notifications"("event_key");

-- CreateIndex
CREATE INDEX "agent_notifications_status_created_at_idx" ON "agent_notifications"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_notifications_company_id_event_key_key" ON "agent_notifications"("company_id", "event_key");

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "agent_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "agent_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanned_contents" ADD CONSTRAINT "scanned_contents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "agent_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "agent_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "agent_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_scanned_content_id_fkey" FOREIGN KEY ("scanned_content_id") REFERENCES "scanned_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_notifications" ADD CONSTRAINT "agent_notifications_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "agent_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
