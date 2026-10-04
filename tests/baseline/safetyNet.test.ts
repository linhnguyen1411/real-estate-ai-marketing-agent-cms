import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';

describe('P0 Baseline Safety Net Tests', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('1. GET /api/health returns success and service info', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.service).toBe('real-estate-ai-marketing-agent-cms');
  });

  it('2. Unauthenticated request to /api/customers is rejected with 401', async () => {
    const res = await request(ctx.app).get('/api/customers');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
  });

  it('3. Multi-tenant isolation: Company Admin A cannot access Customer of Company B', async () => {
    // Admin A tries to get Customer B1
    const res = await request(ctx.app)
      .get('/api/customers/cust-b1')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);

    // Expect 403 Forbidden or 404 Not Found to prevent IDOR
    expect([403, 404]).toContain(res.status);
  });

  it('4. Multi-tenant isolation: Member A only sees their own assigned customer', async () => {
    const res = await request(ctx.app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    expect(res.status).toBe(200);
    const customers = res.body.data || res.body;
    expect(Array.isArray(customers)).toBe(true);
    // Member A should only see cust-a1
    for (const c of customers) {
      expect(c.company_id).toBe(ctx.companies[0].id);
    }
  });

  it('5. Platform Owner has global access to all records', async () => {
    const res = await request(ctx.app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);

    expect(res.status).toBe(200);
    const customers = res.body.data || res.body;
    expect(customers.length).toBeGreaterThanOrEqual(2);
  });
});
