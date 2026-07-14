-- Sprint 8.1: draft reply queue (human approval; no auto-post)

CREATE TABLE "agent_action_proposals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "finding_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "draft_text" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "result" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_action_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_action_audit_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "proposal_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_action_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_action_proposals_company_id_idx" ON "agent_action_proposals"("company_id");
CREATE INDEX "agent_action_proposals_finding_id_status_idx" ON "agent_action_proposals"("finding_id", "status");
CREATE INDEX "agent_action_proposals_status_created_at_idx" ON "agent_action_proposals"("status", "created_at");
CREATE INDEX "agent_action_proposals_action_type_status_idx" ON "agent_action_proposals"("action_type", "status");

CREATE INDEX "agent_action_audit_logs_proposal_id_created_at_idx" ON "agent_action_audit_logs"("proposal_id", "created_at");
CREATE INDEX "agent_action_audit_logs_company_id_created_at_idx" ON "agent_action_audit_logs"("company_id", "created_at");
CREATE INDEX "agent_action_audit_logs_action_created_at_idx" ON "agent_action_audit_logs"("action", "created_at");

ALTER TABLE "agent_action_proposals" ADD CONSTRAINT "agent_action_proposals_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "agent_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_action_audit_logs" ADD CONSTRAINT "agent_action_audit_logs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "agent_action_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
