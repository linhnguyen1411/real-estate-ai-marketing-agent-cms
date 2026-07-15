-- AI Scanner 2.0: spam / block / allow rules
CREATE TABLE IF NOT EXISTS "agent_spam_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "source_id" TEXT,
    "mission_id" TEXT,
    "finding_type" TEXT,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "raw_value" TEXT NOT NULL,
    "normalized_value" TEXT,
    "e164_value" TEXT,
    "pattern" TEXT,
    "label" TEXT,
    "reason" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_by" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_spam_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_spam_rules_company_id_idx" ON "agent_spam_rules"("company_id");
CREATE INDEX IF NOT EXISTS "agent_spam_rules_source_id_idx" ON "agent_spam_rules"("source_id");
CREATE INDEX IF NOT EXISTS "agent_spam_rules_type_idx" ON "agent_spam_rules"("type");
CREATE INDEX IF NOT EXISTS "agent_spam_rules_normalized_value_idx" ON "agent_spam_rules"("normalized_value");
CREATE INDEX IF NOT EXISTS "agent_spam_rules_is_active_idx" ON "agent_spam_rules"("is_active");
CREATE INDEX IF NOT EXISTS "agent_spam_rules_expires_at_idx" ON "agent_spam_rules"("expires_at");
CREATE INDEX IF NOT EXISTS "agent_spam_rules_company_id_type_is_active_idx" ON "agent_spam_rules"("company_id", "type", "is_active");
CREATE INDEX IF NOT EXISTS "agent_spam_rules_company_id_action_is_active_idx" ON "agent_spam_rules"("company_id", "action", "is_active");
