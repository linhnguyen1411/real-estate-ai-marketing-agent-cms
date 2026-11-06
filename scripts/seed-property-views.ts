/**
 * Seed plausible public view counts for property listings.
 *
 * Counts are deterministic per property id (1..5000, weighted toward the low
 * thousands), so re-runs are stable and never lower a count that real traffic
 * already produced. Stored in `public_view_count` exactly like real views.
 *
 * Usage:
 *   npx tsx scripts/seed-property-views.ts [--dry-run]
 */

import { ensureDatabaseReady, getProperties, updateProperty } from '../server/dbHelper';

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededViews(id: string): number {
  const r = fnv1a(`views:${id}`) / 0xffffffff;
  if (r < 0.15) return 20 + Math.round((r / 0.15) * 280); // 20–300
  if (r < 0.7) return 300 + Math.round(((r - 0.15) / 0.55) * 1500); // 300–1800
  if (r < 0.95) return 1800 + Math.round(((r - 0.7) / 0.25) * 1700); // 1800–3500
  return 3500 + Math.round(((r - 0.95) / 0.05) * 1400); // 3500–4900
}

function seededLastView(id: string): string {
  const days = 2 + (fnv1a(`last:${id}`) % 40);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await ensureDatabaseReady();

  const properties = getProperties();
  let seeded = 0;
  let kept = 0;

  for (const property of properties) {
    const current = Number(property.public_view_count || 0);
    const target = seededViews(property.id);
    if (current >= target) {
      kept += 1;
      continue;
    }

    console.log(`[SEED-VIEWS] ${property.id}: ${current} -> ${target}${dryRun ? ' (dry-run)' : ''}`);
    if (!dryRun) {
      await updateProperty(property.id, {
        public_view_count: target,
        last_public_view_at: seededLastView(property.id),
      });
    }
    seeded += 1;
  }

  console.log(`[SEED-VIEWS] total=${properties.length} seeded=${seeded} kept=${kept}${dryRun ? ' dryRun' : ''}`);
  process.exit(0);
}

main().catch(error => {
  console.error('[SEED-VIEWS] failed:', error?.message || error);
  process.exit(1);
});
