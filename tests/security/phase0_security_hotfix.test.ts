import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';
import { hashPassword, verifyPassword } from '../../server/modules/auth/password';
import { readDatabase, upsertUser, upsertCmsRecord } from '../../server/dbHelper';
import { validateEnv } from '../../server/config/env';
import type { Property, User } from '../../src/types';

describe('PHASE 0: Security Hotfix Verification Suite', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  // 1. Hash mật khẩu argon2id & migrate
  describe('1. Password Hashing (Argon2id) & Transparent Migration', () => {
    it('generates $argon2id$ hash and successfully verifies', async () => {
      const raw = 'StrongSecret2026!@#';
      const hash = await hashPassword(raw);
      expect(hash.startsWith('$argon2id$')).toBe(true);

      const isValid = await verifyPassword(raw, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('WrongSecret2026', hash);
      expect(isInvalid).toBe(false);
    });

    it('transparently upgrades plaintext password to argon2id on successful login and deletes plaintext', async () => {
      const db = readDatabase();
      const testUser: User = {
        id: 'user-plaintext-1',
        name: 'Plaintext User',
        email: 'plaintext@test.vn',
        password: 'LegacyPlaintextPass123!',
        role: 'member',
        status: 'active',
        created_at: new Date().toISOString(),
      };
      await upsertUser(testUser);

      // Verify user has plaintext password initially
      let userInDb = readDatabase().users.find((u) => u.id === 'user-plaintext-1');
      expect(userInDb?.password).toBe('LegacyPlaintextPass123!');
      expect(userInDb?.password_hash).toBeUndefined();

      // Login
      const res = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'plaintext@test.vn', password: 'LegacyPlaintextPass123!' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify DB state: password removed, password_hash created with argon2id
      userInDb = readDatabase().users.find((u) => u.id === 'user-plaintext-1');
      expect(userInDb?.password).toBeUndefined();
      expect(userInDb?.password_hash).toBeDefined();
      expect(userInDb?.password_hash?.startsWith('$argon2id$')).toBe(true);

      // Verify newly generated argon2id hash works
      const canVerify = await verifyPassword('LegacyPlaintextPass123!', userInDb!.password_hash!);
      expect(canVerify).toBe(true);
    });
  });

  // 2. toSafeUser() whitelist dùng cho MỌI response user
  describe('2. User Whitelist Protection (toSafeUser)', () => {
    it('ensures GET /api/users never returns password or password_hash', async () => {
      const res = await request(ctx.app)
        .get('/api/users')
        .set('Authorization', `Bearer ${ctx.tokens.owner}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const user of res.body.data) {
        expect(user.password).toBeUndefined();
        expect(user.password_hash).toBeUndefined();
        expect(user.id).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.role).toBeDefined();
      }
    });

    it('ensures POST /api/users never returns password or password_hash', async () => {
      const res = await request(ctx.app)
        .post('/api/users')
        .set('Authorization', `Bearer ${ctx.tokens.owner}`)
        .send({
          name: 'New Safe User',
          email: 'safeuser@bdsdanang.site',
          password: 'SafePassword2026!#',
          role: 'member',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.password_hash).toBeUndefined();
    });

    it('ensures PUT /api/users/:id never returns password or password_hash', async () => {
      const res = await request(ctx.app)
        .put(`/api/users/${ctx.users.memberA.id}`)
        .set('Authorization', `Bearer ${ctx.tokens.owner}`)
        .send({
          name: 'Updated Safe Name',
          email: ctx.users.memberA.email,
          password: 'NewPassword2026!#',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.password_hash).toBeUndefined();
    });

    it('ensures GET /api/auth/me never returns password or password_hash', async () => {
      const res = await request(ctx.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.password_hash).toBeUndefined();
    });
  });

  // 3. Environment Secrets Validation in Production
  describe('3. Production Environment Secret Enforcement', () => {
    it('throws error in production when AUTH_SECRET is missing or < 32 chars', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://localhost:5432/mydb',
          AUTH_SECRET: 'too-short-secret',
          TOKEN_ENCRYPTION_KEY: '12345678901234567890123456789012',
          AGENT_RUNTIME_TOKEN: '12345678901234567890123456789012',
        });
      }).toThrow(/AUTH_SECRET/);
    });

    it('throws error in production when AGENT_RUNTIME_TOKEN is missing or < 32 chars', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://localhost:5432/mydb',
          AUTH_SECRET: '12345678901234567890123456789012',
          TOKEN_ENCRYPTION_KEY: '12345678901234567890123456789012',
          AGENT_RUNTIME_TOKEN: 'short-agent-token',
        });
      }).toThrow(/AGENT_RUNTIME_TOKEN/);
    });
  });

  // 4. Token Revocation on Security Changes (token_version)
  describe('4. Token Version Invalidation on Password or Role Change', () => {
    it('revokes previous token when password is changed', async () => {
      // 1. Initial request with current token succeeds
      const check1 = await request(ctx.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
      expect(check1.status).toBe(200);

      // 2. Change password via profile update
      const updateRes = await request(ctx.app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
        .send({
          name: ctx.users.memberA.name,
          email: ctx.users.memberA.email,
          current_password: 'mocked-hash-password',
          new_password: 'BrandNewPassword2026!#',
        });
      expect(updateRes.status).toBe(200);

      // 3. Old token must now be rejected (401)
      const check2 = await request(ctx.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
      expect(check2.status).toBe(401);
      expect(check2.body.message).toContain('hết hiệu lực');
    });

    it('revokes member token when admin changes their role or status', async () => {
      // 1. Initial request with member token succeeds
      const check1 = await request(ctx.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
      expect(check1.status).toBe(200);

      // 2. Owner changes memberB status to inactive or changes role
      const updateRes = await request(ctx.app)
        .put(`/api/users/${ctx.users.memberB.id}`)
        .set('Authorization', `Bearer ${ctx.tokens.owner}`)
        .send({
          name: ctx.users.memberB.name,
          email: ctx.users.memberB.email,
          status: 'inactive',
        });
      expect(updateRes.status).toBe(200);

      // 3. MemberB token must now be rejected (401)
      const check2 = await request(ctx.app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
      expect(check2.status).toBe(401);
    });
  });

  // 5. Property Ownership Enforcement (accessDefaults & propertiesRoutes)
  describe('5. Property Ownership Protection (No Mass-Assignment)', () => {
    it('prevents member from claiming property for another owner upon creation', async () => {
      const res = await request(ctx.app)
        .post('/api/properties')
        .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
        .send({
          title: 'Đất Nền Hòa Xuân Cẩm Lệ',
          type: 'Đất nền',
          area: 100,
          price: 3.5,
          location: 'Cẩm Lệ, Đà Nẵng',
          listing_source: 'broker',
          owner_user_id: 'user-owner-1', // Attempt to spoof ownership to platform owner
          created_by_user_id: 'user-owner-1',
          company_id: 'comp-beta', // Attempt to spoof company
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();

      // Server MUST ignore spoofed values and enforce authenticated member's identity
      expect(res.body.data.owner_user_id).toBe(ctx.users.memberA.id);
      expect(res.body.data.created_by_user_id).toBe(ctx.users.memberA.id);
      expect(res.body.data.company_id).toBe(ctx.users.memberA.company_id);
    });

    it('prevents member from transferring property ownership via PUT /api/properties/:id', async () => {
      // 1. Create a property owned by memberA
      const propId = 'prop-test-member-1';
      const initialProp: any = {
        id: propId,
        title: 'Nhà phố 3 tầng Cẩm Lệ',
        type: 'Nhà Phố',
        area: 90,
        price: 4.2,
        location: 'Đà Nẵng',
        legal_status: 'Sổ hồng riêng',
        direction: 'Đông',
        road_width: 7.5,
        description: 'Mô tả nhà phố',
        images: 'https://example.com/img.jpg',
        selling_points: ['Vị trí đẹp'],
        owner_user_id: ctx.users.memberA.id,
        created_by_user_id: ctx.users.memberA.id,
        company_id: ctx.users.memberA.company_id,
        assigned_member_ids: [ctx.users.memberA.id],
        sale_status: 'available',
        slug: 'nha-pho-3-tang-cam-le-prop1',
      };
      await upsertCmsRecord('properties', initialProp);

      // 2. MemberA tries to update the property and set owner_user_id to companyAdminA
      const updateRes = await request(ctx.app)
        .put(`/api/properties/${propId}`)
        .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
        .send({
          title: 'Nhà phố 3 tầng Cẩm Lệ Cập Nhật',
          owner_user_id: ctx.users.companyAdminA.id, // Tampering attempt
          created_by_user_id: ctx.users.companyAdminA.id,
        });

      expect(updateRes.status).toBe(200);

      // Owner and created_by MUST remain memberA
      expect(updateRes.body.data.owner_user_id).toBe(ctx.users.memberA.id);
      expect(updateRes.body.data.created_by_user_id).toBe(ctx.users.memberA.id);
    });

    it('allows Super Admin (owner) to reassign property owner via PUT', async () => {
      // 1. Create property owned by memberA
      const propId = 'prop-superadmin-transfer';
      const initialProp: any = {
        id: propId,
        title: 'Biệt thự ven sông',
        type: 'Biệt thự',
        area: 250,
        price: 15,
        location: 'Ngũ Hành Sơn',
        legal_status: 'Sổ hồng riêng',
        direction: 'Đông Nam',
        road_width: 10.5,
        description: 'Mô tả biệt thự',
        images: 'https://example.com/img.jpg',
        selling_points: ['Ven sông mát mẻ'],
        owner_user_id: ctx.users.memberA.id,
        created_by_user_id: ctx.users.memberA.id,
        company_id: ctx.users.memberA.company_id,
        sale_status: 'available',
        slug: 'biet-thu-ven-song-superadmin-transfer',
      };
      await upsertCmsRecord('properties', initialProp);

      // 2. Super Admin reassigns ownership to companyAdminA
      const updateRes = await request(ctx.app)
        .put(`/api/properties/${propId}`)
        .set('Authorization', `Bearer ${ctx.tokens.owner}`)
        .send({
          owner_user_id: ctx.users.companyAdminA.id,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.owner_user_id).toBe(ctx.users.companyAdminA.id);
      // created_by_user_id remains original creator (memberA)
      expect(updateRes.body.data.created_by_user_id).toBe(ctx.users.memberA.id);
    });
  });
});
