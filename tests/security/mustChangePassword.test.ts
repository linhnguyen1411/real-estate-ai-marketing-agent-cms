import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/bootstrap/createApp';
import { mountRoutes } from '../../server/bootstrap/mountRoutes';
import { setCacheForTesting, getUserById } from '../../server/dbHelper';
import { signToken, toAuthUser } from '../../server/modules/auth/authAccess';
import { hashPassword } from '../../server/modules/auth/password';
import { onMustChangePassword, triggerMustChangePassword } from '../../src/services/api';

describe('P1 Frontend & Server: MUST_CHANGE_PASSWORD Enforcement', () => {
  let app: any;
  let ownerToken: string;
  let mustChangeToken: string;

  beforeEach(async () => {
    app = createApp({ facebookGraphLegacyEnabled: false });
    mountRoutes(app, { facebookGraphLegacyEnabled: false, agentEnabled: true });

    const regularHash = await hashPassword('CurrentSecurePass123!');
    const tempHash = await hashPassword('TempInitialPass123!');

    setCacheForTesting({
      companies: [
        { id: 'comp-1', name: 'Test Co', status: 'active', created_at: new Date().toISOString() },
      ],
      users: [
        {
          id: 'u-owner',
          name: 'Owner Admin',
          email: 'owner@test.com',
          role: 'owner',
          status: 'active',
          token_version: 1,
          password_hash: regularHash,
          must_change_password: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 'u-must-change',
          name: 'Forced Change User',
          email: 'forced@test.com',
          role: 'member',
          status: 'active',
          token_version: 1,
          password_hash: tempHash,
          must_change_password: true,
          created_at: new Date().toISOString(),
        },
      ],
      customers: [],
      properties: [],
      posts: [],
      inbox: [],
      automations: [],
      settings: {} as any,
    });

    const db = {
      companies: [{ id: 'comp-1', name: 'Test Co', status: 'active', created_at: new Date().toISOString() }],
      users: [],
    };

    ownerToken = signToken(toAuthUser(getUserById('u-owner')!, db as any));
    mustChangeToken = signToken(toAuthUser(getUserById('u-must-change')!, db as any));
  });

  it('1. Blocks user with must_change_password=true from accessing normal routes with 403 MUST_CHANGE_PASSWORD', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${mustChangeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MUST_CHANGE_PASSWORD');
    expect(res.body.message).toContain('Bạn phải đổi mật khẩu');
  });

  it('2. Allows user with must_change_password=true to access /api/auth/me and /api/auth/profile', async () => {
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${mustChangeToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe('u-must-change');

    // PUT /api/auth/profile allows changing password
    const updateRes = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${mustChangeToken}`)
      .send({
        current_password: 'TempInitialPass123!',
        new_password: 'NewStrongPassword2026!',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.must_change_password).toBe(false);

    // Old token is now invalidated because token_version was incremented
    const afterUpdateRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${mustChangeToken}`);

    expect(afterUpdateRes.status).toBe(401);
    expect(afterUpdateRes.body.message).toContain('Phiên đăng nhập đã hết hiệu lực');
  });

  it('3. api.ts event subscription triggers callback when MUST_CHANGE_PASSWORD occurs', () => {
    let triggered = false;
    const unsubscribe = onMustChangePassword(() => {
      triggered = true;
    });

    triggerMustChangePassword();
    expect(triggered).toBe(true);

    triggered = false;
    unsubscribe();
    triggerMustChangePassword();
    expect(triggered).toBe(false);
  });
});
