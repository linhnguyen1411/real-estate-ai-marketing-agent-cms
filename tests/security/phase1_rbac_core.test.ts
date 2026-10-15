import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';
import { narrowScope } from '../../server/modules/rbac/rbacTypes';
import { resolvePermissions } from '../../server/modules/rbac/rbacService';
import {
  resetRbacMemoryForTesting,
  seedMockTeamForTesting,
  seedMockTeamMemberForTesting,
  seedMockOverrideForTesting,
  seedMockEntitlementForTesting,
} from '../../server/modules/rbac/rbacRepository';
import { signToken, toAuthUser } from '../../server/modules/auth/authAccess';
import { readDatabase, setCacheForTesting } from '../../server/dbHelper';
import type { User } from '../../src/types';

describe('Phase 1 RBAC Core & Multi-Tenant Gates', () => {
  let ctx: TestContext;

  beforeEach(() => {
    resetRbacMemoryForTesting();
    ctx = createTestApp();
  });

  // Test 1: Cross-team access denied (Team A member cannot read/write Team B's properties/data)
  it('1. Cross-team isolation: Member A (Team Alpha) cannot read or modify Team Beta property', async () => {
    const teamA = {
      id: 'team-alpha-id',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'ALPHA01',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    const teamB = {
      id: 'team-beta-id',
      leadUserId: ctx.users.companyAdminB.id,
      referralCode: 'BETA01',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(teamA);
    seedMockTeamForTesting(teamB);

    seedMockTeamMemberForTesting({
      teamId: teamA.id,
      userId: ctx.users.memberA.id,
      status: 'approved',
      approvedBy: teamA.leadUserId,
      joinedAt: new Date(),
    });
    seedMockTeamMemberForTesting({
      teamId: teamB.id,
      userId: ctx.users.memberB.id,
      status: 'approved',
      approvedBy: teamB.leadUserId,
      joinedAt: new Date(),
    });

    // Tag property B with team B in db cache
    const db = readDatabase() as any;
    const propB = db.properties.find((p: any) => p.id === 'prop-b1');
    if (propB) {
      propB.team_id = teamB.id;
    }
    setCacheForTesting(db);

    // Member A attempts to read Property B -> 403 Forbidden
    const resRead = await request(ctx.app)
      .get('/api/properties/prop-b1')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resRead.status).toBe(403);

    // Member A attempts to edit Property B -> 403 Forbidden
    const resUpdate = await request(ctx.app)
      .put('/api/properties/prop-b1')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
      .send({ title: 'Hacked by Member A' });
    expect(resUpdate.status).toBe(403);
  });

  // Test 2: Pending member sees only own properties (req.scope === 'own')
  it('2. Pending member: scope is strictly narrowed to own resources', async () => {
    const teamA = {
      id: 'team-alpha-id',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'ALPHA01',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(teamA);

    const pendingUser: User = {
      id: 'user-pending-a',
      name: 'Pending Member A',
      email: 'pending@alpha.vn',
      password: 'mocked-hash-password',
      role: 'member',
      company_id: ctx.companies[0].id,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    seedMockTeamMemberForTesting({
      teamId: teamA.id,
      userId: pendingUser.id,
      status: 'pending',
      approvedBy: null,
      joinedAt: new Date(),
    });

    // Verify resolvePermissions sets state = pending_member and property.read = own
    const resolved = await resolvePermissions(pendingUser);
    expect(resolved.roleKey).toBe('pending_member');
    expect(resolved.permissions['property.read'].scope).toBe('own');
    expect(resolved.permissions['property.write'].scope).toBe('own');

    // Add pending user to db cache
    const db = readDatabase() as any;
    db.users.push(pendingUser);
    db.properties.push({
      id: 'prop-pending-own',
      title: 'Pending Member Own House',
      price: 2.5,
      area: 80,
      status: 'active',
      company_id: ctx.companies[0].id,
      owner_user_id: pendingUser.id,
      created_at: new Date().toISOString(),
    });
    setCacheForTesting(db);

    const pendingToken = signToken(toAuthUser(pendingUser, db));

    // Request properties list: pending member sees own property, but cannot access team lead's prop-a1
    const resList = await request(ctx.app)
      .get('/api/properties')
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(resList.status).toBe(200);
    const properties = resList.body.data || resList.body;
    const propIds = properties.map((p: any) => p.id);
    expect(propIds).toContain('prop-pending-own');
    expect(propIds).not.toContain('prop-a1');

    // Attempting to directly GET prop-a1 returns 403
    const resDirect = await request(ctx.app)
      .get('/api/properties/prop-a1')
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(resDirect.status).toBe(403);
  });

  // Test 3: Team permission override can ONLY narrow and NEVER widen (narrowScope)
  it('3. Team permission override: strictly narrows and never widens', async () => {
    // Unit logic check for narrowScope
    expect(narrowScope('all', 'team')).toBe('team');
    expect(narrowScope('team', 'own')).toBe('own');
    expect(narrowScope('team', 'none')).toBe('none');
    expect(narrowScope('own', 'all')).toBe('own'); // Cannot widen to all!
    expect(narrowScope('none', 'team')).toBe('none'); // Cannot widen to team!

    const team = {
      id: 'team-override-test',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'OVERRIDE1',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(team);

    seedMockTeamMemberForTesting({
      teamId: team.id,
      userId: ctx.users.memberA.id,
      status: 'approved',
      approvedBy: team.leadUserId,
      joinedAt: new Date(),
    });

    // 1) Apply narrow override: property.read from team -> own
    seedMockOverrideForTesting({
      teamId: team.id,
      permissionKey: 'property.read',
      scope: 'own',
    });

    // 2) Attempt illegitimate widening override: property.distribute from none -> all
    seedMockOverrideForTesting({
      teamId: team.id,
      permissionKey: 'property.distribute',
      scope: 'all',
    });

    const resolved = await resolvePermissions(ctx.users.memberA);
    // Narrowing should succeed:
    expect(resolved.permissions['property.read'].scope).toBe('own');
    // Widening must be rejected:
    expect(resolved.permissions['property.distribute'].scope).toBe('none');
  });

  // Test 4: Pending member does NOT inherit team premium entitlements (no premium inheritance for pending)
  it('4. Entitlement inheritance: pending member does NOT inherit team premium, approved member does', async () => {
    const team = {
      id: 'team-premium-test',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'PREMIUM1',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(team);

    // Grant team-level entitlement for CRM and investor leads
    seedMockEntitlementForTesting({
      id: 'ent-team-crm',
      subjectType: 'team',
      subjectId: team.id,
      plan: 'pro_team',
      features: ['crm', 'investor_leads'],
      startsAt: new Date(Date.now() - 3600_000),
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      source: 'manual',
      grantedBy: 'admin',
    });

    const pendingUser: User = {
      id: 'user-pending-prem',
      name: 'Pending Premium User',
      email: 'pending.prem@alpha.vn',
      password: 'mocked-hash-password',
      role: 'member',
      company_id: ctx.companies[0].id,
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

    seedMockTeamMemberForTesting({
      teamId: team.id,
      userId: ctx.users.memberA.id,
      status: 'approved',
      approvedBy: team.leadUserId,
      joinedAt: new Date(),
    });

    // 1) Approved member resolves active entitlements: inherits crm & investor_leads
    const approvedResolved = await resolvePermissions(ctx.users.memberA);
    expect(approvedResolved.activeEntitlementFeatures.has('crm')).toBe(true);
    expect(approvedResolved.activeEntitlementFeatures.has('investor_leads')).toBe(true);

    // 2) Pending member resolves active entitlements: empty!
    const pendingResolved = await resolvePermissions(pendingUser);
    expect(pendingResolved.activeEntitlementFeatures.size).toBe(0);
    expect(pendingResolved.activeEntitlementFeatures.has('crm')).toBe(false);

    // 3) HTTP Gate test: pending member calling CRM customers -> 403 FORBIDDEN (pending has crm: none)
    const db = readDatabase() as any;
    db.users.push(pendingUser);
    setCacheForTesting(db);
    const pendingToken = signToken(toAuthUser(pendingUser, db));

    const resPendingCrm = await request(ctx.app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(resPendingCrm.status).toBe(403);
    expect(resPendingCrm.body.code).toBe('FORBIDDEN');

    // Member B (team without premium entitlement) -> gets 402 PREMIUM_REQUIRED
    const resUnentitledMember = await request(ctx.app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(resUnentitledMember.status).toBe(402);
    expect(resUnentitledMember.body.code).toBe('PREMIUM_REQUIRED');

    // Approved member calling CRM customers has premium entitlement -> passes 402 gate
    const resApprovedCrm = await request(ctx.app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resApprovedCrm.status).toBe(200);
  });

  // Test 5: website_chat requires platform root team (isPlatformRoot = true)
  it('5. Platform Root feature gate: website_chat is restricted to platform root team', async () => {
    // Normal team
    const normalTeam = {
      id: 'team-normal-crm',
      leadUserId: ctx.users.companyAdminA.id,
      referralCode: 'NORM01',
      isPlatformRoot: false,
      createdAt: new Date(),
    };
    // Platform root team
    const rootTeam = {
      id: 'team-platform-root',
      leadUserId: ctx.users.owner.id,
      referralCode: 'ROOT01',
      isPlatformRoot: true,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(normalTeam);
    seedMockTeamForTesting(rootTeam);

    seedMockTeamMemberForTesting({
      teamId: normalTeam.id,
      userId: ctx.users.memberA.id,
      status: 'approved',
      approvedBy: normalTeam.leadUserId,
      joinedAt: new Date(),
    });

    // Normal team member resolves permissions: website_chat is 'none'
    const normalResolved = await resolvePermissions(ctx.users.memberA);
    expect(normalResolved.permissions['website_chat'].scope).toBe('none');

    // Normal team member calling /api/chat/guests -> 403 Forbidden
    const resNormalChat = await request(ctx.app)
      .get('/api/chat/guests')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resNormalChat.status).toBe(403);

    // Platform Root owner resolves permissions: website_chat is 'all'
    const rootResolved = await resolvePermissions(ctx.users.owner);
    expect(rootResolved.permissions['website_chat'].scope).toBe('all');

    // Platform Root owner calling /api/chat/guests -> 200 OK
    const resRootChat = await request(ctx.app)
      .get('/api/chat/guests')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);
    expect(resRootChat.status).toBe(200);
  });

  // Test 6: Deny-by-default on /api: undeclared route returns 403
  it('6. Deny-by-default guard: unmapped or undeclared /api route is denied with 403', async () => {
    // Register an ad-hoc test route on ctx.app to simulate a developer forgetting to declare permissions
    ctx.app.get('/api/unmapped-secret-data', (req, res) => {
      res.json({ secret: 'leaked' });
    });

    // Request with member token -> blocked by denyByDefaultGuard with 403
    const resMember = await request(ctx.app)
      .get('/api/unmapped-secret-data')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(resMember.status).toBe(403);
    expect(resMember.body.code).toBe('FORBIDDEN');

    // Request with unauthenticated call -> 401 Unauthorized
    const resAnon = await request(ctx.app).get('/api/unmapped-secret-data');
    expect(resAnon.status).toBe(401);
  });
});
