const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const sqlitePath = path.join(__dirname, '..', 'data', 'cms.sqlite');
if (!fs.existsSync(sqlitePath)) {
  console.error('Missing data/cms.sqlite');
  process.exit(1);
}

const db = new Database(sqlitePath);
const now = new Date().toISOString();
let propertyUpdates = 0;

db.prepare("SELECT id, data FROM cms_records WHERE collection = 'properties'").all().forEach((row) => {
  const data = JSON.parse(row.data);
  if (data.public_view_count === undefined) {
    data.public_view_count = 0;
    db.prepare("UPDATE cms_records SET data = ?, updated_at = ? WHERE collection = 'properties' AND id = ?")
      .run(JSON.stringify(data), now, row.id);
    propertyUpdates += 1;
  }
});

const settingsRow = db.prepare("SELECT data FROM settings WHERE key = 'app'").get();
if (settingsRow) {
  const settings = JSON.parse(settingsRow.data);
  if (settings.site_view_count === undefined) {
    settings.site_view_count = 0;
    db.prepare("UPDATE settings SET data = ?, updated_at = ? WHERE key = 'app'")
      .run(JSON.stringify(settings), now);
    console.log('Initialized site_view_count = 0');
  }
}

db.close();
console.log(`Migrated ${propertyUpdates} properties with public_view_count = 0`);
