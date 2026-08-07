/**
 * One-off: normalize weak property titles in the JSON DB to the SEO item formula.
 * Usage: npx tsx scripts/normalize-property-titles.ts [--dry-run]
 */
import 'dotenv/config';
import { ensureDatabaseReady, readDatabase, writeDatabase } from '../server/dbHelper';
import {
  isWeakPropertyTitle,
  resolvePropertyItemTitle,
} from '../src/seo/utils/buildPropertyItemTitle';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await ensureDatabaseReady();
  const db = readDatabase();
  let changed = 0;

  for (const property of db.properties) {
    if (!isWeakPropertyTitle(property.title)) continue;
    const next = resolvePropertyItemTitle({
      title: property.title,
      type: property.type,
      project_name: property.project_name,
      location: property.location,
      selling_points: property.selling_points,
    });
    if (next === property.title) continue;
    console.log(`${property.id}: "${property.title}" → "${next}"`);
    if (!dryRun) property.title = next;
    changed += 1;
  }

  if (!dryRun && changed > 0) {
    await writeDatabase(db);
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Normalized ${changed} property title(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
