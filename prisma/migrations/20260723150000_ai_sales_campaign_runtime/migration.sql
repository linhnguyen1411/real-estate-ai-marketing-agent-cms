-- H2.1 Autonomous Campaign Engine — living campaign entity (PostgreSQL)
CREATE TABLE IF NOT EXISTS "ai_sales_campaigns" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "property_hint" TEXT NOT NULL,
    "utterance" TEXT,
    "state" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_sales_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_sales_campaigns_company_id_idx" ON "ai_sales_campaigns"("company_id");
CREATE INDEX IF NOT EXISTS "ai_sales_campaigns_status_idx" ON "ai_sales_campaigns"("status");
CREATE INDEX IF NOT EXISTS "ai_sales_campaigns_created_at_idx" ON "ai_sales_campaigns"("created_at");
