/**
 * End-to-end crawler flow test against local server (default http://localhost:3000)
 * Usage: npm run test:crawler
 * Requires dev server running: npm run dev
 */

const BASE = process.env.CRAWLER_TEST_BASE || 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || `HTTP ${res.status} ${path}`);
  }
  return json.data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  console.log(`\n=== Crawler flow test @ ${BASE} ===\n`);

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: 'owner123' })
  });
  const headers = {
    Authorization: `Bearer ${login.token}`,
    'Content-Type': 'application/json'
  };

  const testJob = await request('/api/crawler-jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source_name: 'E2E Test RSS',
      start_url: 'https://feeds.bbci.co.uk/news/rss.xml',
      keyword: 'mua nha da nang',
      run_interval_minutes: 5,
      status: 'active'
    })
  });
  assert(testJob.id, 'Tạo job mới');

  const testPreview = await request(`/api/crawler-jobs/${testJob.id}/test`, {
    method: 'POST',
    headers
  });
  assert(testPreview.dry_run === true, 'Run test dry-run');
  assert(typeof testPreview.title === 'string', 'Test preview có title');

  const customersBefore = await request('/api/customers', { headers });
  const crawlerCustomersBefore = customersBefore.filter(c => c.source === 'crawler').length;

  const run1 = await request(`/api/crawler-jobs/${testJob.id}/run`, {
    method: 'POST',
    headers
  });
  assert(run1.pages_scanned >= 0, `Chạy job lần 1 (${run1.message})`);

  const logs = await request('/api/crawler-logs', { headers });
  assert(logs.length > 0, 'Ghi log sau khi chạy');

  const results = await request(`/api/crawler-results?job_id=${testJob.id}`, { headers });
  assert(Array.isArray(results), 'Lưu crawler results');

  const customersAfter = await request('/api/customers', { headers });
  const crawlerCustomersAfter = customersAfter.filter(c => c.source === 'crawler').length;
  if (run1.new_leads > 0) {
    assert(crawlerCustomersAfter >= crawlerCustomersBefore + run1.new_leads, 'Tạo lead CRM khi có lead mới');
  } else {
    console.log('SKIP: Không có lead mới trong lần chạy 1 (có thể do nguồn test)');
  }

  const run2 = await request(`/api/crawler-jobs/${testJob.id}/run`, {
    method: 'POST',
    headers
  });
  assert(run2.duplicates > 0 || run2.new_leads === 0, `Chống trùng khi chạy lại (dup=${run2.duplicates}, new=${run2.new_leads})`);

  const paused = await request(`/api/crawler-jobs/${testJob.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ status: 'paused' })
  });
  assert(paused.status === 'paused', 'Pause job');

  const active = await request(`/api/crawler-jobs/${testJob.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ status: 'active' })
  });
  assert(active.status === 'active', 'Bật lại job');

  const health = await request('/api/crawler-health', { headers });
  assert(typeof health.active_jobs === 'number', 'Crawler health endpoint');
  assert(health.total_jobs >= 1, 'Health có tổng job');

  await request(`/api/crawler-jobs/${testJob.id}`, {
    method: 'DELETE',
    headers
  });
  assert(true, 'Xóa job test');

  console.log('\n=== Tất cả bước API pass ===');
  console.log('Lưu ý: Kiểm tra cron sau restart server thủ công — scheduler load job active khi npm run dev khởi động.\n');
}

main().catch(err => {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
});
