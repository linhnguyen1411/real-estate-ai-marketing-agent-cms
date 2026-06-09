import Database from 'better-sqlite3';

const db = new Database('data/cms.sqlite');
const settingsRow = db.prepare("SELECT data FROM settings WHERE key = 'app'").get();
const settings = settingsRow ? JSON.parse(settingsRow.data) : {};
console.log('seo_keywords count:', (settings.seo_keywords || []).length);
console.log('seo_keywords:', (settings.seo_keywords || []).join(', '));

const props = db.prepare("SELECT data FROM cms_records WHERE collection = 'properties'").all();
for (const row of props) {
  const p = JSON.parse(row.data);
  const tags = p.ai_posts?.seo?.hashtags || [];
  if (tags.length || /#\w/.test(p.rich_description || '')) {
    console.log(`- ${p.id}: ${p.title}`);
    console.log(`  hashtags: ${tags.join(', ') || '(none parsed)'}`);
    console.log(`  rich_has_hash: ${/#\S/.test(p.rich_description || '')}`);
  }
}
