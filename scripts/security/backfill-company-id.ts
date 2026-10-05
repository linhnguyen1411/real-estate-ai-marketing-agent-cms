/**
 * Migration script: Backfill missing company_id on legacy records.
 * Supports --dry-run flag. Idempotent.
 * Default tenant: process.env.DEFAULT_COMPANY_ID || 'comp-da-nang'
 */

import { ensureDatabaseReady, readDatabase, writeDatabase } from '../../server/dbHelper';
import { prisma } from '../../server/prisma';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const defaultCompanyId = process.env.DEFAULT_COMPANY_ID || 'comp-da-nang';

  console.log(`[BACKFILL] Starting company_id backfill (dryRun: ${isDryRun}, defaultTenant: ${defaultCompanyId})`);

  let modifiedCount = 0;

  // 1. In-memory / cache DB collections
  try {
    await ensureDatabaseReady();
    const db = readDatabase();
    const collections: Array<'customers' | 'properties' | 'posts' | 'inbox' | 'automations'> = [
      'customers',
      'properties',
      'posts',
      'inbox',
      'automations',
    ];

    for (const col of collections) {
      const items = (db as any)[col] || [];
      let colModified = 0;
      for (const item of items) {
        if (!item.company_id) {
          colModified++;
          if (!isDryRun) {
            item.company_id = defaultCompanyId;
          }
        }
      }
      if (colModified > 0) {
        console.log(`[BACKFILL] Collection '${col}': ${colModified} records missing company_id`);
        modifiedCount += colModified;
      }
    }

    if (!isDryRun && modifiedCount > 0) {
      await writeDatabase(db);
      console.log(`[BACKFILL] In-memory cache updated and saved successfully.`);
    }
  } catch (err: any) {
    console.warn(`[BACKFILL] In-memory DB check notice:`, err.message || err);
  }

  // 2. Postgres cms_records backfill if DATABASE_URL is available
  if (process.env.DATABASE_URL) {
    try {
      const recordsWithoutCompany = await prisma.cmsRecord.count({
        where: { companyId: null },
      });
      console.log(`[BACKFILL] Postgres cms_records with company_id=null: ${recordsWithoutCompany}`);

      if (recordsWithoutCompany > 0) {
        if (!isDryRun) {
          const updateRes = await prisma.cmsRecord.updateMany({
            where: { companyId: null },
            data: { companyId: defaultCompanyId },
          });
          console.log(`[BACKFILL] Postgres cms_records updated: ${updateRes.count}`);
        } else {
          console.log(`[BACKFILL] [DRY RUN] Would update ${recordsWithoutCompany} cms_records in Postgres.`);
        }
      }
    } catch (dbErr: any) {
      console.warn(`[BACKFILL] Postgres backfill note: ${dbErr.message || dbErr}`);
    }
  }

  console.log(`[BACKFILL] Completed. Total items identified/updated: ${modifiedCount}`);
}

main().catch(err => {
  console.error('[BACKFILL] Error:', err);
  process.exit(1);
});
