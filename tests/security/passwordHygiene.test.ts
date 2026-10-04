import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../../server/modules/auth/password';
import { readDatabase } from '../../server/dbHelper';

describe('P1.3 Password Security & Credential Hygiene', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('1. Rejects weak and common passwords based on policy', () => {
    expect(validatePasswordPolicy('12345678').valid).toBe(false);
    expect(validatePasswordPolicy('1234567890').valid).toBe(false);
    expect(validatePasswordPolicy('password123').valid).toBe(false);
    expect(validatePasswordPolicy('member@alpha.vn', 'member@alpha.vn').valid).toBe(false);
    expect(validatePasswordPolicy('alpha12345678', 'member@alpha.vn').valid).toBe(false);
    expect(validatePasswordPolicy('SafePassword2026!#', 'member@alpha.vn').valid).toBe(true);
  });

  it('2. Correctly hashes and verifies password using scrypt', async () => {
    const raw = 'SuperSecurePass2026!';
    const hashed = await hashPassword(raw);
    expect(hashed.startsWith('scrypt$')).toBe(true);

    const valid = await verifyPassword(raw, hashed);
    expect(valid).toBe(true);

    const invalid = await verifyPassword('WrongPassword123', hashed);
    expect(invalid).toBe(false);
  });

  it('3. Transparently upgrades legacy plaintext password on successful login', async () => {
    // User owner in test helper initially has plaintext password 'mocked-hash-password'
    const loginRes = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'owner@bdsdanang.site', password: 'mocked-hash-password' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('success');
    expect(loginRes.body.data.token).toBeDefined();

    // Verify DB in-memory cache: password deleted, password_hash created with scrypt
    const db = readDatabase();
    const ownerUser = db.users.find(u => u.id === 'user-owner-1');
    expect(ownerUser?.password).toBeUndefined();
    expect(ownerUser?.password_hash).toBeDefined();
    expect(ownerUser?.password_hash?.startsWith('scrypt$')).toBe(true);
  });

  it('4. Case-insensitive email authentication: uppercase/lowercase both login', async () => {
    const loginRes = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'OWNER@Bdsdanang.SITE', password: 'mocked-hash-password' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('success');
  });

  it('5. Rejects wrong password with 401', async () => {
    const loginRes = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'owner@bdsdanang.site', password: 'IncorrectPassword999' });

    expect(loginRes.status).toBe(401);
  });

  it('6. Serializer ensures GET /api/users never exposes password or password_hash', async () => {
    const res = await request(ctx.app)
      .get('/api/users')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);

    expect(res.status).toBe(200);
    const users = res.body.data;
    expect(Array.isArray(users)).toBe(true);
    for (const u of users) {
      expect(u.password).toBeUndefined();
      expect(u.password_hash).toBeUndefined();
    }
  });

  it('7. Serializer ensures POST /api/users never returns password or password_hash in response', async () => {
    const res = await request(ctx.app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`)
      .send({
        name: 'New Sales Agent',
        email: 'sales-agent-new@alpha.vn',
        password: 'ValidStrongPassword123!',
        role: 'member',
        company_id: 'comp-alpha',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.password_hash).toBeUndefined();
    expect(res.body.data.email).toBe('sales-agent-new@alpha.vn');
  });
});
