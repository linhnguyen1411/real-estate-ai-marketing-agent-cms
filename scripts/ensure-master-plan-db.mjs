#!/usr/bin/env node
/**
 * Database schema & index verification for Master Plan.
 * Safe, idempotent migration script for local & VPS Production.
 *
 * Usage:
 *   node scripts/ensure-master-plan-db.mjs
 */
import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('[db-sync] DATABASE_URL is required in .env');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL.replace(/\?.*$/, '');

async function run() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log('[db-sync] Connected to database successfully.');

  try {
    // 1. Dedicated viewing_appointments table (for direct reporting & persistence)
    console.log('[db-sync] Ensuring viewing_appointments table...');
    await client.query(`
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
    `);

    // 2. Indexes for viewing_appointments
    console.log('[db-sync] Ensuring viewing_appointments indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "viewing_appointments_status_idx" ON "viewing_appointments"("status");
      CREATE INDEX IF NOT EXISTS "viewing_appointments_appointment_time_idx" ON "viewing_appointments"("appointment_time");
      CREATE INDEX IF NOT EXISTS "viewing_appointments_customer_phone_idx" ON "viewing_appointments"("customer_phone");
    `);

    // 3. Functional indexes on agent_findings for Master Plan fields
    console.log('[db-sync] Ensuring functional indexes on agent_findings...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "agent_findings_signature_idx" 
      ON "agent_findings" (((extracted_data->>'propertySignature')))
      WHERE extracted_data->>'propertySignature' IS NOT NULL;

      CREATE INDEX IF NOT EXISTS "agent_findings_post_type_idx" 
      ON "agent_findings" (((extracted_data->>'postType')))
      WHERE extracted_data->>'postType' IS NOT NULL;
    `);

    // 4. Verification
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('viewing_appointments', 'agent_findings', 'cms_records')
      ORDER BY table_name;
    `);

    console.log('[db-sync] Verified required tables in database:', res.rows.map(r => r.table_name).join(', '));
    console.log('[db-sync] Master Plan database sync completed successfully (100% idempotent).');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('[db-sync] Error during database sync:', err);
  process.exit(1);
});
