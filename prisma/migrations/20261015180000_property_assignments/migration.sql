-- Migration: 20261015180000_property_assignments
-- Phase 2: Add property_assignments table for tracking listing distribution history

CREATE TABLE IF NOT EXISTS "property_assignments" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "assigned_to" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "property_assignments_property_id_idx" ON "property_assignments"("property_id");
CREATE INDEX IF NOT EXISTS "property_assignments_assigned_to_idx" ON "property_assignments"("assigned_to");

-- Rollback Instructions:
-- DROP TABLE IF EXISTS "property_assignments";
