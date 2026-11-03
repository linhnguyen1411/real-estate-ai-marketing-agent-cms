-- ==============================================================================
-- Migration: 20261103120000_viewing_appointments
-- Purpose: give viewing appointments a real relational table (was cms_records JSON
-- plus a best-effort raw INSERT into a table that did not exist).
-- Rollback note:
--   DROP TABLE IF EXISTS "viewing_appointments";
-- ==============================================================================

CREATE TABLE IF NOT EXISTS "viewing_appointments" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "customer_phone" TEXT NOT NULL,
  "property_id" TEXT,
  "property_title" TEXT,
  "appointment_time" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "assigned_staff_id" TEXT,
  "follow_up_due_at" TIMESTAMP(3),
  "follow_up_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "viewing_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "viewing_appointments_company_id_appointment_time_idx"
  ON "viewing_appointments"("company_id", "appointment_time");
CREATE INDEX IF NOT EXISTS "viewing_appointments_status_idx"
  ON "viewing_appointments"("status");
CREATE INDEX IF NOT EXISTS "viewing_appointments_assigned_staff_id_appointment_time_idx"
  ON "viewing_appointments"("assigned_staff_id", "appointment_time");

-- Backfill legacy JSON records (idempotent).
INSERT INTO "viewing_appointments" (
  "id", "company_id", "customer_name", "customer_phone", "property_id",
  "property_title", "appointment_time", "status", "notes", "assigned_staff_id",
  "follow_up_due_at", "follow_up_note", "created_at", "updated_at"
)
SELECT
  "id",
  "company_id",
  COALESCE("data"->>'customerName', ''),
  COALESCE("data"->>'customerPhone', ''),
  NULLIF("data"->>'propertyId', ''),
  NULLIF("data"->>'propertyTitle', ''),
  COALESCE(
    CASE WHEN ("data"->>'appointmentTime') ~ '^\d{4}-\d{2}-\d{2}' THEN ("data"->>'appointmentTime')::timestamp END,
    "created_at"
  ),
  COALESCE("data"->>'status', 'pending'),
  NULLIF("data"->>'notes', ''),
  NULLIF("data"->>'assignedStaffId', ''),
  CASE WHEN ("data"->>'followUpDueAt') ~ '^\d{4}-\d{2}-\d{2}' THEN ("data"->>'followUpDueAt')::timestamp END,
  NULLIF("data"->>'followUpNote', ''),
  COALESCE(
    CASE WHEN ("data"->>'createdAt') ~ '^\d{4}-\d{2}-\d{2}' THEN ("data"->>'createdAt')::timestamp END,
    "created_at"
  ),
  COALESCE(
    CASE WHEN ("data"->>'updatedAt') ~ '^\d{4}-\d{2}-\d{2}' THEN ("data"->>'updatedAt')::timestamp END,
    "updated_at"
  )
FROM "cms_records"
WHERE "collection" = 'viewing_appointments'
ON CONFLICT ("id") DO NOTHING;
