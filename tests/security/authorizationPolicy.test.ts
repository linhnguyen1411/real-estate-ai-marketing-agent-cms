import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';
import { resolvePermissions } from '../../server/modules/rbac/rbacService';
import {
  resetRbacMemoryForTesting,
  seedMockTeamForTesting,
  seedMockTeamMemberForTesting,
  seedMockEntitlementForTesting,
} from '../../server/modules/rbac/rbacRepository';
import { resolveRoutePermission } from '../../server/modules/rbac/rbacMiddleware';
import {
  NO_TENANT,
  canAccessCompany,
  resolveRequestCompanyId,
  resolveRequestCompanyIdStrict,
} from '../../server/modules/auth/tenantScope';
import { readDatabase, setCacheForTesting } from '../../server/dbHelper';
import type { User } from '../../src/types';

const teamA = {
  id: 'team-policy-alpha',
  leadUserId: 'user-admin-a',
  referralCode: 'POLA01',
  isPlatformRoot: false,
  createdAt: new Date(),
};
const teamB = {
  id: 'team-policy-beta',
  leadUserId: 'user-admin-b',
  referralCode: 'POLB01',
  isPlatformRoot: false,
  createdAt: new Date(),
};

function seedTeams() {
  seedMockTeamForTesting(teamA);
  seedMockTeamForTesting(teamB);
  seedMockTeamMemberForTesting({
    teamId: teamA.id,
    userId: 'user-member-a',
    status: 'approved',
    approvedBy: teamA.leadUserId,
    joinedAt: new Date(),
  });
  seedMockTeamMemberForTesting({
    teamId: teamB.id,
    userId: 'user-member-b',
    status: 'approved',
    approvedBy: teamB.leadUserId,
    joinedAt: new Date(),
  });
}

function fakeReq(user: unknown) {
  return { authUser: user } as any;
}

describe('Authorization policy matrix', () => {
  let ctx: TestContext;

  beforeEach(() => {
    resetRbacMemoryForTesting();
    ctx = createTestApp();
  });

  it('1. super admin (raw owner) resolves every permission with all scope', async () => {
    const resolved = await resolvePermissions(ctx.users.owner);
    expect(resolved.roleKey).toBe('super_admin');
    expect(resolved.activeEntitlementFeatures.has('*')).toBe(true);
    for (const perm of Object.values(resolved.permissions)) {
      if (!perm) continue;
      expect(perm.hasAccess).toBe(true);
      expect(perm.scope).not.toBe('none');
    }
    expect(resolved.permissions['property.read'].scope).toBe('all');
    expect(resolved.permissions['user.manage'].scope).toBe('all');
    expect(resolved.permissions['platform.admin'].scope).toBe('all');
  });

  it('2. raw super_admin role behaves exactly like owner', async () => {
    const user: User = {
      id: 'user-super-2',
      name: 'Super Two',
      email: 'super2@bdsdanang.site',
      password: 'mocked-hash-password',
      role: 'super_admin',
      status: 'active',
      created_at: new Date().toISOString(),
    };
    const resolved = await resolvePermissions(user);
    expect(resolved.roleKey).toBe('super_admin');
    expect(resolved.permissions['platform.admin'].scope).toBe('all');
    expect(resolved.permissions['settings.system'].hasAccess).toBe(true);
  });

  it('3. legacy company admin maps to team lead with company-wide data and no platform permissions', async () => {
    const resolved = await resolvePermissions(ctx.users.companyAdminA);
    expect(resolved.roleKey).toBe('team_lead');
    expect(resolved.companyWide).toBe(true);
    expect(resolved.permissions['property.read'].scope).toBe('team');
    expect(resolved.permissions['team.members.manage'].scope).toBe('team');
    expect(resolved.permissions['platform.admin'].hasAccess).toBe(false);
    expect(resolved.permissions['settings.system'].hasAccess).toBe(false);
    expect(resolved.permissions['rbac.matrix'].hasAccess).toBe(false);
    expect(resolved.permissions['user.manage'].scope).toBe('team');
  });

  it('4. unentitled independent user cannot use premium features', async () => {
    const resolved = await resolvePermissions(ctx.users.memberB);
    expect(resolved.roleKey).toBe('independent');
    expect(resolved.permissions['crm'].hasAccess).toBe(false);
    expect(resolved.permissions['crm'].requiresPremiumUpgrade).toBe(true);
    expect(resolved.permissions['investor_leads'].requiresPremiumUpgrade).toBe(true);
    expect(resolved.permissions['website_chat'].scope).toBe('none');
    expect(resolved.permissions['property.read'].scope).toBe('own');
  });

  it('5. pending member has no dashboard and only own property access', async () => {
    const pending: User = {
      id: 'user-pending-policy',
      name: 'Pending Policy',
      email: 'pending2@alpha.vn',
      password: 'mocked-hash-password',
      role: 'member',
      company_id: ctx.companies[0].id,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    seedMockTeamForTesting(teamA);
    seedMockTeamMemberForTesting({
      teamId: teamA.id,
      userId: pending.id,
      status: 'pending',
      approvedBy: null,
      joinedAt: new Date(),
    });

    const resolved = await resolvePermissions(pending);
    expect(resolved.roleKey).toBe('pending_member');
    expect(resolved.status).toBe('pending');
    expect(resolved.permissions['dashboard'].scope).toBe('none');
    expect(resolved.permissions['property.read'].scope).toBe('own');
    expect(resolved.permissions['crm'].hasAccess).toBe(false);
    expect(resolved.permissions['platform.admin'].hasAccess).toBe(false);
  });

  it('6. approved team member gets team scope and explicit entitlements', async () => {
    seedTeams();
    const resolved = await resolvePermissions(ctx.users.memberA);
    expect(resolved.roleKey).toBe('member');
    expect(resolved.teamId).toBe(teamA.id);
    expect(resolved.companyWide).toBeFalsy();
    expect(resolved.permissions['property.read'].scope).toBe('team');
    expect(resolved.permissions['crm'].hasAccess).toBe(true);
    expect(resolved.permissions['user.manage'].scope).toBe('none');
    expect(resolved.permissions['team.members.manage'].scope).toBe('none');
    expect(resolved.permissions['platform.admin'].hasAccess).toBe(false);
  });

  it('7. team permission overrides can only narrow, never widen', async () => {
    seedTeams();
    seedMockTeamMemberForTesting({
      teamId: teamA.id,
      userId: ctx.users.memberA.id,
      status: 'approved',
      approvedBy: teamA.leadUserId,
      joinedAt: new Date(),
    });
    const { seedMockOverrideForTesting } = await import('../../server/modules/rbac/rbacRepository');
    seedMockOverrideForTesting({ teamId: teamA.id, permissionKey: 'property.read', scope: 'own' });
    seedMockOverrideForTesting({ teamId: teamA.id, permissionKey: 'crm', scope: 'all' });

    const resolved = await resolvePermissions(ctx.users.memberA);
    expect(resolved.permissions['property.read'].scope).toBe('own');
    expect(resolved.permissions['crm'].scope).toBe('team');
  });
});

describe('Tenant resolution policy', () => {
  let ctx: TestContext;

  beforeEach(() => {
    resetRbacMemoryForTesting();
    ctx = createTestApp();
  });

  it('8. non-super callers are pinned to their own company', () => {
    const req = fakeReq(ctx.users.companyAdminA);
    expect(resolveRequestCompanyId(req, 'comp-beta')).toBe('comp-alpha');
    expect(resolveRequestCompanyIdStrict(req, 'comp-beta')).toBe('comp-alpha');
    expect(canAccessCompany(req, 'comp-alpha')).toBe(true);
    expect(canAccessCompany(req, 'comp-beta')).toBe(false);
  });

  it('9. users without a company resolve to the no-tenant sentinel, never "all"', () => {
    const user = { ...ctx.users.memberA, company_id: undefined };
    const req = fakeReq(user);
    expect(resolveRequestCompanyId(req)).toBe(NO_TENANT);
    expect(resolveRequestCompanyIdStrict(req)).toBe(NO_TENANT);
    expect(resolveRequestCompanyId(req, 'comp-beta')).toBe(NO_TENANT);
    expect(canAccessCompany(req, undefined)).toBe(false);
  });

  it('10. only super admins may request another company or "all companies"', () => {
    const req = fakeReq(ctx.users.owner);
    expect(resolveRequestCompanyId(req)).toBeUndefined();
    expect(resolveRequestCompanyId(req, 'comp-beta')).toBe('comp-beta');
    expect(resolveRequestCompanyIdStrict(req)).toBe(NO_TENANT);
    expect(resolveRequestCompanyIdStrict(req, 'comp-beta')).toBe('comp-beta');
    expect(canAccessCompany(req, 'comp-beta')).toBe(true);
  });
});

describe('Route permission mapping', () => {
  it('11. platform-global routes resolve to platform.admin before coarse module rules', () => {
    expect(resolveRoutePermission('POST', '/api/knowledge/reset')).toBe('platform.admin');
    expect(resolveRoutePermission('POST', '/api/knowledge/import')).toBe('platform.admin');
    expect(resolveRoutePermission('POST', '/api/decision-center/rules/reset')).toBe('platform.admin');
    expect(resolveRoutePermission('POST', '/api/ai-gateway/chat')).toBe('platform.admin');
    expect(resolveRoutePermission('GET', '/api/executive/snapshot')).toBe('platform.admin');
    expect(resolveRoutePermission('GET', '/api/execution-trace/anything')).toBe('platform.admin');
    expect(resolveRoutePermission('GET', '/api/control-plane/status')).toBe('platform.admin');
    expect(resolveRoutePermission('POST', '/api/agent/telegram/console')).toBe('platform.admin');
  });

  it('12. feature routes resolve to their own permission, not a raw role shortcut', () => {
    expect(resolveRoutePermission('GET', '/api/agent/fleet')).toBe('agent.runtime');
    expect(resolveRoutePermission('GET', '/api/agent/reports/daily')).toBe('agent.reports');
    expect(resolveRoutePermission('GET', '/api/users')).toBe('user.manage');
    expect(resolveRoutePermission('PATCH', '/api/team/members/user-x')).toBe('team.members.manage');
    expect(resolveRoutePermission('GET', '/api/investor-leads')).toBe('investor_leads');
    expect(resolveRoutePermission('GET', '/api/sales/pipeline')).toBe('lead.intel');
    expect(resolveRoutePermission('GET', '/api/chat/guests')).toBe('website_chat');
    expect(resolveRoutePermission('GET', '/api/properties')).toBe('property.read');
    expect(resolveRoutePermission('GET', '/api/unmapped-route')).toBeNull();
  });
});

describe('HTTP authorization behaviour', () => {
  let ctx: TestContext;

  beforeEach(() => {
    resetRbacMemoryForTesting();
    ctx = createTestApp();
  });

  it('13. member dashboard is tenant-scoped and links only to /my routes', async () => {
    seedTeams();
    const res = await request(ctx.app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.summary).toContain('phạm vi quyền');
    for (const metric of data.snapshot) {
      expect(metric.href.startsWith('/my')).toBe(true);
      expect(metric.href).not.toContain('/admin');
    }
    const ids = data.snapshot.map((m: { id: string }) => m.id);
    expect(ids).toContain('properties');
  });

  it('14. unentitled member sees no premium metrics in dashboard or navigation-counts', async () => {
    const dash = await request(ctx.app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(dash.status).toBe(200);
    const ids = dash.body.data.snapshot.map((m: { id: string }) => m.id);
    expect(ids).not.toContain('website_chat');
    expect(ids).not.toContain('investor_leads');
    expect(ids).not.toContain('crm');

    const nav = await request(ctx.app)
      .get('/api/navigation-counts')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(nav.status).toBe(200);
    expect(nav.body.data.websiteChat).toBe(0);
    expect(nav.body.data.investorLeads).toBe(0);
    expect(nav.body.data.crm).toBe(0);
    expect(nav.body.data.users).toBeUndefined();
  });

  it('15. chat history is restricted to Super Admin and platform-root team members', async () => {
    seedTeams();
    const db = readDatabase() as any;
    db.chat_history = [
      { id: 'chat-a1', user_id: 'user-admin-a', company_id: 'comp-alpha', role: 'user', message: 'A1', created_at: new Date().toISOString() },
      { id: 'chat-b1', user_id: 'user-admin-b', company_id: 'comp-beta', role: 'user', message: 'B1', created_at: new Date().toISOString() },
      { id: 'chat-a2', user_id: 'user-member-a', company_id: 'comp-alpha', role: 'model', message: 'A2', created_at: new Date().toISOString() },
      { id: 'chat-b2', user_id: 'user-member-b', company_id: 'comp-beta', role: 'model', message: 'B2', created_at: new Date().toISOString() },
    ];
    setCacheForTesting(db);

    // Website chat history is no longer exposed to normal members or team leads.
    const memberRes = await request(ctx.app)
      .get('/api/chat/history')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(memberRes.status).toBe(403);

    const leadRes = await request(ctx.app)
      .get('/api/chat/history')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);
    expect(leadRes.status).toBe(403);

    // Platform owner sees every company's history.
    const ownerRes = await request(ctx.app)
      .get('/api/chat/history')
      .set('Authorization', `Bearer ${ctx.tokens.owner}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.map((m: any) => m.id).sort()).toEqual(['chat-a1', 'chat-a2', 'chat-b1', 'chat-b2']);

    // A member of the platform-root team is the only non-admin path in.
    const rootTeam = {
      id: 'team-policy-root',
      leadUserId: ctx.users.owner.id,
      referralCode: 'POLROOT',
      isPlatformRoot: true,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(rootTeam);
    seedMockTeamMemberForTesting({
      teamId: rootTeam.id,
      userId: ctx.users.memberB.id,
      status: 'approved',
      approvedBy: rootTeam.leadUserId,
      joinedAt: new Date(),
    });

    const rootMemberRes = await request(ctx.app)
      .get('/api/chat/history')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(rootMemberRes.status).toBe(200);
    expect(rootMemberRes.body.data.map((m: any) => m.id).sort()).toEqual(['chat-b2']);
  });

  it('16. short links are private to their creator', async () => {
    const created = await request(ctx.app)
      .post('/api/admin/short-links')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
      .send({ target_url: 'https://bdsdanang.site/property/prop-a1', slug: `policy-${Date.now()}` });
    expect(created.status).toBe(200);
    const linkId = created.body.data.id;

    const foreignPatch = await request(ctx.app)
      .patch(`/api/admin/short-links/${linkId}`)
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`)
      .send({ title: 'hijacked' });
    expect(foreignPatch.status).toBe(403);
    expect(foreignPatch.body.message).toContain('không có quyền');

    const ownList = await request(ctx.app)
      .get('/api/admin/short-links')
      .set('Authorization', `Bearer ${ctx.tokens.memberA}`);
    expect(ownList.body.data.some((link: any) => link.id === linkId)).toBe(true);

    const foreignList = await request(ctx.app)
      .get('/api/admin/short-links')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(foreignList.status).toBe(200);
    expect(foreignList.body.data.some((link: any) => link.id === linkId)).toBe(false);
  });

  it('17. team lead cannot list members of another team via ?teamId=', async () => {
    seedTeams();
    // Admin A leads team A; member B belongs to team B.
    const res = await request(ctx.app)
      .get(`/api/team/members?teamId=${teamB.id}`)
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);
    expect(res.status).toBe(200);
    const userIds = res.body.data.map((m: any) => m.userId);
    expect(userIds).toContain('user-member-a');
    expect(userIds).not.toContain('user-member-b');
  });

  it('18. platform admin routes stay closed to entitled members', async () => {
    seedTeams();
    for (const [method, path] of [
      ['post', '/api/knowledge/reset'],
      ['post', '/api/decision-center/rules/reset'],
      ['post', '/api/ai-gateway/chat'],
      ['get', '/api/executive/snapshot'],
      ['get', '/api/control-plane/status'],
    ] as const) {
      const res = await (request(ctx.app) as any)[method](path)
        .set('Authorization', `Bearer ${ctx.tokens.memberA}`)
        .send({});
      expect([402, 403], `${method.toUpperCase()} ${path}`).toContain(res.status);
    }
  });

  it('19. platform-root membership alone grants no website chat data', async () => {
    const rootTeam = {
      id: 'team-policy-root',
      leadUserId: ctx.users.owner.id,
      referralCode: 'ROOTPOL',
      isPlatformRoot: true,
      createdAt: new Date(),
    };
    seedMockTeamForTesting(rootTeam);
    seedMockTeamMemberForTesting({
      teamId: rootTeam.id,
      userId: ctx.users.memberB.id,
      status: 'approved',
      approvedBy: rootTeam.leadUserId,
      joinedAt: new Date(),
    });

    const resolved = await resolvePermissions(ctx.users.memberB);
    expect(resolved.isPlatformRootTeam).toBe(true);
    expect(resolved.permissions['website_chat'].hasAccess).toBe(false);

    const res = await request(ctx.app)
      .get('/api/chat/guests')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(res.status).toBe(402);

    seedMockEntitlementForTesting({
      id: 'ent-guest-policy',
      subjectType: 'team',
      subjectId: rootTeam.id,
      plan: 'enterprise',
      features: ['website_chat'],
      startsAt: new Date(Date.now() - 10_000),
      expiresAt: new Date(Date.now() + 3_600_000),
      source: 'manual',
      grantedBy: 'system',
    });

    const granted = await request(ctx.app)
      .get('/api/chat/guests')
      .set('Authorization', `Bearer ${ctx.tokens.memberB}`);
    expect(granted.status).toBe(200);
  });

  it('20. raw company admin sees the whole company but not other companies', async () => {
    seedTeams();
    const db = readDatabase() as any;
    db.properties.push({
      id: 'prop-a2-by-member',
      title: 'Property created by member A',
      price: 1.5,
      area: 60,
      status: 'active',
      company_id: 'comp-alpha',
      owner_user_id: ctx.users.memberA.id,
      team_id: teamA.id,
      created_at: new Date().toISOString(),
    });
    setCacheForTesting(db);

    const res = await request(ctx.app)
      .get('/api/properties')
      .set('Authorization', `Bearer ${ctx.tokens.companyAdminA}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((p: any) => p.id);
    expect(ids).toContain('prop-a1');
    expect(ids).toContain('prop-a2-by-member');
    expect(ids).not.toContain('prop-b1');
  });
});
