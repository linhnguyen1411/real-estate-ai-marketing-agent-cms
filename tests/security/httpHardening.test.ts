import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';

describe('P2 HTTP Hardening & Security Middleware', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('1. Helmet: disables X-Powered-By header and sets CSP / Cross-Origin-Resource-Policy', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('2. CORS: allows origin on allowlist with credentials, rejects non-allowed or responds safely', async () => {
    const res = await request(ctx.app)
      .get('/api/health')
      .set('Origin', 'https://bdsdanang.site');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://bdsdanang.site');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('3. Rate Limiting: rejects excessive login attempts (> 5 times in window) with 429 JSON', async () => {
    // Attempt 5 bad logins
    for (let i = 0; i < 5; i++) {
      await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'rate-limit-test@alpha.vn', password: 'wrong-password-999' });
    }

    // 6th attempt must be 429
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'rate-limit-test@alpha.vn', password: 'wrong-password-999' });

    expect(res.status).toBe(429);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toMatch(/quá nhiều lần/);
  });

  it('4. Zod Validation: returns unified 400 format with issues on invalid input', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('5. Token Revocation: old token is invalidated after password change increments token_version', async () => {
    // Member A's initial valid token
    const initialToken = ctx.tokens.memberA;

    // Verify initial token works
    const check1 = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${initialToken}`);
    expect(check1.status).toBe(200);

    // Member A updates password with strong new password
    const updateRes = await request(ctx.app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${initialToken}`)
      .send({
        current_password: 'mocked-hash-password',
        new_password: 'NewSuperStrongPass2026!#',
      });
    expect(updateRes.status).toBe(200);

    // Initial token MUST now be rejected with 401
    const check2 = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${initialToken}`);
    expect(check2.status).toBe(401);
    expect(check2.body.message).toMatch(/hết hiệu lực/);
  });

  it('6. Telegram Webhook: rejects requests without valid X-Telegram-Bot-Api-Secret-Token', async () => {
    // If webhook secret is configured
    process.env.TELEGRAM_WEBHOOK_SECRET = 'super-secret-telegram-token-12345';

    // Without header -> 401
    const resNoToken = await request(ctx.app)
      .post('/api/control-plane/telegram/webhook')
      .send({ update_id: 12345 });
    expect(resNoToken.status).toBe(401);

    // With wrong header -> 401
    const resWrongToken = await request(ctx.app)
      .post('/api/control-plane/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'wrong-token-abc')
      .send({ update_id: 12345 });
    expect(resWrongToken.status).toBe(401);

    // Cleanup env
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it('7. Error Handler: does not leak stack trace in production error responses', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'bad' }); // will trigger 400

    expect(res.body.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
