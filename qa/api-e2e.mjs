import fs from 'node:fs';
import path from 'node:path';
import {
  prisma,
  BASE,
  TEST_EMAILS,
  TEST_PASSWORDS,
  SUPER_ADMIN,
  QA_PASSWORD,
  QA_NEW_PASSWORD,
  http,
  login,
  assert,
  assertEqual,
  assertStatus,
  setupTestEnv,
  restoreState,
  loadState,
  newState,
  saveState,
  resultsToMarkdown,
} from './lib.mjs';

const results = [];
const state = newState();
const ctx = {
  tokens: {},
  ids: {},
  props: {},
  wallets: {},
  passwords: {},
};

function record(id, module, priority, title, steps, expected, fn) {
  return { id, module, priority, title, steps, expected, fn };
}

async function run(testCase) {
  const startedAt = Date.now();
  try {
    const evidence = await testCase.fn();
    results.push({
      ...testCase,
      fn: undefined,
      status: 'PASS',
      evidence: typeof evidence === 'string' ? evidence : JSON.stringify(evidence ?? {}),
      durationMs: Date.now() - startedAt,
    });
    console.log(`PASS ${testCase.id} — ${testCase.title}`);
    return true;
  } catch (error) {
    results.push({
      ...testCase,
      fn: undefined,
      status: 'FAIL',
      evidence: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    console.log(`FAIL ${testCase.id} — ${testCase.title}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

const listIds = (json) => (Array.isArray(json?.data) ? json.data : json?.data?.items ?? []);
const findById = (json, id) => listIds(json).some((item) => item?.id === id);

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const cases = [];

/* ------------------------------------------------------------------ */
/* A. Health & infrastructure                                          */
/* ------------------------------------------------------------------ */
cases.push(
  record('HLT-01', 'Health', 'P0', 'Liveness endpoint không cần xác thực', 'GET /healthz', 'HTTP 200, status=ok', async () => {
    const res = await http('/healthz');
    assertStatus(res, 200);
    assertEqual(res.json?.status, 'ok', 'status');
    return `HTTP 200, uptime=${Math.round(res.json.uptime)}s`;
  }),
  record('HLT-02', 'Health', 'P0', 'Readiness kiểm tra kết nối PostgreSQL', 'GET /readyz', 'HTTP 200, database=connected', async () => {
    const res = await http('/readyz');
    assertStatus(res, 200);
    assertEqual(res.json?.status, 'ready', 'status');
    assertEqual(res.json?.database, 'connected', 'database');
    return 'HTTP 200, database connected';
  }),
  record('HLT-03', 'Health', 'P1', 'Health ẩn chi tiết scheduler khi chưa đăng nhập', 'GET /api/health (không token)', 'HTTP 200, scheduler chỉ có enabled/running', async () => {
    const res = await http('/api/health');
    assertStatus(res, 200);
    assert(res.json?.data?.scheduler?.enabled !== undefined, 'Thiếu scheduler.enabled');
    assert(res.json.data.scheduler.lastTickAt === undefined, 'Rò rỉ lastTickAt khi chưa đăng nhập');
    return 'Không lộ lastTickAt/lastError';
  }),
  record('HLT-04', 'Health', 'P1', 'Health trả chi tiết scheduler khi có token', 'GET /api/health + Bearer super admin', 'HTTP 200, có tickIntervalMs', async () => {
    const res = await http('/api/health', { token: ctx.tokens.super });
    assertStatus(res, 200);
    assert(typeof res.json?.data?.scheduler?.tickIntervalMs === 'number', 'Thiếu tickIntervalMs');
    return `tickIntervalMs=${res.json.data.scheduler.tickIntervalMs}`;
  }),
  record('HLT-05', 'Health', 'P1', 'Route /api/agent không tồn tại trả JSON 404, không trả HTML', 'GET /api/agent/route-khong-ton-tai', 'HTTP 404 + JSON status=error', async () => {
    const res = await http('/api/agent/route-khong-ton-tai', { token: ctx.tokens.super });
    assertStatus(res, 404);
    assert(res.json?.status === 'error', 'Không phải JSON lỗi');
    assert((res.headers.get('content-type') || '').includes('application/json'), 'Content-Type không phải JSON');
    return `HTTP 404 JSON: ${res.json.message.slice(0, 60)}…`;
  }),
  record('HLT-06', 'Health', 'P0', 'Manifest cập nhật desktop hợp lệ và không cache', 'GET /downloads/agent-version.json', 'HTTP 200, version/sha256/size đầy đủ, Cache-Control no-store', async () => {
    const res = await http('/downloads/agent-version.json');
    assertStatus(res, 200);
    assert(/^\d+\.\d+\.\d+$/.test(res.json?.version || ''), 'version không hợp lệ');
    assert(/^[a-f0-9]{64}$/i.test(res.json?.sha256 || ''), 'sha256 không hợp lệ');
    assert(Number(res.json?.size) > 0, 'size không hợp lệ');
    assert((res.headers.get('cache-control') || '').includes('no-store'), 'Thiếu Cache-Control no-store');
    return `version=${res.json.version}, size=${res.json.size}`;
  })
);

/* ------------------------------------------------------------------ */
/* B. Authentication                                                   */
/* ------------------------------------------------------------------ */
cases.push(
  record('AUTH-01', 'Authentication', 'P0', 'Đăng nhập Super Admin thành công', 'POST /api/auth/login admin@example.com', 'HTTP 200 + token + user không chứa hash', async () => {
    const res = await http('/api/auth/login', { method: 'POST', body: SUPER_ADMIN });
    assertStatus(res, 200);
    assert(res.json?.data?.token, 'Thiếu token');
    const raw = JSON.stringify(res.json);
    assert(!raw.includes('passwordHash') && !raw.includes('password_hash'), 'Rò rỉ hash mật khẩu');
    ctx.tokens.super = res.json.data.token;
    return `role=${res.json.data.user.role}`;
  }),
  record('AUTH-02', 'Authentication', 'P0', 'Đăng nhập quản trị công ty A thành công', 'POST /api/auth/login admin@danang.example.com', 'HTTP 200, company_id=comp-da-nang', async () => {
    const auth = await login(TEST_EMAILS.adminA, TEST_PASSWORDS.adminA);
    ctx.tokens.adminA = auth.token;
    assertEqual(auth.user.company_id, 'comp-da-nang', 'company_id');
    return `role=${auth.user.role}, company=${auth.user.company_id}`;
  }),
  record('AUTH-03', 'Authentication', 'P0', 'Sai mật khẩu bị từ chối, thông điệp không lộ tài khoản', 'POST /api/auth/login với mật khẩu sai', 'HTTP 401 + thông điệp chung', async () => {
    const res = await http('/api/auth/login', {
      method: 'POST',
      body: { email: TEST_EMAILS.adminA, password: 'SaiMatKhau!999' },
    });
    assertStatus(res, 401);
    assert(!res.json?.data?.token, 'Vẫn trả token khi sai mật khẩu');
    return `message="${res.json.message}"`;
  }),
  record('AUTH-04', 'Authentication', 'P1', 'Email không tồn tại trả cùng thông điệp với sai mật khẩu', 'POST /api/auth/login email ngẫu nhiên', 'HTTP 401, cùng message AUTH-03', async () => {
    const bad = await http('/api/auth/login', { method: 'POST', body: { email: TEST_EMAILS.adminA, password: 'SaiMatKhau!999' } });
    const missing = await http('/api/auth/login', {
      method: 'POST',
      body: { email: `khong-ton-tai-${Date.now()}@example.com`, password: QA_PASSWORD },
    });
    assertStatus(missing, 401);
    assertEqual(missing.json?.message, bad.json?.message, 'Thông điệp khác nhau (user enumeration)');
    return 'Hai trường hợp trả cùng thông điệp';
  }),
  record('AUTH-05', 'Authentication', 'P1', 'Thiếu mật khẩu trả lỗi validation 400', 'POST /api/auth/login {email}', 'HTTP 400 + issues', async () => {
    const res = await http('/api/auth/login', { method: 'POST', body: { email: TEST_EMAILS.adminA } });
    assertStatus(res, 400);
    assert(Array.isArray(res.json?.issues) && res.json.issues.length > 0, 'Thiếu issues');
    return `issues=${res.json.issues.map((i) => i.field).join(',')}`;
  }),
  record('AUTH-06', 'Authentication', 'P0', 'API bảo vệ từ chối request không có token', 'GET /api/customers không Authorization', 'HTTP 401', async () => {
    const res = await http('/api/customers');
    assertStatus(res, 401);
    return 'HTTP 401';
  }),
  record('AUTH-07', 'Authentication', 'P0', 'Token bị sửa bị từ chối', 'GET /api/auth/me với token sửa 1 ký tự', 'HTTP 401', async () => {
    const token = ctx.tokens.super;
    const tampered = `${token.slice(0, -2)}xy`;
    const res = await http('/api/auth/me', { token: tampered });
    assertStatus(res, 401);
    return 'HTTP 401';
  }),
  record('AUTH-08', 'Authentication', 'P0', '/api/auth/me trả hồ sơ + quyền hiệu lực', 'GET /api/auth/me (super admin)', 'HTTP 200, có role, permissions, roleKey, không có hash', async () => {
    const res = await http('/api/auth/me', { token: ctx.tokens.super });
    assertStatus(res, 200);
    const user = res.json?.data;
    assert(user?.id && user?.role, 'Thiếu id/role');
    assert(user?.permissions && typeof user.permissions === 'object', 'Thiếu permissions');
    assert(user?.roleKey === 'super_admin', `roleKey=${user?.roleKey}`);
    assert(!JSON.stringify(user).includes('passwordHash'), 'Rò rỉ hash');
    return `roleKey=${user.roleKey}, permissions=${Object.keys(user.permissions).length}`;
  }),
  record('AUTH-09', 'Authentication', 'P1', 'Cập nhật tên hồ sơ và đọc lại đúng', 'PUT /api/auth/profile {name}', 'HTTP 200, /me phản ánh tên mới', async () => {
    const before = await http('/api/auth/me', { token: ctx.tokens.adminA });
    ctx.props.adminAName = before.json.data.name;
    const nextName = `${before.json.data.name} QA`;
    const res = await http('/api/auth/profile', { method: 'PUT', token: ctx.tokens.adminA, body: { name: nextName } });
    assertStatus(res, 200);
    const after = await http('/api/auth/me', { token: ctx.tokens.adminA });
    assertEqual(after.json?.data?.name, nextName, 'Tên sau cập nhật');
    const revert = await http('/api/auth/profile', {
      method: 'PUT',
      token: ctx.tokens.adminA,
      body: { name: before.json.data.name },
    });
    assertStatus(revert, 200, 'khôi phục tên');
    return `name="${before.json.data.name}" → "${nextName}" → khôi phục`;
  }),
  record('AUTH-10', 'Authentication', 'P0', 'Không thể nâng quyền qua API hồ sơ (mass assignment)', 'PUT /api/auth/profile {role:"owner"}', 'HTTP 200 nhưng role không đổi', async () => {
    const res = await http('/api/auth/profile', { method: 'PUT', token: ctx.tokens.adminA, body: { role: 'owner' } });
    assertStatus(res, 200);
    const me = await http('/api/auth/me', { token: ctx.tokens.adminA });
    assertEqual(me.json?.data?.role, 'company', 'role');
    return `role vẫn là ${me.json.data.role}`;
  }),
  record('AUTH-11', 'Authentication', 'P1', 'Đăng ký mật khẩu yếu bị từ chối', 'POST /api/auth/register password ngắn', 'HTTP 400 theo chính sách mật khẩu', async () => {
    const res = await http('/api/auth/register', {
      method: 'POST',
      body: { name: 'QA Weak', email: `qa.weak.${Date.now()}@example.com`, password: '123456' },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('AUTH-12', 'Authentication', 'P1', 'Đăng ký email trùng bị từ chối', 'POST /api/auth/register email đã tồn tại', 'HTTP 400', async () => {
    const res = await http('/api/auth/register', {
      method: 'POST',
      body: { name: 'QA Duplicate', email: SUPER_ADMIN.email, password: QA_PASSWORD },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('AUTH-13', 'Authentication', 'P1', 'Đăng ký tài khoản mới và đăng nhập lại', 'POST register → login', 'HTTP 200 cả hai, role=member', async () => {
    const email = `qa.basic.${Date.now()}@example.com`;
    const reg = await http('/api/auth/register', {
      method: 'POST',
      body: { name: 'QA Basic User', email, password: QA_PASSWORD },
    });
    assertStatus(reg, 200);
    ctx.basicEmail = email;
    ctx.basicUserId = reg.json?.data?.user?.id;
    state.disposableUserEmails.push(email);
    saveState(state);
    const auth = await login(email, QA_PASSWORD);
    ctx.tokens.basic = auth.token;
    assertEqual(auth.user.role, 'member', 'role');
    return `userId=${ctx.basicUserId}`;
  }),
  record('AUTH-14', 'Authentication', 'P2', 'Đăng nhập công ty B và member A/B thành công', 'POST login 3 tài khoản', 'HTTP 200, đúng company', async () => {
    const adminB = await login(TEST_EMAILS.adminB, TEST_PASSWORDS.adminB);
    const memberA = await login(TEST_EMAILS.memberA, TEST_PASSWORDS.memberA);
    const memberB = await login(TEST_EMAILS.memberB, TEST_PASSWORDS.memberB);
    ctx.tokens.adminB = adminB.token;
    ctx.tokens.memberA = memberA.token;
    ctx.tokens.memberB = memberB.token;
    assertEqual(adminB.user.company_id, 'comp-hoi-an', 'adminB company');
    assertEqual(memberA.user.company_id, 'comp-da-nang', 'memberA company');
    assertEqual(memberB.user.company_id, 'comp-da-nang', 'memberB company');
    return 'adminB=comp-hoi-an, memberA=comp-da-nang, memberB=comp-da-nang';
  }),
  record('AUTH-15', 'Authentication', 'P0', 'Token của lần đăng nhập mới sau đổi mật khẩu phải dùng được', 'Tạo user → login → đổi mật khẩu → login lại → GET /me', 'GET /me HTTP 200', async () => {
    const email = `qa.pwchange.${Date.now()}@example.com`;
    const created = await http('/api/users', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { name: 'QA PW Change', role: 'member', company_id: 'comp-da-nang', email, password: QA_PASSWORD },
    });
    assertStatus(created, 200, 'tạo user đổi mật khẩu');
    state.disposableUserEmails.push(email);
    saveState(state);

    const first = await login(email, QA_PASSWORD);
    const changed = await http('/api/auth/profile', {
      method: 'PUT',
      token: first.token,
      body: { current_password: QA_PASSWORD, new_password: QA_NEW_PASSWORD },
    });
    assertStatus(changed, 200, 'đổi mật khẩu');

    const second = await login(email, QA_NEW_PASSWORD);
    const me = await http('/api/auth/me', { token: second.token });
    assertStatus(me, 200, 'token mới sau đổi mật khẩu');
    return `userId=${created.json?.data?.id}`;
  })
);

/* ------------------------------------------------------------------ */
/* C. RBAC                                                             */
/* ------------------------------------------------------------------ */
cases.push(
  record('RBAC-01', 'RBAC', 'P0', 'Member không được xem danh sách người dùng', 'GET /api/users (member A)', 'HTTP 403', async () => {
    const res = await http('/api/users', { token: ctx.tokens.memberA });
    assertStatus(res, 403);
    return `code=${res.json?.code ?? 'n/a'}`;
  }),
  record('RBAC-02', 'RBAC', 'P0', 'Member không được quản lý license', 'GET /api/admin/licenses (member A)', 'HTTP 403', async () => {
    const res = await http('/api/admin/licenses', { token: ctx.tokens.memberA });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('RBAC-03', 'RBAC', 'P0', 'Quản trị công ty chỉ thấy user cùng công ty', 'GET /api/users (admin A)', 'HTTP 200, toàn bộ company_id=comp-da-nang', async () => {
    const res = await http('/api/users', { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    const users = listIds(res.json);
    assert(users.length > 0, 'Danh sách rỗng');
    const foreign = users.filter((u) => u.company_id && u.company_id !== 'comp-da-nang');
    assertEqual(foreign.length, 0, 'Số user công ty khác');
    return `${users.length} user, không lẫn công ty khác`;
  }),
  record('RBAC-04', 'RBAC', 'P0', 'Quản trị công ty không được đổi cài đặt hệ thống', 'GET /api/settings (admin A)', 'HTTP 403', async () => {
    const res = await http('/api/settings', { token: ctx.tokens.adminA });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('RBAC-05', 'RBAC', 'P1', 'Super Admin đọc được cài đặt hệ thống', 'GET /api/settings (super)', 'HTTP 200', async () => {
    const res = await http('/api/settings', { token: ctx.tokens.super });
    assertStatus(res, 200);
    return 'HTTP 200';
  }),
  record('RBAC-06', 'RBAC', 'P0', 'Ma trận RBAC chỉ Super Admin xem được', 'GET /api/rbac/matrix (super vs member)', 'super 200, member 403', async () => {
    const ok = await http('/api/rbac/matrix', { token: ctx.tokens.super });
    const denied = await http('/api/rbac/matrix', { token: ctx.tokens.memberA });
    assertStatus(ok, 200);
    assertStatus(denied, 403);
    return 'super=200, member=403';
  }),
  record('RBAC-07', 'RBAC', 'P1', 'Badge điều hướng theo phạm vi công ty', 'GET /api/navigation-counts (admin A)', 'HTTP 200', async () => {
    const res = await http('/api/navigation-counts', { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    return `keys=${Object.keys(res.json?.data ?? {}).join(',')}`;
  }),
  record('RBAC-08', 'RBAC', 'P0', 'Tính năng premium chặn user không có quyền lợi', 'GET /api/customers (user mới, không entitlement)', 'HTTP 402 PREMIUM_REQUIRED', async () => {
    const res = await http('/api/customers', { token: ctx.tokens.basic });
    assertStatus(res, 402);
    assertEqual(res.json?.code, 'PREMIUM_REQUIRED', 'code');
    return 'HTTP 402 PREMIUM_REQUIRED';
  }),
  record('RBAC-09', 'RBAC', 'P1', 'Trang executive chỉ dành cho platform admin', 'GET /api/executive/snapshot (member A)', 'HTTP 403', async () => {
    const res = await http('/api/executive/snapshot', { token: ctx.tokens.memberA });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('RBAC-10', 'RBAC', 'P1', 'Entitlement mở khoá module agent cho công ty', 'GET /api/agent/sources (admin A)', 'HTTP 200', async () => {
    const res = await http('/api/agent/sources', { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    return `sources=${listIds(res.json).length}`;
  }),
  record('RBAC-11', 'RBAC', 'P2', 'Route chưa khai báo bị chặn mặc định (deny-by-default)', 'GET /api/khong-khai-bao (super)', 'HTTP 403/404 JSON', async () => {
    const res = await http('/api/khong-khai-bao', { token: ctx.tokens.super });
    assert([403, 404].includes(res.status), `HTTP ${res.status}`);
    assert(res.json?.status === 'error', 'Không phải JSON lỗi');
    return `HTTP ${res.status}`;
  })
);

/* ------------------------------------------------------------------ */
/* D. Tenant isolation                                                 */
/* ------------------------------------------------------------------ */
cases.push(
  record('TEN-01', 'Tenant isolation', 'P0', 'Khách hàng công ty A không lộ sang công ty B', 'Tạo customer A → list A/B/super', 'A thấy, B không thấy, super thấy', async () => {
    const name = unique('QA-CUST-A');
    const created = await http('/api/customers', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name, phone: '0909000001', status: 'new' },
    });
    assertStatus(created, 200);
    ctx.ids.customerA = created.json.data.id;
    assertEqual(created.json.data.company_id, 'comp-da-nang', 'company_id');
    const listA = await http('/api/customers?search=' + encodeURIComponent(name), { token: ctx.tokens.adminA });
    const listB = await http('/api/customers?search=' + encodeURIComponent(name), { token: ctx.tokens.adminB });
    const listSuper = await http('/api/customers?search=' + encodeURIComponent(name), { token: ctx.tokens.super });
    assert(findById(listA.json, ctx.ids.customerA), 'Công ty A không thấy dữ liệu của mình');
    assert(!findById(listB.json, ctx.ids.customerA), 'Công ty B thấy dữ liệu công ty A');
    assert(findById(listSuper.json, ctx.ids.customerA), 'Super admin không thấy dữ liệu');
    return `id=${ctx.ids.customerA}`;
  }),
  record('TEN-02', 'Tenant isolation', 'P0', 'Công ty B không sửa/xoá được khách hàng công ty A', 'PUT + DELETE /api/customers/:id (admin B)', 'HTTP 403 cả hai', async () => {
    const put = await http(`/api/customers/${ctx.ids.customerA}`, { method: 'PUT', token: ctx.tokens.adminB, body: { notes: 'hack' } });
    const del = await http(`/api/customers/${ctx.ids.customerA}`, { method: 'DELETE', token: ctx.tokens.adminB });
    assertStatus(put, 403, 'PUT');
    assertStatus(del, 403, 'DELETE');
    return 'PUT=403, DELETE=403';
  }),
  record('TEN-03', 'Tenant isolation', 'P0', 'Bất động sản công ty B không đọc được bởi công ty A', 'Tạo property B → GET bằng admin A', 'HTTP 403', async () => {
    const created = await http('/api/properties', {
      method: 'POST',
      token: ctx.tokens.adminB,
      body: { title: unique('QA Property B'), listing_source: 'broker', type: 'Đất nền' },
    });
    assertStatus(created, 200);
    ctx.ids.propertyB = created.json.data.id;
    assertEqual(created.json.data.company_id, 'comp-hoi-an', 'company_id');
    const res = await http(`/api/properties/${ctx.ids.propertyB}`, { token: ctx.tokens.adminA });
    assertStatus(res, 403);
    return `id=${ctx.ids.propertyB}, đọc chéo=403`;
  }),
  record('TEN-04', 'Tenant isolation', 'P0', 'Công ty A không sửa được bất động sản công ty B', 'PUT /api/properties/:id (admin A)', 'HTTP 403', async () => {
    const res = await http(`/api/properties/${ctx.ids.propertyB}`, {
      method: 'PUT',
      token: ctx.tokens.adminA,
      body: { title: 'Hacked title' },
    });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('TEN-05', 'Tenant isolation', 'P0', 'Nguồn hệ thống do Super Admin tạo hiển thị cho mọi công ty', 'Super tạo source scope=system → list admin A/B', 'A và B đều thấy, companyId=null', async () => {
    const name = unique('QA-SYS');
    const created = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { name, type: 'website', url: `https://qa.example.com/system-${Date.now()}`, scope: 'system', priority: 5 },
    });
    assertStatus(created, 200);
    ctx.ids.systemSource = created.json.data.id;
    assertEqual(created.json.data.companyId, null, 'companyId');
    const a = await http('/api/agent/sources?search=' + encodeURIComponent(name), { token: ctx.tokens.adminA });
    const b = await http('/api/agent/sources?search=' + encodeURIComponent(name), { token: ctx.tokens.adminB });
    assert(findById(a.json, ctx.ids.systemSource), 'Công ty A không thấy nguồn hệ thống');
    assert(findById(b.json, ctx.ids.systemSource), 'Công ty B không thấy nguồn hệ thống');
    return `id=${ctx.ids.systemSource} chia sẻ cho A và B`;
  }),
  record('TEN-06', 'Tenant isolation', 'P0', 'Nguồn riêng của công ty A không lộ sang công ty B', 'Admin A tạo source → list admin B', 'B không thấy, super thấy', async () => {
    const name = unique('QA-SRC-A');
    const created = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name, type: 'website', url: `https://qa.example.com/company-a-${Date.now()}`, priority: 4 },
    });
    assertStatus(created, 200);
    ctx.ids.companySourceA = created.json.data.id;
    assertEqual(created.json.data.companyId, 'comp-da-nang', 'companyId');
    const b = await http('/api/agent/sources?search=' + encodeURIComponent(name), { token: ctx.tokens.adminB });
    const sup = await http('/api/agent/sources?search=' + encodeURIComponent(name), { token: ctx.tokens.super });
    assert(!findById(b.json, ctx.ids.companySourceA), 'Công ty B thấy nguồn riêng của A');
    assert(findById(sup.json, ctx.ids.companySourceA), 'Super admin không thấy nguồn');
    return `id=${ctx.ids.companySourceA} chỉ A + super`;
  }),
  record('TEN-07', 'Tenant isolation', 'P0', 'Công ty không sửa/xoá được nguồn hệ thống', 'PATCH + DELETE source system (admin B)', 'HTTP 403 cả hai', async () => {
    const patch = await http(`/api/agent/sources/${ctx.ids.systemSource}`, {
      method: 'PATCH',
      token: ctx.tokens.adminB,
      body: { name: 'hack' },
    });
    const del = await http(`/api/agent/sources/${ctx.ids.systemSource}`, { method: 'DELETE', token: ctx.tokens.adminB });
    assertStatus(patch, 403, 'PATCH');
    assertStatus(del, 403, 'DELETE');
    return 'PATCH=403, DELETE=403';
  }),
  record('TEN-08', 'Tenant isolation', 'P0', 'Công ty B không sửa/xoá nguồn riêng của công ty A', 'PATCH + DELETE source A (admin B)', 'HTTP 403 cả hai', async () => {
    const patch = await http(`/api/agent/sources/${ctx.ids.companySourceA}`, {
      method: 'PATCH',
      token: ctx.tokens.adminB,
      body: { name: 'hack' },
    });
    const del = await http(`/api/agent/sources/${ctx.ids.companySourceA}`, { method: 'DELETE', token: ctx.tokens.adminB });
    assertStatus(patch, 403, 'PATCH');
    assertStatus(del, 403, 'DELETE');
    return 'PATCH=403, DELETE=403';
  }),
  record('TEN-09', 'Tenant isolation', 'P0', 'Bài viết công ty A không lộ sang công ty B', 'Tạo post A → list B + sửa chéo', 'B không thấy, sửa chéo 403', async () => {
    const created = await http('/api/posts', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { title: unique('QA Post A'), content: 'Nội dung QA', platform: 'facebook' },
    });
    assertStatus(created, 200);
    ctx.ids.postA = created.json.data.id;
    assertEqual(created.json.data.company_id, 'comp-da-nang', 'company_id');
    const listB = await http('/api/posts', { token: ctx.tokens.adminB });
    assert(!findById(listB.json, ctx.ids.postA), 'Công ty B thấy bài viết của A');
    const update = await http(`/api/posts/${ctx.ids.postA}`, { method: 'PUT', token: ctx.tokens.adminB, body: { content: 'hack' } });
    assertStatus(update, 403);
    return `id=${ctx.ids.postA}, B không thấy và không sửa được`;
  })
);

/* ------------------------------------------------------------------ */
/* E. Properties                                                       */
/* ------------------------------------------------------------------ */
cases.push(
  record('PRP-01', 'Properties', 'P1', 'Tạo bất động sản thiếu listing_source bị từ chối', 'POST /api/properties {title}', 'HTTP 400', async () => {
    const res = await http('/api/properties', { method: 'POST', token: ctx.tokens.adminA, body: { title: 'QA thiếu nguồn' } });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('PRP-02', 'Properties', 'P2', 'Tiêu đề quá ngắn bị từ chối', 'POST /api/properties title="AB"', 'HTTP 400', async () => {
    const res = await http('/api/properties', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { title: 'AB', listing_source: 'broker' },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('PRP-03', 'Properties', 'P0', 'Tạo bất động sản hợp lệ gắn đúng công ty', 'POST /api/properties (admin A)', 'HTTP 200, company_id=comp-da-nang', async () => {
    const res = await http('/api/properties', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: {
        title: unique('QA Property A'),
        listing_source: 'broker',
        type: 'Đất nền',
        project_name: 'Nam Hòa Xuân',
        area: 100,
        price: 2.5,
        location: 'Đà Nẵng',
      },
    });
    assertStatus(res, 200);
    ctx.ids.propertyA = res.json.data.id;
    assertEqual(res.json.data.company_id, 'comp-da-nang', 'company_id');
    return `id=${ctx.ids.propertyA}`;
  }),
  record('PRP-04', 'Properties', 'P0', 'Đọc chi tiết bất động sản cùng công ty', 'GET /api/properties/:id (admin A)', 'HTTP 200 đúng id', async () => {
    const res = await http(`/api/properties/${ctx.ids.propertyA}`, { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    assertEqual(res.json?.data?.id, ctx.ids.propertyA, 'id');
    return `title=${res.json.data.title}`;
  }),
  record('PRP-05', 'Properties', 'P1', 'Cập nhật bất động sản của chính công ty', 'PUT /api/properties/:id {price}', 'HTTP 200, giá mới', async () => {
    const res = await http(`/api/properties/${ctx.ids.propertyA}`, {
      method: 'PUT',
      token: ctx.tokens.adminA,
      body: { price: 3.1 },
    });
    assertStatus(res, 200);
    assertEqual(Number(res.json.data.price), 3.1, 'price');
    return 'price=3.1';
  }),
  record('PRP-06', 'Properties', 'P1', 'Quick-parse văn bản tin đăng', 'POST /api/properties/quick-parse', 'HTTP 200, nhận diện loại đất nền + giá', async () => {
    const res = await http('/api/properties/quick-parse', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { rawText: 'Bán lô đất Nam Hòa Xuân 100m2 giá 2 tỷ, sổ hồng riêng' },
    });
    assertStatus(res, 200);
    assert(res.json?.data?.type, 'Thiếu type');
    return `type=${res.json.data.type}, price=${res.json.data.price ?? 'n/a'}`;
  }),
  record('PRP-07', 'Properties', 'P1', 'Member tạo được bất động sản riêng', 'POST /api/properties (member A)', 'HTTP 200, company A', async () => {
    const res = await http('/api/properties', {
      method: 'POST',
      token: ctx.tokens.memberA,
      body: { title: unique('QA Member Property'), listing_source: 'owner', type: 'Căn hộ' },
    });
    assertStatus(res, 200);
    ctx.ids.memberProperty = res.json.data.id;
    assertEqual(res.json.data.company_id, 'comp-da-nang', 'company_id');
    return `id=${ctx.ids.memberProperty}`;
  }),
  record('PRP-08', 'Properties', 'P0', 'Member không sửa được bất động sản của quản trị công ty', 'PUT /api/properties/:id (member A → property admin A)', 'HTTP 403', async () => {
    const res = await http(`/api/properties/${ctx.ids.propertyA}`, {
      method: 'PUT',
      token: ctx.tokens.memberA,
      body: { title: 'Member hack' },
    });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('PRP-09', 'Properties', 'P2', 'Xoá mềm bất động sản và ẩn khỏi danh sách công khai', 'DELETE /api/properties/:id (admin A)', 'HTTP 200, sale_status=hidden', async () => {
    const res = await http(`/api/properties/${ctx.ids.propertyA}`, { method: 'DELETE', token: ctx.tokens.adminA });
    assertStatus(res, 200);
    assertEqual(res.json?.data?.sale_status, 'hidden', 'sale_status');
    return 'sale_status=hidden';
  })
);

/* ------------------------------------------------------------------ */
/* F. Customers / CRM                                                  */
/* ------------------------------------------------------------------ */
cases.push(
  record('CRM-01', 'Customers', 'P0', 'Tạo khách hàng với giá trị mặc định', 'POST /api/customers (admin A)', 'HTTP 200, lead_score=50, company A', async () => {
    const res = await http('/api/customers', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name: unique('QA Customer'), phone: '0909123456', status: 'new' },
    });
    assertStatus(res, 200);
    ctx.ids.customer = res.json.data.id;
    assertEqual(Number(res.json.data.lead_score), 50, 'lead_score');
    return `id=${ctx.ids.customer}, lead_score=50`;
  }),
  record('CRM-02', 'Customers', 'P1', 'Phân trang danh sách khách hàng', 'GET /api/customers?page=1&limit=5', 'HTTP 200, items ≤ 5 và có total', async () => {
    const res = await http('/api/customers?page=1&limit=5', { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    assert(Array.isArray(res.json?.data?.items), 'Thiếu data.items');
    assert(res.json.data.items.length <= 5, 'Vượt limit');
    const total = res.json.data.pagination?.total ?? res.json.data.total;
    assert(typeof total === 'number', 'Thiếu total');
    return `items=${res.json.data.items.length}, total=${total}`;
  }),
  record('CRM-03', 'Customers', 'P1', 'Cập nhật khách hàng và ghi chú', 'PUT /api/customers/:id', 'HTTP 200, notes mới', async () => {
    const res = await http(`/api/customers/${ctx.ids.customer}`, {
      method: 'PUT',
      token: ctx.tokens.adminA,
      body: { notes: 'QA updated notes', lead_score: 77 },
    });
    assertStatus(res, 200);
    assertEqual(res.json.data.notes, 'QA updated notes', 'notes');
    assertEqual(Number(res.json.data.lead_score), 77, 'lead_score');
    return 'notes + lead_score=77';
  }),
  record('CRM-04', 'Customers', 'P2', 'Tìm kiếm khách hàng theo tên', 'GET /api/customers?search=<unique>', 'HTTP 200, có bản ghi vừa tạo', async () => {
    const res = await http(`/api/customers?search=${encodeURIComponent('QA Customer')}`, { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    assert(listIds(res.json).length >= 1, 'Không tìm thấy');
    return `${listIds(res.json).length} kết quả`;
  }),
  record('CRM-05', 'Customers', 'P2', 'Xoá khách hàng của công ty', 'DELETE /api/customers/:id (admin A)', 'HTTP 200', async () => {
    const res = await http(`/api/customers/${ctx.ids.customer}`, { method: 'DELETE', token: ctx.tokens.adminA });
    assertStatus(res, 200);
    return 'Đã xoá';
  }),
  record('CRM-06', 'Customers', 'P1', 'XSS trong tên khách hàng được lưu an toàn phía API', 'POST /api/customers name chứa <script>', 'HTTP 200 JSON, không thực thi/dịch chuyển', async () => {
    const payload = '<script>alert(1)</script>';
    const res = await http('/api/customers', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name: `QA XSS ${payload}`, phone: '0909999999' },
    });
    assertStatus(res, 200);
    assert((res.headers.get('content-type') || '').includes('application/json'), 'Content-Type không phải JSON');
    ctx.ids.xssCustomer = res.json.data.id;
    return 'Lưu nguyên chuỗi, trả JSON';
  })
);

/* ------------------------------------------------------------------ */
/* G. Posts / Inbox / Chat                                             */
/* ------------------------------------------------------------------ */
cases.push(
  record('CNT-01', 'Content', 'P1', 'Tạo bài viết cho công ty', 'POST /api/posts (admin A)', 'HTTP 200, company A', async () => {
    const res = await http('/api/posts', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { title: unique('QA Post'), content: 'Nội dung bài viết QA', platform: 'facebook' },
    });
    assertStatus(res, 200);
    ctx.ids.post = res.json.data.id;
    assertEqual(res.json.data.company_id, 'comp-da-nang', 'company_id');
    return `id=${ctx.ids.post}`;
  }),
  record('CNT-02', 'Content', 'P1', 'Cập nhật bài viết của công ty', 'PUT /api/posts/:id', 'HTTP 200, nội dung mới', async () => {
    const res = await http(`/api/posts/${ctx.ids.post}`, {
      method: 'PUT',
      token: ctx.tokens.adminA,
      body: { content: 'Nội dung đã cập nhật QA' },
    });
    assertStatus(res, 200);
    assertEqual(res.json.data.content, 'Nội dung đã cập nhật QA', 'content');
    return 'Đã cập nhật';
  }),
  record('CNT-03', 'Content', 'P2', 'Xoá bài viết của công ty', 'DELETE /api/posts/:id', 'HTTP 200', async () => {
    const res = await http(`/api/posts/${ctx.ids.post}`, { method: 'DELETE', token: ctx.tokens.adminA });
    assertStatus(res, 200);
    return 'Đã xoá';
  }),
  record('CNT-04', 'Content', 'P1', 'Super Admin đọc hộp thư Facebook', 'GET /api/inbox', 'HTTP 200', async () => {
    const res = await http('/api/inbox', { token: ctx.tokens.super });
    assertStatus(res, 200);
    return `items=${listIds(res.json).length}`;
  }),
  record('CNT-05', 'Content', 'P1', 'Công ty có entitlement fb_inbox đọc được hộp thư', 'GET /api/inbox (admin A)', 'HTTP 200', async () => {
    const res = await http('/api/inbox', { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    return `items=${listIds(res.json).length}`;
  }),
  record('CNT-06', 'Content', 'P2', 'Lịch sử chat nội bộ tải được', 'GET /api/chat/history (super)', 'HTTP 200', async () => {
    const res = await http('/api/chat/history', { token: ctx.tokens.super });
    assertStatus(res, 200);
    return 'HTTP 200';
  }),
  record('CNT-07', 'Content', 'P2', 'Trạng thái AI khả dụng cho user đã đăng nhập', 'GET /api/ai/status', 'HTTP 200', async () => {
    const res = await http('/api/ai/status', { token: ctx.tokens.super });
    assertStatus(res, 200);
    return `provider=${res.json?.data?.provider ?? 'n/a'}`;
  })
);

/* ------------------------------------------------------------------ */
/* H. Appointments                                                     */
/* ------------------------------------------------------------------ */
cases.push(
  record('APT-01', 'Appointments', 'P1', 'Đặt lịch công khai thiếu trường bắt buộc bị từ chối', 'POST /api/public/appointments thiếu phone', 'HTTP 400', async () => {
    const res = await http('/api/public/appointments', {
      method: 'POST',
      body: { customerName: 'QA', appointmentTime: new Date(Date.now() + 86400000).toISOString() },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('APT-02', 'Appointments', 'P1', 'Đặt lịch với thời gian không hợp lệ bị từ chối', 'POST /api/public/appointments appointmentTime="abc"', 'HTTP 400', async () => {
    const res = await http('/api/public/appointments', {
      method: 'POST',
      body: { customerName: 'QA', customerPhone: '0909000111', appointmentTime: 'abc' },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('APT-03', 'Appointments', 'P0', 'Đặt lịch thành công gắn đúng công ty của bất động sản', 'POST /api/public/appointments property A', 'HTTP 201, companyId=comp-da-nang', async () => {
    const res = await http('/api/public/appointments', {
      method: 'POST',
      body: {
        customerName: unique('QA Appointment'),
        customerPhone: '0909000222',
        propertyId: ctx.ids.propertyA,
        appointmentTime: new Date(Date.now() + 2 * 86400000).toISOString(),
        notes: 'QA booking',
      },
    });
    assertStatus(res, 201);
    ctx.ids.appointment = res.json.data.id;
    assertEqual(res.json.data.companyId, 'comp-da-nang', 'companyId');
    return `id=${ctx.ids.appointment}`;
  }),
  record('APT-04', 'Appointments', 'P0', 'Lịch hẹn chỉ hiển thị trong công ty sở hữu', 'GET /api/appointments (A vs B)', 'A thấy, B không thấy', async () => {
    const a = await http('/api/appointments?search=QA Appointment', { token: ctx.tokens.adminA });
    const b = await http('/api/appointments?search=QA Appointment', { token: ctx.tokens.adminB });
    assertStatus(a, 200);
    assert(findById(a.json, ctx.ids.appointment), 'Công ty A không thấy lịch hẹn');
    assert(!findById(b.json, ctx.ids.appointment), 'Công ty B thấy lịch hẹn của A');
    return 'A thấy, B không thấy';
  }),
  record('APT-05', 'Appointments', 'P0', 'Công ty B không cập nhật lịch hẹn của công ty A', 'PATCH /api/appointments/:id (admin B)', 'HTTP 403', async () => {
    const res = await http(`/api/appointments/${ctx.ids.appointment}`, {
      method: 'PATCH',
      token: ctx.tokens.adminB,
      body: { status: 'confirmed' },
    });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('APT-06', 'Appointments', 'P1', 'Công ty A xác nhận lịch hẹn thành công', 'PATCH status=confirmed (admin A)', 'HTTP 200, status=confirmed', async () => {
    const res = await http(`/api/appointments/${ctx.ids.appointment}`, {
      method: 'PATCH',
      token: ctx.tokens.adminA,
      body: { status: 'confirmed' },
    });
    assertStatus(res, 200);
    assertEqual(res.json.data.status, 'confirmed', 'status');
    return 'confirmed';
  }),
  record('APT-07', 'Appointments', 'P2', 'Trạng thái lịch hẹn không hợp lệ bị từ chối', 'PATCH status=hacked', 'HTTP 400', async () => {
    const res = await http(`/api/appointments/${ctx.ids.appointment}`, {
      method: 'PATCH',
      token: ctx.tokens.adminA,
      body: { status: 'hacked' },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  })
);

/* ------------------------------------------------------------------ */
/* I. License & trial                                                  */
/* ------------------------------------------------------------------ */
cases.push(
  record('LIC-01', 'License', 'P0', 'Super Admin xem được toàn bộ license', 'GET /api/admin/licenses (super)', 'HTTP 200 array', async () => {
    const res = await http('/api/admin/licenses', { token: ctx.tokens.super });
    assertStatus(res, 200);
    assert(Array.isArray(res.json.data), 'data không phải mảng');
    return `keys=${res.json.data.length}`;
  }),
  record('LIC-02', 'License', 'P0', 'Quản trị công ty không xem được license toàn hệ thống', 'GET /api/admin/licenses (admin A)', 'HTTP 403', async () => {
    const res = await http('/api/admin/licenses', { token: ctx.tokens.adminA });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('LIC-03', 'License', 'P1', 'User mới chưa có key bản quyền', 'GET /api/license/my-license (user QA mới)', 'HTTP 200, hasKey=false', async () => {
    ctx.trialEmail = ctx.env.trial.email;
    ctx.trialUserId = ctx.env.trial.id;
    const auth = await login(ctx.trialEmail, QA_PASSWORD);
    ctx.tokens.trial = auth.token;
    const res = await http('/api/license/my-license', { token: ctx.tokens.trial });
    assertStatus(res, 200);
    assertEqual(res.json.data.hasKey, false, 'hasKey');
    return `hasKey=false, plan=${res.json.data.plan ?? 'n/a'}`;
  }),
  record('LIC-04', 'License', 'P0', 'Cấp trial một lần, key đúng định dạng XXXX-XXXX-XXXX-XXXX', 'POST /api/license/download-trial', 'HTTP 200, key đúng format, plan=premium_trial', async () => {
    const res = await http('/api/license/download-trial', { method: 'POST', token: ctx.tokens.trial });
    assertStatus(res, 200);
    const key = res.json?.data?.licenseKey || '';
    assert(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(key), `Key sai định dạng: ${key}`);
    ctx.licenseKey = key;
    ctx.licenseKeyId = res.json.data.licenseKeyId;
    assertEqual(res.json.data.plan, 'premium_trial', 'plan');
    assert(res.json.data.expiresAt && new Date(res.json.data.expiresAt) > new Date(), 'expiresAt không hợp lệ');
    return `key=${key.slice(0, 4)}-****-****-****, plan=premium_trial`;
  }),
  record('LIC-05', 'License', 'P0', 'Tải trial lần 2 idempotent, không cấp thêm key', 'POST download-trial lần 2', 'HTTP 200, cùng key, hasExistingKey=true, không tạo key mới', async () => {
    const before = await prisma.licenseKey.count({ where: { userId: ctx.trialUserId } });
    const res = await http('/api/license/download-trial', { method: 'POST', token: ctx.tokens.trial });
    assertStatus(res, 200);
    assertEqual(res.json?.data?.licenseKey, ctx.licenseKey, 'licenseKey');
    assertEqual(res.json?.data?.hasExistingKey, true, 'hasExistingKey');
    const after = await prisma.licenseKey.count({ where: { userId: ctx.trialUserId } });
    assertEqual(after, before, 'Số license key sau lần tải thứ 2');
    return `idempotent, keys=${after}`;
  }),
  record('LIC-06', 'License', 'P0', 'Key có thể mở lại (idempotent) và trả PEM', 'GET /api/license/my-key', 'HTTP 200, cùng key, có pem, activeDevices=0', async () => {
    const res = await http('/api/license/my-key', { token: ctx.tokens.trial });
    assertStatus(res, 200);
    assertEqual(res.json.data.licenseKey, ctx.licenseKey, 'licenseKey');
    assert(res.json.data.pem && res.json.data.pem.includes('BEGIN'), 'Thiếu PEM');
    assertEqual(res.json.data.activeDevices, 0, 'activeDevices');
    return 'Key trùng + PEM + 0 thiết bị';
  }),
  record('LIC-07', 'License', 'P1', 'Kích hoạt key sai bị từ chối', 'POST /api/license/activate invalid key', 'HTTP 400 INVALID_KEY', async () => {
    const res = await http('/api/license/activate', {
      method: 'POST',
      body: { key: 'AAAA-BBBB-CCCC-DDDD', deviceId: 'qa-device-0' },
    });
    assertStatus(res, 400);
    assertEqual(res.json?.code, 'INVALID_KEY', 'code');
    return 'HTTP 400 INVALID_KEY';
  }),
  record('LIC-08', 'License', 'P0', 'Kích hoạt thiết bị bằng key hợp lệ', 'POST /api/license/activate', 'HTTP 200, accessToken + refreshToken', async () => {
    const res = await http('/api/license/activate', {
      method: 'POST',
      body: { key: ctx.licenseKey, deviceId: 'qa-device-1', deviceName: 'QA Machine' },
    });
    assertStatus(res, 200);
    assert(res.json?.data?.accessToken && res.json.data.refreshToken, 'Thiếu token thiết bị');
    ctx.deviceAccessToken = res.json.data.accessToken;
    const my = await http('/api/license/my-license', { token: ctx.tokens.trial });
    assertEqual(my.json.data.activeDevices, 1, 'activeDevices');
    return 'Kích hoạt thành công, 1 thiết bị';
  }),
  record('LIC-09', 'License', 'P1', 'Heartbeat thiết bị hợp lệ', 'POST /api/license/heartbeat', 'HTTP 200 valid=true', async () => {
    const res = await http('/api/license/heartbeat', {
      method: 'POST',
      body: { deviceId: 'qa-device-1', token: ctx.deviceAccessToken },
    });
    assertStatus(res, 200);
    assertEqual(res.json?.valid, true, 'valid');
    return 'valid=true';
  }),
  record('LIC-10', 'License', 'P0', 'Thu hồi key chặn truy cập ngay lập tức', 'POST /api/admin/licenses/:id/revoke → my-key', 'revoke 200, my-key 403 KEY_REVOKED', async () => {
    const revoke = await http(`/api/admin/licenses/${ctx.licenseKeyId}/revoke`, {
      method: 'POST',
      token: ctx.tokens.super,
    });
    assertStatus(revoke, 200);
    const mine = await http('/api/license/my-key', { token: ctx.tokens.trial });
    assertStatus(mine, 403);
    assertEqual(mine.json?.code, 'KEY_REVOKED', 'code');
    const beat = await http('/api/license/heartbeat', {
      method: 'POST',
      body: { deviceId: 'qa-device-1', token: ctx.deviceAccessToken },
    });
    assertStatus(beat, 403, 'heartbeat sau thu hồi');
    return 'my-key=403, heartbeat=403';
  })
);

/* ------------------------------------------------------------------ */
/* J. Wallet                                                           */
/* ------------------------------------------------------------------ */
cases.push(
  record('WAL-01', 'Wallet', 'P0', 'User xem ví của mình', 'GET /api/wallet/my (admin A)', 'HTTP 200, balance, planCosts', async () => {
    const res = await http('/api/wallet/my', { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    assert(res.json?.data?.wallet, 'Thiếu wallet');
    ctx.wallets.adminA = Number(res.json.data.wallet.balance);
    assert(res.json.data.planCosts, 'Thiếu planCosts');
    return `balance=${ctx.wallets.adminA}`;
  }),
  record('WAL-02', 'Wallet', 'P0', 'Super Admin xem toàn bộ ví', 'GET /api/admin/wallets (super)', 'HTTP 200 array', async () => {
    const res = await http('/api/admin/wallets', { token: ctx.tokens.super });
    assertStatus(res, 200);
    assert(Array.isArray(res.json.data), 'data không phải mảng');
    return `wallets=${res.json.data.length}`;
  }),
  record('WAL-03', 'Wallet', 'P0', 'Quản trị công ty không xem được ví toàn hệ thống', 'GET /api/admin/wallets (admin A)', 'HTTP 403', async () => {
    const res = await http('/api/admin/wallets', { token: ctx.tokens.adminA });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('WAL-04', 'Wallet', 'P1', 'Cộng token thiếu ghi chú bị từ chối', 'POST /api/admin/wallets/deposit không note', 'HTTP 400', async () => {
    const adminA = await prisma.user.findUnique({ where: { email: TEST_EMAILS.adminA } });
    const res = await http('/api/admin/wallets/deposit', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { userId: adminA.id, amount: 10 },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('WAL-05', 'Wallet', 'P1', 'Cộng 0 token hoặc số lẻ bị từ chối', 'POST deposit amount=0 và 1.5', 'HTTP 400 cả hai', async () => {
    const adminA = await prisma.user.findUnique({ where: { email: TEST_EMAILS.adminA } });
    const zero = await http('/api/admin/wallets/deposit', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { userId: adminA.id, amount: 0, note: 'QA-zero' },
    });
    const fraction = await http('/api/admin/wallets/deposit', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { userId: adminA.id, amount: 1.5, note: 'QA-fraction' },
    });
    assertStatus(zero, 400, 'amount=0');
    assertStatus(fraction, 400, 'amount=1.5');
    return 'amount=0 → 400, amount=1.5 → 400';
  }),
  record('WAL-06', 'Wallet', 'P0', 'Trừ quá số dư bị chặn', 'POST deposit amount=-999999', 'HTTP 400, số dư không đổi', async () => {
    const adminA = await prisma.user.findUnique({ where: { email: TEST_EMAILS.adminA } });
    const res = await http('/api/admin/wallets/deposit', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { userId: adminA.id, amount: -999999, note: 'QA-overdraft' },
    });
    assertStatus(res, 400);
    const my = await http('/api/wallet/my', { token: ctx.tokens.adminA });
    assertEqual(Number(my.json.data.wallet.balance), ctx.wallets.adminA, 'balance');
    return 'HTTP 400, số dư giữ nguyên';
  }),
  record('WAL-07', 'Wallet', 'P0', 'Cộng/trừ token hợp lệ cập nhật số dư và giao dịch', 'POST deposit +100 rồi -100', 'HTTP 200, balance +100 rồi về gốc', async () => {
    const adminA = await prisma.user.findUnique({ where: { email: TEST_EMAILS.adminA } });
    const plus = await http('/api/admin/wallets/deposit', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { userId: adminA.id, amount: 100, note: 'QA-wallet-add' },
    });
    assertStatus(plus, 200);
    assertEqual(Number(plus.json.data.wallet.balance), ctx.wallets.adminA + 100, 'balance sau +100');
    const minus = await http('/api/admin/wallets/deposit', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { userId: adminA.id, amount: -100, note: 'QA-wallet-revert' },
    });
    assertStatus(minus, 200);
    assertEqual(Number(minus.json.data.wallet.balance), ctx.wallets.adminA, 'balance sau -100');
    const txs = await http(`/api/admin/wallets/${adminA.id}/transactions`, { token: ctx.tokens.super });
    assertStatus(txs, 200);
    const qaTx = (txs.json.data || []).filter((t) => String(t.note || '').startsWith('QA-wallet'));
    assert(qaTx.length >= 2, 'Thiếu lịch sử giao dịch QA');
    return `balance=${ctx.wallets.adminA}, transactions QA=${qaTx.length}`;
  }),
  record('WAL-08', 'Wallet', 'P1', 'Ví frozen chặn giao dịch', 'Đặt wallet.status=frozen → deposit', 'HTTP 400, thông báo frozen', async () => {
    const adminA = await prisma.user.findUnique({ where: { email: TEST_EMAILS.adminA } });
    await prisma.userWallet.update({ where: { userId: adminA.id }, data: { status: 'frozen' } });
    try {
      const res = await http('/api/admin/wallets/deposit', {
        method: 'POST',
        token: ctx.tokens.super,
        body: { userId: adminA.id, amount: 10, note: 'QA-frozen' },
      });
      assertStatus(res, 400);
      assert(String(res.json?.message || '').includes('frozen'), 'Thông báo không nhắc frozen');
      return 'HTTP 400, ví bị khoá';
    } finally {
      await prisma.userWallet.update({ where: { userId: adminA.id }, data: { status: 'active' } });
    }
  }),
  record('WAL-09', 'Wallet', 'P1', 'Nâng cấp license với gói không hợp lệ bị từ chối', 'POST /api/wallet/upgrade-license plan=gold', 'HTTP 400', async () => {
    const res = await http('/api/wallet/upgrade-license', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { plan: 'gold' },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('WAL-10', 'Wallet', 'P1', 'Nâng cấp license khi không đủ token bị chặn', 'POST upgrade-license plan=pro (ví 0)', 'HTTP 400, số dư không âm', async () => {
    const res = await http('/api/wallet/upgrade-license', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { plan: 'pro', periodDays: 30 },
    });
    assertStatus(res, 400);
    const wallet = await prisma.userWallet.findUnique({ where: { userId: (await prisma.user.findUnique({ where: { email: TEST_EMAILS.adminA } })).id } });
    assert(Number(wallet.balance) >= 0, 'Số dư âm');
    return `HTTP 400: ${String(res.json?.message || '').slice(0, 80)}`;
  })
);

/* ------------------------------------------------------------------ */
/* K. Agent platform & sources                                         */
/* ------------------------------------------------------------------ */
cases.push(
  record('AGT-01', 'Agent sources', 'P0', 'Super Admin xem dashboard agent', 'GET /api/agent/dashboard (super)', 'HTTP 200 object', async () => {
    const res = await http('/api/agent/dashboard', { token: ctx.tokens.super });
    assertStatus(res, 200);
    assert(res.json?.data && typeof res.json.data === 'object', 'Thiếu data');
    return `keys=${Object.keys(res.json.data).slice(0, 6).join(',')}`;
  }),
  record('AGT-02', 'Agent sources', 'P1', 'Công ty có entitlement xem dashboard agent', 'GET /api/agent/dashboard (admin A)', 'HTTP 200', async () => {
    const res = await http('/api/agent/dashboard', { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    return 'HTTP 200';
  }),
  record('AGT-03', 'Agent sources', 'P1', 'Member xem được danh sách nguồn (read-only)', 'GET /api/agent/sources (member A)', 'HTTP 200', async () => {
    const res = await http('/api/agent/sources', { token: ctx.tokens.memberA });
    assertStatus(res, 200);
    return `sources=${listIds(res.json).length}`;
  }),
  record('AGT-04', 'Agent sources', 'P1', 'Tạo nguồn thiếu tên bị từ chối', 'POST /api/agent/sources {}', 'HTTP 400', async () => {
    const res = await http('/api/agent/sources', { method: 'POST', token: ctx.tokens.adminA, body: { type: 'website', url: 'https://qa.example.com/x' } });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('AGT-05', 'Agent sources', 'P1', 'Loại nguồn không hợp lệ bị từ chối', 'POST type=twitter', 'HTTP 400', async () => {
    const res = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name: 'QA', type: 'twitter', url: 'https://qa.example.com/x' },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('AGT-06', 'Agent sources', 'P1', 'URL nguồn không hợp lệ bị từ chối', 'POST url="not-a-url"', 'HTTP 400', async () => {
    const res = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name: 'QA', type: 'website', url: 'not-a-url' },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('AGT-07', 'Agent sources', 'P2', 'Priority ngoài khoảng 1-10 bị từ chối', 'POST priority=99', 'HTTP 400', async () => {
    const res = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name: 'QA', type: 'website', url: `https://qa.example.com/p-${Date.now()}`, priority: 99 },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('AGT-08', 'Agent sources', 'P0', 'Công ty không được tạo nguồn hệ thống', 'POST scope=system (admin A)', 'HTTP 403', async () => {
    const res = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name: 'QA hack system', type: 'website', url: `https://qa.example.com/hack-${Date.now()}`, scope: 'system' },
    });
    assertStatus(res, 403);
    return 'HTTP 403';
  }),
  record('AGT-09', 'Agent sources', 'P0', 'Tạo nguồn hệ thống trùng URL bị chặn', 'POST scope=system trùng URL', 'HTTP 409', async () => {
    const existing = await prisma.agentSource.findUnique({ where: { id: ctx.ids.systemSource } });
    const res = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.super,
      body: { name: 'QA duplicate', type: 'website', url: existing.url, scope: 'system' },
    });
    assertStatus(res, 409);
    return 'HTTP 409';
  }),
  record('AGT-10', 'Agent sources', 'P1', 'Cập nhật nguồn riêng của công ty', 'PATCH /api/agent/sources/:id (admin A)', 'HTTP 200, priority mới', async () => {
    const res = await http(`/api/agent/sources/${ctx.ids.companySourceA}`, {
      method: 'PATCH',
      token: ctx.tokens.adminA,
      body: { priority: 7 },
    });
    assertStatus(res, 200);
    assertEqual(res.json.data.priority, 7, 'priority');
    return 'priority=7';
  }),
  record('AGT-11', 'Agent sources', 'P0', 'Super Admin chuyển nguồn công ty thành nguồn hệ thống', 'PATCH scope=system (super)', 'HTTP 200, companyId=null', async () => {
    const res = await http(`/api/agent/sources/${ctx.ids.companySourceA}`, {
      method: 'PATCH',
      token: ctx.tokens.super,
      body: { scope: 'system' },
    });
    assertStatus(res, 200);
    assertEqual(res.json.data.companyId, null, 'companyId');
    const b = await http(`/api/agent/sources?search=${encodeURIComponent('QA-SRC-A')}`, { token: ctx.tokens.adminB });
    assert(findById(b.json, ctx.ids.companySourceA), 'Công ty B không thấy nguồn sau khi chuyển hệ thống');
    return 'companyId=null, B đã thấy';
  }),
  record('AGT-12', 'Agent sources', 'P1', 'Enqueue quét nguồn tạo job', 'POST /api/agent/sources/:id/run (admin A)', 'HTTP 200, có job', async () => {
    const res = await http(`/api/agent/sources/${ctx.ids.companySourceA}/run`, {
      method: 'POST',
      token: ctx.tokens.super,
      body: {},
    });
    assertStatus(res, 200);
    return `job=${res.json?.data?.jobId ?? res.json?.data?.id ?? 'created'}`;
  }),
  record('AGT-13', 'Agent sources', 'P1', 'Xoá nguồn QA và dữ liệu liên quan', 'DELETE 2 nguồn QA (super)', 'HTTP 200 cả hai', async () => {
    const del1 = await http(`/api/agent/sources/${ctx.ids.companySourceA}`, { method: 'DELETE', token: ctx.tokens.super });
    const del2 = await http(`/api/agent/sources/${ctx.ids.systemSource}`, { method: 'DELETE', token: ctx.tokens.super });
    assertStatus(del1, 200, 'xoá nguồn A');
    assertStatus(del2, 200, 'xoá nguồn hệ thống');
    return 'Đã xoá 2 nguồn QA';
  }),
  record('AGT-14', 'Agent sources', 'P2', 'Giới hạn tối thiểu 5 phút giữa các lần quét', 'POST scanIntervalMinutes=1', 'HTTP 400', async () => {
    const res = await http('/api/agent/sources', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: {
        name: 'QA interval',
        type: 'website',
        url: `https://qa.example.com/interval-${Date.now()}`,
        scanIntervalMinutes: 1,
      },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  })
);

/* ------------------------------------------------------------------ */
/* L. Public site & social                                             */
/* ------------------------------------------------------------------ */
cases.push(
  record('PUB-01', 'Public site', 'P0', 'Trang chủ công khai trả dữ liệu', 'GET /api/public/homepage', 'HTTP 200, properties array', async () => {
    const res = await http('/api/public/homepage');
    assertStatus(res, 200);
    assert(Array.isArray(res.json?.data?.properties), 'Thiếu properties');
    return `properties=${res.json.data.properties.length}`;
  }),
  record('PUB-02', 'Public site', 'P0', 'Danh sách bất động sản công khai', 'GET /api/public/properties', 'HTTP 200 array, không có bất động sản hidden', async () => {
    const res = await http('/api/public/properties');
    assertStatus(res, 200);
    const hidden = (res.json.data || []).filter((p) => ['hidden', 'sold'].includes(p.sale_status));
    assertEqual(hidden.length, 0, 'Số BĐS hidden/sold bị lộ');
    return `public=${res.json.data.length}`;
  }),
  record('PUB-03', 'Public site', 'P1', 'Hồ sơ môi giới công khai', 'GET /api/public/agents', 'HTTP 200', async () => {
    const res = await http('/api/public/agents');
    assertStatus(res, 200);
    assert(Array.isArray(res.json.data), 'data không phải mảng');
    return `agents=${res.json.data.length}`;
  }),
  record('PUB-04', 'Public site', 'P2', 'SEO keywords công khai', 'GET /api/public/seo', 'HTTP 200 có keywords', async () => {
    const res = await http('/api/public/seo');
    assertStatus(res, 200);
    assert(res.json?.data?.keywords, 'Thiếu keywords');
    return 'keywords OK';
  }),
  record('PUB-05', 'Public site', 'P1', 'Form liên hệ thiếu dữ liệu bị từ chối', 'POST /api/public/contact {}', 'HTTP 400', async () => {
    const res = await http('/api/public/contact', { method: 'POST', body: {} });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('PUB-06', 'Public site', 'P1', 'robots.txt hợp lệ và trỏ sitemap', 'GET /robots.txt', 'HTTP 200, có Sitemap', async () => {
    const res = await http('/robots.txt');
    assertStatus(res, 200);
    assert(res.text.includes('Sitemap:'), 'Thiếu Sitemap');
    return 'robots.txt có Sitemap';
  }),
  record('PUB-07', 'Public site', 'P1', 'sitemap.xml trả XML', 'GET /sitemap.xml', 'HTTP 200, chứa <urlset>', async () => {
    const res = await http('/sitemap.xml');
    assertStatus(res, 200);
    assert(res.text.includes('<urlset'), 'Không phải XML sitemap');
    return `bytes=${res.text.length}`;
  }),
  record('PUB-08', 'Public site', 'P2', 'Trang chi tiết bất động sản theo slug', 'GET /bds-da-nang/:slug → canonical', 'HTTP 200', async () => {
    const list = await http('/api/public/properties');
    const property = (list.json?.data || []).find((p) => p.slug && p.id);
    assert(property, 'Không có bất động sản public để test');
    const canonicalSlug = `${property.slug}-${property.id}`;
    const res = await http(`/bds-da-nang/${encodeURIComponent(canonicalSlug)}`);
    assertStatus(res, 200);
    assert(res.text.includes('<html'), 'Không trả HTML trang chi tiết');
    return `slug=${canonicalSlug}`;
  }),
  record('PUB-09', 'Public site', 'P2', 'Short link chuyển hướng 302', 'GET /s/:slug (link đang hoạt động)', 'HTTP 302', async () => {
    const list = await http('/api/admin/short-links', { token: ctx.tokens.super });
    assertStatus(list, 200);
    const link = (Array.isArray(list.json?.data) ? list.json.data : []).find((l) => l.is_active !== false && l.slug);
    assert(link, 'Không có short link hoạt động');
    const res = await http(`/s/${link.slug}`, { redirect: 'manual' });
    assertStatus(res, 302);
    assert(res.headers.get('location'), 'Thiếu Location');
    return `/${link.slug} → ${res.headers.get('location')}`;
  })
);

/* ------------------------------------------------------------------ */
/* M. Security hardening                                               */
/* ------------------------------------------------------------------ */
cases.push(
  record('SEC-01', 'Security', 'P0', 'Header bảo mật helmet hiện diện', 'GET /api/health', 'nosniff, frame guard, CSP, referrer-policy', async () => {
    const res = await http('/api/health');
    const ct = res.headers.get('x-content-type-options');
    const frame = res.headers.get('x-frame-options');
    const csp = res.headers.get('content-security-policy');
    const ref = res.headers.get('referrer-policy');
    assert(ct === 'nosniff', `x-content-type-options=${ct}`);
    assert(frame, 'Thiếu x-frame-options');
    assert(csp, 'Thiếu CSP');
    assert(ref, 'Thiếu referrer-policy');
    return `nosniff, frame=${frame}, CSP+referrer OK`;
  }),
  record('SEC-02', 'Security', 'P1', 'JSON hỏng trả lỗi JSON 400', 'POST /api/auth/login body không phải JSON', 'HTTP 400 JSON status=error', async () => {
    const res = await http('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "admin@example.com", ',
    });
    assertStatus(res, 400);
    assert(res.json?.status === 'error', 'Không phải JSON lỗi');
    return 'HTTP 400 JSON';
  }),
  record('SEC-03', 'Security', 'P1', 'Body vượt giới hạn JSON_BODY_LIMIT bị từ chối 413', 'POST /api/customers body vượt cấu hình', 'HTTP 413', async () => {
    const rawLimit = String(process.env.JSON_BODY_LIMIT || '25mb').trim().toLowerCase();
    const match = rawLimit.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|b)?$/);
    const unit = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[match?.[2] || 'b'] || 1;
    const limitBytes = match ? Math.floor(Number(match[1]) * unit) : 25 * 1024 ** 2;
    const res = await http('/api/customers', {
      method: 'POST',
      token: ctx.tokens.adminA,
      body: { name: 'QA big', notes: 'x'.repeat(limitBytes + 1024 * 1024) },
    });
    assertStatus(res, 413);
    return `limit=${rawLimit}, HTTP 413`;
  }),
  record('SEC-04', 'Security', 'P1', 'SQL injection trong tìm kiếm không phá dữ liệu', 'GET /api/customers?search=\';DROP TABLE...', 'HTTP 200, bảng customers còn dữ liệu', async () => {
    const before = await prisma.cmsRecord.count({ where: { collection: 'customers' } });
    const res = await http(`/api/customers?search=${encodeURIComponent("';DROP TABLE cms_records;--")}`, { token: ctx.tokens.adminA });
    assertStatus(res, 200);
    const after = await prisma.cmsRecord.count({ where: { collection: 'customers' } });
    assertEqual(after, before, 'Số bản ghi thay đổi sau payload SQLi');
    return `customers=${after} nguyên vẹn`;
  }),
  record('SEC-05', 'Security', 'P0', 'Mật khẩu lưu dưới dạng hash Argon2', 'Đọc DB user admin A sau đăng nhập', 'Hash $argon2, không còn plaintext', async () => {
    const user = await prisma.user.findUnique({ where: { email: TEST_EMAILS.adminA } });
    const storedHash = user.data?.password_hash || user.passwordHash || '';
    assert(String(storedHash).startsWith('$argon2'), 'Hash không phải Argon2');
    const serialized = JSON.stringify(user.data);
    assert(!serialized.includes('"password":"admin123"'), 'Plaintext password còn trong data JSON');
    assert(user.data?.password_hash, 'Thiếu password_hash trong data JSON');
    return `hash=${String(storedHash).slice(0, 20)}…`;
  }),
  record('SEC-06', 'Security', 'P1', 'Đổi mật khẩu làm vô hiệu token cũ', 'PUT profile đổi mật khẩu → dùng token cũ', 'token cũ 401, mật khẩu mới đăng nhập được', async () => {
    const oldToken = ctx.tokens.basic;
    const res = await http('/api/auth/profile', {
      method: 'PUT',
      token: oldToken,
      body: { current_password: QA_PASSWORD, new_password: QA_NEW_PASSWORD },
    });
    assertStatus(res, 200);
    const meOld = await http('/api/auth/me', { token: oldToken });
    assertStatus(meOld, 401, 'token cũ');
    const auth = await login(ctx.basicEmail, QA_NEW_PASSWORD);
    ctx.tokens.basic = auth.token;
    return 'token cũ bị vô hiệu, mật khẩu mới OK';
  }),
  record('SEC-07', 'Security', 'P2', 'Đổi mật khẩu với mật khẩu hiện tại sai bị từ chối', 'PUT profile current_password sai', 'HTTP 400', async () => {
    const res = await http('/api/auth/profile', {
      method: 'PUT',
      token: ctx.tokens.basic,
      body: { current_password: 'SaiMatKhau!000', new_password: QA_PASSWORD },
    });
    assertStatus(res, 400);
    return res.json?.message || 'HTTP 400';
  }),
  record('SEC-08', 'Security', 'P2', 'Rate limit public API có header', 'GET /api/public/properties', 'Có header RateLimit/RateLimit-Policy', async () => {
    const res = await http('/api/public/properties');
    const remaining = res.headers.get('ratelimit-remaining') ?? res.headers.get('x-ratelimit-remaining');
    assert(remaining !== null, 'Không có header rate limit');
    return `remaining=${remaining}`;
  })
);

/* ------------------------------------------------------------------ */
/* Runner                                                             */
/* ------------------------------------------------------------------ */
async function main() {
  const previous = loadState();
  if (previous) {
    console.log('[qa] Phát hiện state lần chạy trước — khôi phục trước khi bắt đầu.');
    await restoreState(previous);
  }
  fs.rmSync(path.join(process.cwd(), 'runtime', 'qa', 'state.json'), { force: true });

  ctx.tokens.super = (await login(SUPER_ADMIN.email, SUPER_ADMIN.password)).token;
  ctx.env = await setupTestEnv(state, ctx.tokens.super);
  console.log('[qa] Đã tạo user QA tạm, cấp entitlement tạm cho user công ty.');

  for (const testCase of cases) {
    await run(testCase);
    // Persist state continuously so a crash can always be recovered.
    saveState(state);
  }

  // Cleanup API-created records best-effort.
  try {
    if (ctx.ids.customerA) await http(`/api/customers/${ctx.ids.customerA}`, { method: 'DELETE', token: ctx.tokens.super });
    if (ctx.ids.xssCustomer) await http(`/api/customers/${ctx.ids.xssCustomer}`, { method: 'DELETE', token: ctx.tokens.super });
    if (ctx.ids.memberProperty) await http(`/api/properties/${ctx.ids.memberProperty}`, { method: 'DELETE', token: ctx.tokens.super });
    if (ctx.ids.propertyB) await http(`/api/properties/${ctx.ids.propertyB}`, { method: 'DELETE', token: ctx.tokens.adminB });
    if (ctx.ids.postA) await http(`/api/posts/${ctx.ids.postA}`, { method: 'DELETE', token: ctx.tokens.super });
  } catch (error) {
    console.warn('[qa] cleanup API lỗi:', error);
  }
  const cmsIds = [ctx.ids.customerA, ctx.ids.xssCustomer, ctx.ids.propertyA, ctx.ids.propertyB, ctx.ids.memberProperty, ctx.ids.postA].filter(Boolean);
  if (cmsIds.length) {
    await prisma.cmsRecord.deleteMany({ where: { id: { in: cmsIds } } }).catch(() => {});
  }
  if (ctx.ids.appointment) {
    await prisma.viewingAppointment.deleteMany({ where: { id: ctx.ids.appointment } }).catch(() => {});
  }
  const leftoverSources = [ctx.ids.systemSource, ctx.ids.companySourceA].filter(Boolean);
  if (leftoverSources.length) {
    for (const id of leftoverSources) {
      await http(`/api/agent/sources/${id}`, { method: 'DELETE', token: ctx.tokens.super }).catch(() => {});
    }
  }
  // Remove QA wallet transactions after balance is restored.
  await prisma.walletTransaction.deleteMany({ where: { note: { startsWith: 'QA-wallet' } } }).catch(() => {});
  await prisma.walletTransaction.deleteMany({ where: { note: { startsWith: 'QA-frozen' } } }).catch(() => {});

  // Restore profile name if it was changed.
  if (ctx.props.adminAName) {
    await http('/api/auth/profile', { method: 'PUT', token: ctx.tokens.adminA, body: { name: ctx.props.adminAName } }).catch(() => {});
  }

  await restoreState(state);
  fs.rmSync(path.join(process.cwd(), 'runtime', 'qa', 'state.json'), { force: true });

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    startedAt: state.startedAt,
    finishedAt: new Date().toISOString(),
    results,
  };
  const outFile = path.join(process.cwd(), 'runtime', 'qa', 'api-results.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(process.cwd(), 'runtime', 'qa', 'api-results.md'),
    resultsToMarkdown(results),
    'utf8'
  );
  console.log(`\n[qa] Kết quả: ${summary.passed}/${summary.total} PASS, ${summary.failed} FAIL`);
  console.log(`[qa] Chi tiết: ${outFile}`);
  if (summary.failed > 0) process.exitCode = 1;
}

await main();
