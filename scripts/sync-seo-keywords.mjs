import Database from 'better-sqlite3';
import { collectSiteSeoKeywords, getPropertyContentForHashtags, mergePostHashtags } from '../src/utils/hashtags.ts';

const DEFAULT_SEO_KEYWORDS = [
  'bất động sản sun group đà nẵng',
  'căn hộ cao cấp đà nẵng',
  'bất động sản nam đà nẵng',
  'shophouse kinh doanh đà nẵng',
  'giá đất đà nẵng 2026'
];

const db = new Database('data/cms.sqlite');
const rows = db.prepare("SELECT id, data FROM cms_records WHERE collection = 'properties'").all();
const now = new Date().toISOString();
const updateStmt = db.prepare(`
  UPDATE cms_records SET data = ?, updated_at = ? WHERE collection = 'properties' AND id = ?
`);

const properties = rows.map(row => JSON.parse(row.data));
let updated = 0;

for (const property of properties) {
  const contentText = getPropertyContentForHashtags(property);
  const { hashtags, keywords } = mergePostHashtags(contentText);
  if (!hashtags.length) continue;

  const baseSeo = property.ai_posts?.seo || { title: '', meta_description: '', keywords: [], hashtags: [] };
  const next = {
    ...property,
    ai_posts: {
      ...(property.ai_posts || {}),
      seo: {
        ...baseSeo,
        keywords,
        hashtags
      }
    }
  };
  updateStmt.run(JSON.stringify(next), now, property.id);
  updated += 1;
  console.log(`Updated ${property.id}: ${hashtags.join(' ')}`);
}

const keywords = collectSiteSeoKeywords(properties, DEFAULT_SEO_KEYWORDS);
const settingsRow = db.prepare("SELECT data FROM settings WHERE key = 'app'").get();
const settings = settingsRow ? JSON.parse(settingsRow.data) : {};
settings.seo_keywords = keywords;
db.prepare(`
  INSERT INTO settings (key, data, updated_at) VALUES ('app', ?, ?)
  ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`).run(JSON.stringify(settings), now);

console.log(`Synced ${updated} properties with hashtags`);
console.log(`seo_keywords (${keywords.length}): ${keywords.join(', ')}`);
