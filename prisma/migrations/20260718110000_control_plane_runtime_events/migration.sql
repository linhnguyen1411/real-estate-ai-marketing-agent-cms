-- Control Plane runtime event bus
CREATE TABLE IF NOT EXISTS "agent_runtime_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "type" TEXT NOT NULL,
    "agent_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_runtime_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_runtime_events_type_created_at_idx" ON "agent_runtime_events"("type", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runtime_events_agent_id_created_at_idx" ON "agent_runtime_events"("agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runtime_events_company_id_created_at_idx" ON "agent_runtime_events"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runtime_events_created_at_idx" ON "agent_runtime_events"("created_at");
