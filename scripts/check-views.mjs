import Database from 'better-sqlite3';

const db = new Database('data/cms.sqlite');
const props = db.prepare("SELECT id, data FROM cms_records WHERE collection = 'properties'").all();
console.log('Properties:');
props.forEach((row) => {
  const d = JSON.parse(row.data);
  console.log(`  ${row.id}: views=${d.public_view_count ?? 'undefined'}`);
});
const settings = db.prepare("SELECT data FROM settings WHERE key = 'app'").get();
if (settings) {
  const s = JSON.parse(settings.data);
  console.log('site_view_count:', s.site_view_count ?? 'undefined');
}
