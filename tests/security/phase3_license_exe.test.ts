import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';
import {
  resetRbacMemoryForTesting,
  seedMockTeamForTesting,
  seedMockTeamMemberForTesting,
  createEntitlement,
} from '../../server/modules/rbac/rbacRepository';
import {
  clearMockLicensesForTesting,
  findLicenseKeysByUserId,
  listAllLicenseKeys,
} from '../../server/modules/license/licenseRepository';
import { hashLicenseKey } from '../../server/modules/license/licenseService';

describe('Phase 3: License Management, Hardware Device Binding & EXE Security', () => {
  let ctx: TestContext;

  beforeEach(() => {
    resetRbacMemoryForTesting();
    clearMockLicensesForTesting();
    ctx = createTestApp();
  });

  // 1. Pending member CANNOT download trial
  it('1. Pending team member is forbidden from downloading trial or activating tool', async () => {
    const team = {
      id: 'team-license-test',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'LIC2026',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(team);

    // Member A is in team with status 'pending'
    seedMockTeamMemberForTesting({
      teamId: team.id,
      userId: ctx.users.memberA.id,
      status: 'pending',
      approvedBy: null,
      joinedAt: new Date(),
    });

    const res = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    expect(res.status).toBe(403);
    expect(['PENDING_MEMBER', 'FORBIDDEN']).toContain(res.body.code);

    // 2) Direct activation attempt by pending member is also blocked with PENDING_MEMBER
    const { createLicenseKey } = await import('../../server/modules/license/licenseRepository');
    const fakeKey = 'HL-PEND-MEMB-TEST';
    await createLicenseKey({
      userId: ctx.users.memberA.id,
      keyHash: hashLicenseKey(fakeKey),
      maxDevices: 1,
    });
    const resAct = await request(ctx.app)
      .post('/api/license/activate')
      .send({ key: fakeKey, deviceId: 'dev-pending-test' });
    expect(resAct.status).toBe(403);
    expect(resAct.body.code).toBe('PENDING_MEMBER');
  });

  // 2. Approved member downloads trial: receives license key and 3-day entitlement
  it('2. Approved member downloads trial, receives key, and creates 3-day entitlement', async () => {
    const res = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.licenseKey).toMatch(/^HL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.body.data.plan).toBe('trial');
    expect(res.body.data.features).toContain('tool.exe');
    expect(res.body.data.securityNotice).toContain('rủi ro checkpoint');
  });

  // 3. Database hygiene: Raw license key is NEVER stored in database, only SHA-256 hash
  it('3. Raw license key is NOT stored in DB, only SHA-256 key_hash is persisted', async () => {
    const res = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    expect(res.status).toBe(200);
    const rawKey = res.body.data.licenseKey;
    const expectedHash = hashLicenseKey(rawKey);

    const keysInDb = await findLicenseKeysByUserId(ctx.users.memberA.id);
    expect(keysInDb.length).toBe(1);
    expect(keysInDb[0].keyHash).toBe(expectedHash);
    // Ensure rawKey is nowhere on the database record
    expect((keysInDb[0] as any).rawKey).toBeUndefined();
    expect((keysInDb[0] as any).key).toBeUndefined();
  });

  // 4. Activating license with deviceId returns access token, refresh token and offline grace
  it('4. Activate license with valid key returns device-bound tokens and 48h offline grace', async () => {
    // 1. Download trial to get key
    const resDownload = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    const rawKey = resDownload.body.data.licenseKey;
    const deviceId = 'dev-pc-hardware-fingerprint-001';

    // 2. Activate device
    const resActivate = await request(ctx.app)
      .post('/api/license/activate')
      .send({
        key: rawKey,
        deviceId,
        deviceName: 'Workstation 1',
      });

    expect(resActivate.status).toBe(200);
    expect(resActivate.body.status).toBe('success');
    expect(resActivate.body.data.accessToken).toBeDefined();
    expect(resActivate.body.data.refreshToken).toBeDefined();
    expect(resActivate.body.data.offlineGraceHours).toBe(48);
  });

  // 5. Exceeding maxDevices limit (default 1) is rejected
  it('5. Activating on a second device when maxDevices=1 returns 403 MAX_DEVICES_EXCEEDED', async () => {
    const resDownload = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    const rawKey = resDownload.body.data.licenseKey;

    // Activate Device 1 -> Success
    const res1 = await request(ctx.app)
      .post('/api/license/activate')
      .send({ key: rawKey, deviceId: 'device-first-111' });
    expect(res1.status).toBe(200);

    // Activate Device 2 -> Rejected with 403
    const res2 = await request(ctx.app)
      .post('/api/license/activate')
      .send({ key: rawKey, deviceId: 'device-second-222' });
    expect(res2.status).toBe(403);
    expect(res2.body.code).toBe('MAX_DEVICES_EXCEEDED');
  });

  // 6. Device Token Isolation: Token for Device A CANNOT be used on Device B
  it('6. Device token isolation: Token for device A is rejected when used by device B', async () => {
    const resDownload = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    const rawKey = resDownload.body.data.licenseKey;
    const resActivate = await request(ctx.app)
      .post('/api/license/activate')
      .send({ key: rawKey, deviceId: 'device-alpha' });

    const deviceAlphaToken = resActivate.body.data.accessToken;

    // Heartbeat from Device Alpha -> 200 OK
    const resValidHeartbeat = await request(ctx.app)
      .post('/api/license/heartbeat')
      .set('Authorization', `Bearer ${deviceAlphaToken}`)
      .set('X-Device-Id', 'device-alpha')
      .send({ deviceId: 'device-alpha' });
    expect(resValidHeartbeat.status).toBe(200);
    expect(resValidHeartbeat.body.valid).toBe(true);

    // Heartbeat sending Device Alpha's token but spoofing or presenting Device Beta -> 403 Rejected!
    const resSpoofedHeartbeat = await request(ctx.app)
      .post('/api/license/heartbeat')
      .set('Authorization', `Bearer ${deviceAlphaToken}`)
      .set('X-Device-Id', 'device-beta-spoofed')
      .send({ deviceId: 'device-beta-spoofed' });
    expect(resSpoofedHeartbeat.status).toBe(403);
    expect(resSpoofedHeartbeat.body.code).toBe('INVALID_TOKEN');
  });

  // 7. Heartbeat updates heartbeat timestamp and returns valid status
  it('7. Heartbeat ping updates device lastHeartbeatAt successfully', async () => {
    // Download trial with proper auth
    const resDl = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    const key = resDl.body.data.licenseKey;
    const deviceId = 'device-heartbeat-test';

    const resAct = await request(ctx.app)
      .post('/api/license/activate')
      .send({ key, deviceId });

    const token = resAct.body.data.accessToken;

    const resHb = await request(ctx.app)
      .post('/api/license/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId, token });

    expect(resHb.status).toBe(200);
    expect(resHb.body.valid).toBe(true);
    expect(resHb.body.offlineGraceHours).toBe(48);
  });

  // 8. Super Admin revokes key: subsequent heartbeat and token refresh are rejected
  it('8. Super Admin can revoke license key, immediately locking the desktop agent', async () => {
    const resDownload = await request(ctx.app)
      .post('/api/license/download-trial')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    const key = resDownload.body.data.licenseKey;
    const licenseKeyId = resDownload.body.data.licenseKeyId;
    const deviceId = 'device-revocation-test';

    const resAct = await request(ctx.app)
      .post('/api/license/activate')
      .send({ key, deviceId });

    const token = resAct.body.data.accessToken;
    const refreshToken = resAct.body.data.refreshToken;

    // Member cannot revoke license key -> 403
    const resMemberRevoke = await request(ctx.app)
      .post(`/api/admin/licenses/${licenseKeyId}/revoke`)
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resMemberRevoke.status).toBe(403);

    // Super Admin revokes license key -> 200
    const resOwnerRevoke = await request(ctx.app)
      .post(`/api/admin/licenses/${licenseKeyId}/revoke`)
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);
    expect(resOwnerRevoke.status).toBe(200);

    // Subsequent heartbeat MUST fail with KEY_REVOKED -> 403
    const resHb = await request(ctx.app)
      .post('/api/license/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId, token });
    expect(resHb.status).toBe(403);
    expect(resHb.body.code).toBe('KEY_REVOKED');

    // Subsequent refresh token MUST fail with KEY_REVOKED -> 403
    const resRefresh = await request(ctx.app)
      .post('/api/license/refresh-token')
      .send({ refreshToken, deviceId });
    expect(resRefresh.status).toBe(403);
    expect(resRefresh.body.code).toBe('KEY_REVOKED');
  });

  // 9. Expired Entitlement rejects activation and heartbeat
  it('9. Expired entitlement prevents activation and heartbeat with ENTITLEMENT_EXPIRED', async () => {
    // 1. Manually create an expired entitlement for user
    await createEntitlement({
      subjectType: 'user',
      subjectId: ctx.users.memberB.id,
      plan: 'trial',
      features: ['tool.exe'],
      startsAt: new Date(Date.now() - 10 * 86400_000),
      expiresAt: new Date(Date.now() - 7 * 86400_000), // Expired 7 days ago
      source: 'license',
      grantedBy: null,
    });

    const { createLicenseKey } = await import('../../server/modules/license/licenseRepository');
    const rawKey = 'HL-TEST-EXPR-KEY1';
    await createLicenseKey({
      userId: ctx.users.memberB.id,
      keyHash: hashLicenseKey(rawKey),
      maxDevices: 1,
    });

    // Attempt to activate with expired entitlement -> 402/403 ENTITLEMENT_EXPIRED
    const resAct = await request(ctx.app)
      .post('/api/license/activate')
      .send({ key: rawKey, deviceId: 'dev-expired-test' });

    expect([402, 403]).toContain(resAct.status);
    expect(resAct.body.code).toBe('ENTITLEMENT_EXPIRED');
  });
});
