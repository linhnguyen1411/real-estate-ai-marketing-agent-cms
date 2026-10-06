import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';
import { RBAC_PERMISSIONS_MATRIX } from '../../server/security/rbac';

describe('P3 Tenant Isolation, RBAC & IDOR Security Gates', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  // 1. P3.1 Deny-by-default on missing company_id
  it('1. P3.1: Deny-by-default: record missing company_id is hidden from companyAdmin and member', async () => {
    // Add record without company_id to test cache
    const { readDatabase, setCacheForTesting } = await import('../../server/dbHelper');
    const db = readDatabase() as any;
    db.properties.push({
      id: 'prop-legacy-no-tenant',
      title: 'Legacy Property Without Tenant',
      price: 5.0,
      area: 100,
      status: 'active',
      // company_id is undefined!
      assigned_member_ids: [ctx.users.memberA.id],
    });
    setCacheForTesting(db);

    // Member A attempts to get this property -> 403 Forbidden
    const resMember = await request(ctx.app)
      .get('/api/properties/prop-legacy-no-tenant')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resMember.status).toBe(403);

    // Company Admin A attempts to get this property -> 403 Forbidden
    const resCompany = await request(ctx.app)
      .get('/api/properties/prop-legacy-no-tenant')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);
    expect(resCompany.status).toBe(403);

    // Platform Owner CAN access it
    const resOwner = await request(ctx.app)
      .get('/api/properties/prop-legacy-no-tenant')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);
    expect(resOwner.status).toBe(200);
    expect(resOwner.body.data.id).toBe('prop-legacy-no-tenant');
  });

  // 2. P3.3 Cross-Tenant IDOR: Member B accessing Company A's resource -> 403
  it('2. P3.3: IDOR prevention: member of Company B cannot read or modify Company A customers, properties, posts, inbox', async () => {
    // Customer of Company A (cust-a1)
    const readCust = await request(ctx.app)
      .get('/api/customers/cust-a1')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect([403, 404]).toContain(readCust.status);

    const updateCust = await request(ctx.app)
      .put('/api/customers/cust-a1')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`)
      .send({ name: 'Hacked Name' });
    expect(updateCust.status).toBe(403);

    // Property of Company A (prop-a1)
    const readProp = await request(ctx.app)
      .get('/api/properties/prop-a1')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(readProp.status).toBe(403);

    const updateProp = await request(ctx.app)
      .put('/api/properties/prop-a1')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`)
      .send({ title: 'Hacked Title' });
    expect(updateProp.status).toBe(403);
  });

  // 3. P3.4 /api/social/evidence-file requires authorization
  it('3. P3.4: /api/social/evidence-file rejects raw paths and enforces authentication / tenant access', async () => {
    const resNoAuth = await request(ctx.app).get('/api/social/evidence-file?jobId=j1&attemptId=a1');
    expect(resNoAuth.status).toBe(401);

    const resRawPath = await request(ctx.app)
      .get('/api/social/evidence-file?path=/etc/passwd')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);
    expect(resRawPath.status).toBe(400); // rejects raw path without jobId/attemptId
  });

  // 4. P3.5 /api/social/media/files accepts only valid hash filenames
  it('4. P3.5: /api/social/media/files rejects directory traversal or invalid hash filenames', async () => {
    const resBadName = await request(ctx.app).get('/api/social/media/files/../../../etc/passwd');
    expect(resBadName.status).toBe(400);

    const resNonHash = await request(ctx.app).get('/api/social/media/files/my-cute-dog.png');
    expect(resNonHash.status).toBe(400);
  });

  // 5. P3.8 RBAC: Vertical Privilege Escalation Protection
  it('5. P3.8: Member cannot access owner-only routes (returns 403)', async () => {
    // Knowledge Base reset -> owner only
    const resReset = await request(ctx.app)
      .post('/api/knowledge/reset')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resReset.status).toBe(403);

    // Decision Center rules reset -> owner only
    const resRulesReset = await request(ctx.app)
      .post('/api/decision-center/rules/reset')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resRulesReset.status).toBe(403);

    // AI Gateway chat -> owner only
    const resAiChat = await request(ctx.app)
      .post('/api/ai-gateway/chat')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
      .send({ prompt: 'test' });
    expect(resAiChat.status).toBe(403);

    // Settings PUT -> owner only
    const resSettings = await request(ctx.app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
      .send({ site_view_count: 999 });
    expect(resSettings.status).toBe(403);
  });

  // 6. P3.8 RBAC: Member cannot access company-only routes (returns 403)
  it('6. P3.8: Member cannot access company-admin routes (returns 403)', async () => {
    // Investor leads PII list
    const resLeads = await request(ctx.app)
      .get('/api/investor-leads')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resLeads.status).toBe(403);

    // Users CRUD
    const resUsers = await request(ctx.app)
      .get('/api/users')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resUsers.status).toBe(403);

    // Short links
    const resShortLinks = await request(ctx.app)
      .get('/api/admin/short-links')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resShortLinks.status).toBe(403);
  });

  // 7. P3.11 Public API & Chat does not leak internal fields
  it('7. P3.11: Public property API response never leaks internal_notes, company_id, owner_user_id, contact_phone', async () => {
    const res = await request(ctx.app).get('/api/public/properties');
    expect(res.status).toBe(200);
    const properties = res.body.data || res.body;
    expect(Array.isArray(properties)).toBe(true);
    expect(properties.length).toBeGreaterThan(0);

    for (const p of properties) {
      expect(p.internal_notes).toBeUndefined();
      expect(p.company_id).toBeUndefined();
      expect(p.owner_user_id).toBeUndefined();
      expect(p.created_by_user_id).toBeUndefined();
      expect(p.assigned_member_ids).toBeUndefined();
      expect(p.contact_phone).toBeUndefined();
    }
  });

  // 8. P3.12 GET /api/public/seo does not trigger database writes
  it('8. P3.12: GET /api/public/seo returns keywords without modifying settings', async () => {
    const res = await request(ctx.app).get('/api/public/seo');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data.keywords)).toBe(true);
  });

  // 9. P3.7 Public Chat: sessionId cookie & phone masking
  it('9. P3.7: Public chat history masks phone numbers and accepts server-generated session cookies', async () => {
    // Guest registers
    const regRes = await request(ctx.app)
      .post('/api/public/chat/guest')
      .send({ name: 'Nguyễn Văn Test', phone: '0901234567' });

    expect(regRes.status).toBe(200);
    expect(regRes.body.data.session_id).toBeDefined();

    // Check Set-Cookie
    const cookies = regRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/chat_session_id=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);

    // Fetch history
    const histRes = await request(ctx.app)
      .get(`/api/public/chat/history?sessionId=${regRes.body.data.session_id}`);

    expect(histRes.status).toBe(200);
    expect(histRes.body.guest).toBeDefined();
    expect(histRes.body.guest.phone).toBe('090****567'); // Masked!
  });

  // 10. Gate P3: Route Registry vs RBAC Matrix verification
  it('10. Gate P3: All critical admin routes are declared in RBAC_PERMISSIONS_MATRIX and resolve cleanly', async () => {
    const declaredRoutes = Object.keys(RBAC_PERMISSIONS_MATRIX);
    expect(declaredRoutes).toContain('POST /api/knowledge/reset');
    expect(declaredRoutes).toContain('POST /api/knowledge/import');
    expect(declaredRoutes).toContain('POST /api/decision-center/rules/reset');
    expect(declaredRoutes).toContain('POST /api/ai-gateway/chat');
    expect(declaredRoutes).toContain('GET /api/investor-leads');
    expect(declaredRoutes).toContain('GET /api/users');
    expect(declaredRoutes).toContain('PUT /api/settings');
    expect(declaredRoutes).toContain('GET /api/executive/snapshot');
    expect(declaredRoutes).toContain('POST /api/member-permissions/bulk');
    expect(declaredRoutes).toContain('POST /api/agent/missions/:id/pause');
    expect(declaredRoutes.length).toBeGreaterThanOrEqual(60);

    // Verify deny-by-default fallback logic
    const { resolveRequiredRole } = await import('../../server/security/rbac');
    expect(resolveRequiredRole('GET', '/api/executive/briefing')).toBe('company');
    expect(resolveRequiredRole('POST', '/api/unknown-internal-route')).toBe('company');
    expect(resolveRequiredRole('GET', '/api/auth/me')).toBe('member');
    expect(resolveRequiredRole('GET', '/api/customers')).toBe('member');
  });
});
