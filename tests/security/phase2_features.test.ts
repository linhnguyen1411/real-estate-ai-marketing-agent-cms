import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';
import {
  resetRbacMemoryForTesting,
  seedMockTeamForTesting,
  seedMockTeamMemberForTesting,
  createTeam,
} from '../../server/modules/rbac/rbacRepository';
import { readDatabase, setCacheForTesting } from '../../server/dbHelper';
import { signToken, toAuthUser } from '../../server/modules/auth/authAccess';
import type { User } from '../../src/types';

describe('Phase 2: Register, Referral, Team Management & Listing Distribution', () => {
  let ctx: TestContext;

  beforeEach(() => {
    resetRbacMemoryForTesting();
    ctx = createTestApp();
  });

  // 1. Register independent user
  it('1. Register without referral code creates independent user', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Independent User',
        email: 'independent@test.com',
        password: 'ValidPassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.email).toBe('independent@test.com');
    expect(res.body.data.user.referral_code).toBeDefined();
    expect(res.body.data.token).toBeDefined();

    // Verify user in db has no team
    const { getTeamMember } = await import('../../server/modules/rbac/rbacRepository');
    const member = await getTeamMember(res.body.data.user.id);
    expect(member).toBeNull();
  });

  // 2. Register with valid referral code
  it('2. Register with valid referral code binds user as pending team member', async () => {
    const teamLead = ctx.users.companyAdminA;
    const team = {
      id: 'team-lead-alpha',
      leadUserId: teamLead.id,
      referralCode: 'ALPHA2026',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(team);

    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'New Sale Member',
        email: 'newsale@test.com',
        password: 'ValidPassword123!',
        referralCode: 'alpha2026', // case insensitive
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    const newUserId = res.body.data.user.id;

    // Verify user is in TeamMember with status 'pending'
    const { getTeamMember } = await import('../../server/modules/rbac/rbacRepository');
    const membership = await getTeamMember(newUserId);
    expect(membership).not.toBeNull();
    expect(membership?.teamId).toBe(team.id);
    expect(membership?.status).toBe('pending');
  });

  // 3. Register with invalid referral code
  it('3. Register with non-existent referral code returns generic 400 error without code leakage', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Hacker Attempt',
        email: 'hacker@test.com',
        password: 'ValidPassword123!',
        referralCode: 'INVALIDCODE999',
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toBe('Mã giới thiệu không hợp lệ.');
  });

  // 4. Team Lead lists team members & approves pending member
  it('4. Team Lead can list members and approve pending member', async () => {
    const lead = ctx.users.companyAdminA;
    const team = {
      id: 'team-alpha-mgmt',
      leadUserId: lead.id,
      referralCode: 'ALPHAMGMT',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(team);

    const pendingUser: User = {
      id: 'user-pending-test',
      name: 'Pending Sale Agent',
      email: 'pending.sale@test.com',
      password: 'mocked-hash-password',
      role: 'member',
      status: 'active',
      created_at: new Date().toISOString(),
    };

    seedMockTeamMemberForTesting({
      teamId: team.id,
      userId: pendingUser.id,
      status: 'pending',
      approvedBy: null,
      joinedAt: new Date(),
    });

    const db = readDatabase() as any;
    db.users.push(pendingUser);
    setCacheForTesting(db);

    // Team lead lists members
    const resList = await request(ctx.app)
      .get('/api/team/members')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);
    expect(resList.status).toBe(200);
    expect(resList.body.data.length).toBeGreaterThan(0);
    const foundPending = resList.body.data.find((m: any) => m.userId === pendingUser.id);
    expect(foundPending).toBeDefined();
    expect(foundPending.status).toBe('pending');

    // Team lead approves member
    const resApprove = await request(ctx.app)
      .patch(`/api/team/members/${pendingUser.id}`)
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`)
      .send({ status: 'approved' });
    expect(resApprove.status).toBe(200);
    expect(resApprove.body.data.status).toBe('approved');
  });

  // 5. Team Lead cannot manage members of another team
  it('5. Team Lead A cannot approve or suspend member of Team B', async () => {
    const teamA = {
      id: 'team-alpha-sep',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'TEAMALPHASEP',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    const teamB = {
      id: 'team-beta-sep',
      leadUserId: ctx.users.companyAdminB.id,
      referralCode: 'TEAMBETASEP',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(teamA);
    seedMockTeamForTesting(teamB);

    seedMockTeamMemberForTesting({
      teamId: teamB.id,
      userId: ctx.users.memberB.id,
      status: 'pending',
      approvedBy: null,
      joinedAt: new Date(),
    });

    // Lead A attempts to approve Member B -> 404/403
    const res = await request(ctx.app)
      .patch(`/api/team/members/${ctx.users.memberB.id}`)
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`)
      .send({ status: 'approved' });

    expect([403, 404]).toContain(res.status);
  });

  // 6. Team Lead rotates referral code
  it('6. Team Lead can rotate referral code', async () => {
    const team = {
      id: 'team-rotate-test',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'OLDCODE123',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(team);

    const res = await request(ctx.app)
      .post('/api/team/rotate-referral-code')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);

    expect(res.status).toBe(200);
    const newCode = res.body.data.referralCode;
    expect(newCode).toBeDefined();
    expect(newCode).not.toBe('OLDCODE123');
    expect(newCode.length).toBe(10);
  });

  // 7. Property creation requires listing_source
  it('7. Property creation requires listing_source (broker or owner)', async () => {
    // Missing listing_source -> 400
    const resMissing = await request(ctx.app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
      .send({
        title: 'Bất động sản không nguồn',
        price: 2.0,
        area: 100,
      });
    expect(resMissing.status).toBe(400);

    // Invalid listing_source -> 400
    const resInvalid = await request(ctx.app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
      .send({
        title: 'Bất động sản nguồn fake',
        price: 2.0,
        area: 100,
        listing_source: 'fake_source',
      });
    expect(resInvalid.status).toBe(400);

    // Valid broker source -> 200
    const resValid = await request(ctx.app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
      .send({
        title: 'Đất Hòa Xuân chính chủ ký gửi',
        price: 3.5,
        area: 100,
        listing_source: 'broker',
      });
    expect(resValid.status).toBe(200);
    expect(resValid.body.data.listing_source).toBe('broker');
    expect(resValid.body.data.owner_user_id).toBe(ctx.users.memberA.id);
  });

  // 8. Team Lead distributes property to approved members only
  it('8. Team Lead can distribute property to approved members with audit records', async () => {
    const lead = ctx.users.companyAdminA;
    const team = {
      id: 'team-dist-test',
      leadUserId: lead.id,
      referralCode: 'DIST2026',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(team);

    // Member A is approved
    seedMockTeamMemberForTesting({
      teamId: team.id,
      userId: ctx.users.memberA.id,
      status: 'approved',
      approvedBy: lead.id,
      joinedAt: new Date(),
    });

    // Create a pending member in team
    const pendingMember: User = {
      id: 'user-dist-pending',
      name: 'Pending Sales Agent',
      email: 'pending.dist@test.com',
      password: 'mocked-hash-password',
      role: 'member',
      status: 'active',
      created_at: new Date().toISOString(),
    };
    seedMockTeamMemberForTesting({
      teamId: team.id,
      userId: pendingMember.id,
      status: 'pending',
      approvedBy: null,
      joinedAt: new Date(),
    });

    // 1) Distribute to pending member should be REJECTED with 400
    const resDistPending = await request(ctx.app)
      .post('/api/properties/prop-a1/distribute')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`)
      .send({ memberIds: [pendingMember.id] });
    expect(resDistPending.status).toBe(400);

    // 2) Distribute to approved member A should SUCCEED with 200
    const resDistApproved = await request(ctx.app)
      .post('/api/properties/prop-a1/distribute')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`)
      .send({ memberIds: [ctx.users.memberA.id] });
    expect(resDistApproved.status).toBe(200);
    expect(resDistApproved.body.data.assigned_member_ids).toContain(ctx.users.memberA.id);
    expect(resDistApproved.body.assignments.length).toBe(1);

    // 3) Audit history endpoint returns assignment records
    const resHistory = await request(ctx.app)
      .get('/api/properties/prop-a1/assignments')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);
    expect(resHistory.status).toBe(200);
    expect(resHistory.body.data.length).toBeGreaterThan(0);
    expect(resHistory.body.data[0].assigned_to).toBe(ctx.users.memberA.id);
    expect(resHistory.body.data[0].assigned_by).toBe(lead.id);
  });

  // 9. Super Admin grants and revokes entitlements
  it('9. Super Admin can grant and revoke entitlements, member cannot access', async () => {
    // Member cannot access entitlements -> 403
    const resMember = await request(ctx.app)
      .get('/api/entitlements')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resMember.status).toBe(403);

    // Super Admin lists entitlements -> 200
    const resOwnerList = await request(ctx.app)
      .get('/api/entitlements')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);
    expect(resOwnerList.status).toBe(200);

    // Super Admin grants entitlement
    const resGrant = await request(ctx.app)
      .post('/api/entitlements')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`)
      .send({
        subjectType: 'user',
        subjectId: ctx.users.memberA.id,
        plan: 'month',
        features: ['crm', 'investor_leads'],
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      });
    expect(resGrant.status).toBe(200);
    const createdId = resGrant.body.data.id;
    expect(createdId).toBeDefined();

    // Super Admin revokes entitlement
    const resRevoke = await request(ctx.app)
      .delete(`/api/entitlements/${createdId}`)
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);
    expect(resRevoke.status).toBe(200);
  });
});
