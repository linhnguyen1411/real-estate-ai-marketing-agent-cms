const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const sqlitePath = path.join(dataDir, 'cms.sqlite');
const db = new Database(sqlitePath);

const COMPANY_ID = 'comp-da-nang';
const now = new Date().toISOString();

const SAMPLE_JOBS = [
  {
    id: 'crawl-seed-mua-nha',
    source_name: 'Cần mua nhà Đà Nẵng',
    keyword: 'cần mua nhà đà nẵng',
    start_url: ''
  },
  {
    id: 'crawl-seed-ban-dat-hoa-xuan',
    source_name: 'Bán đất Hòa Xuân',
    keyword: 'bán đất hòa xuân',
    start_url: ''
  },
  {
    id: 'crawl-seed-thue-mat-bang',
    source_name: 'Cho thuê mặt bằng Đà Nẵng',
    keyword: 'cho thuê mặt bằng đà nẵng',
    start_url: ''
  },
  {
    id: 'crawl-seed-thue-kho-xuong-can',
    source_name: 'Cần thuê kho xưởng Đà Nẵng',
    keyword: 'cần thuê kho xưởng đà nẵng',
    start_url: ''
  },
  {
    id: 'crawl-seed-sang-nhuong-nha-hang',
    source_name: 'Sang nhượng nhà hàng Đà Nẵng',
    keyword: 'sang nhượng nhà hàng đà nẵng',
    start_url: ''
  },
  {
    id: 'crawl-seed-ban-dat-nam',
    source_name: 'Bán đất Nam Đà Nẵng',
    keyword: 'bán đất nam đà nẵng',
    start_url: ''
  },
  {
    id: 'crawl-seed-mua-can-ho',
    source_name: 'Mua căn hộ Đà Nẵng',
    keyword: 'mua căn hộ đà nẵng',
    start_url: ''
  },
  {
    id: 'crawl-seed-cho-thue-kho',
    source_name: 'Cho thuê kho xưởng Đà Nẵng',
    keyword: 'cho thuê kho xưởng đà nẵng',
    start_url: ''
  }
];

db.exec(`
  CREATE TABLE IF NOT EXISTS crawler_jobs (
    id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    start_url TEXT NOT NULL DEFAULT '',
    keyword TEXT NOT NULL DEFAULT '',
    run_interval_minutes INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'active',
    company_id TEXT,
    last_run_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const insert = db.prepare(`
  INSERT INTO crawler_jobs (id, source_name, start_url, keyword, run_interval_minutes, status, company_id, created_at, updated_at)
  VALUES (@id, @source_name, @start_url, @keyword, @run_interval_minutes, @status, @company_id, @created_at, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    source_name = excluded.source_name,
    start_url = excluded.start_url,
    keyword = excluded.keyword,
    run_interval_minutes = excluded.run_interval_minutes,
    status = excluded.status,
    company_id = excluded.company_id,
    updated_at = excluded.updated_at
`);

const seed = db.transaction(() => {
  SAMPLE_JOBS.forEach(job => {
    insert.run({
      ...job,
      run_interval_minutes: 120,
      status: 'active',
      company_id: COMPANY_ID,
      created_at: now,
      updated_at: now
    });
  });
});

seed();
console.log(`Seeded ${SAMPLE_JOBS.length} crawler jobs for Đà Nẵng BĐS market.`);
