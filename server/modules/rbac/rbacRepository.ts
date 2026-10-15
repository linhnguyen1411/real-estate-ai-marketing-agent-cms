import crypto from 'crypto';
import { prisma } from '../../prisma';
import {
  type RoleKey,
  type PermissionKey,
  type PermissionScope,
  type RolePermissionRule,
  DEFAULT_ROLE_PERMISSIONS_MATRIX,
} from './rbacTypes';

export interface DbTeam {
  id: string;
  leadUserId: string;
  referralCode: string;
  isPlatformRoot: boolean;
  createdAt: Date;
}

export interface DbTeamMember {
  teamId: string;
  userId: string;
  status: 'pending' | 'approved' | 'suspended';
  approvedBy: string | null;
  joinedAt: Date;
}

export interface DbTeamPermissionOverride {
  teamId: string;
  permissionKey: string;
  scope: PermissionScope;
}

export interface DbEntitlement {
  id: string;
  subjectType: 'user' | 'team';
  subjectId: string;
  plan: string;
  features: string[];
  startsAt: Date;
  expiresAt: Date;
  source: string;
  grantedBy: string | null;
}

export interface DbPropertyAssignment {
  id: string;
  propertyId: string;
  assignedBy: string;
  assignedTo: string;
  assignedAt: Date;
  assigned_by?: string;
  assigned_to?: string;
  assigned_at?: string;
}

// In-memory fallback stores for testing / offline environments
const memoryTeams = new Map<string, DbTeam>();
const memoryTeamMembers = new Map<string, DbTeamMember>(); // key: userId
const memoryOverrides = new Map<string, DbTeamPermissionOverride>(); // key: teamId:permissionKey
const memoryEntitlements = new Map<string, DbEntitlement>(); // key: id
const memoryPropertyAssignments = new Map<string, DbPropertyAssignment>(); // key: id
let memoryRolePermissions: RolePermissionRule[] = [...DEFAULT_ROLE_PERMISSIONS_MATRIX];

export function resetRbacMemoryForTesting() {
  memoryTeams.clear();
  memoryTeamMembers.clear();
  memoryOverrides.clear();
  memoryEntitlements.clear();
  memoryPropertyAssignments.clear();
  memoryRolePermissions = [...DEFAULT_ROLE_PERMISSIONS_MATRIX];
}

export function seedMockTeamForTesting(team: DbTeam) {
  memoryTeams.set(team.id, team);
}

export function seedMockTeamMemberForTesting(member: DbTeamMember) {
  memoryTeamMembers.set(member.userId, member);
}

export function seedMockOverrideForTesting(override: DbTeamPermissionOverride) {
  memoryOverrides.set(`${override.teamId}:${override.permissionKey}`, override);
}

export function seedMockEntitlementForTesting(entitlement: DbEntitlement) {
  memoryEntitlements.set(entitlement.id, entitlement);
}

function shouldUsePrisma(): boolean {
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_TEST_DB) {
    return false;
  }
  return true;
}

export async function getTeamById(teamId: string): Promise<DbTeam | null> {
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.team.findUnique({ where: { id: teamId } });
      if (row) return row as DbTeam;
    } catch {
      // Fallback to memory
    }
  }
  return memoryTeams.get(teamId) || null;
}

export async function getTeamByLeadUserId(leadUserId: string): Promise<DbTeam | null> {
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.team.findUnique({ where: { leadUserId } });
      if (row) return row as DbTeam;
    } catch {
      // Fallback to memory
    }
  }
  for (const team of memoryTeams.values()) {
    if (team.leadUserId === leadUserId) return team;
  }
  return null;
}

export async function getPlatformRootTeam(): Promise<DbTeam | null> {
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.team.findFirst({ where: { isPlatformRoot: true } });
      if (row) return row as DbTeam;
    } catch {
      // Fallback to memory
    }
  }
  for (const team of memoryTeams.values()) {
    if (team.isPlatformRoot) return team;
  }
  return null;
}

export async function getTeamMember(userId: string): Promise<DbTeamMember | null> {
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.teamMember.findUnique({ where: { userId } });
      if (row) return row as DbTeamMember;
    } catch {
      // Fallback to memory
    }
  }
  return memoryTeamMembers.get(userId) || null;
}

export const findTeamMember = getTeamMember;
export const findTeamById = getTeamById;

export async function getTeamByReferralCode(referralCode: string): Promise<DbTeam | null> {
  const norm = referralCode.trim().toUpperCase();
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.team.findUnique({ where: { referralCode: norm } });
      if (row) return row as DbTeam;
    } catch {
      // Fallback
    }
  }
  for (const team of memoryTeams.values()) {
    if (team.referralCode.toUpperCase() === norm) return team;
  }
  return null;
}

export async function createTeam(team: DbTeam): Promise<DbTeam> {
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.team.create({
        data: {
          id: team.id,
          leadUserId: team.leadUserId,
          referralCode: team.referralCode,
          isPlatformRoot: team.isPlatformRoot,
          createdAt: team.createdAt,
        },
      });
      return row as DbTeam;
    } catch {
      // Fallback
    }
  }
  memoryTeams.set(team.id, team);
  return team;
}

export async function createTeamMember(member: DbTeamMember): Promise<DbTeamMember> {
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.teamMember.create({
        data: {
          teamId: member.teamId,
          userId: member.userId,
          status: member.status,
          approvedBy: member.approvedBy,
          joinedAt: member.joinedAt,
        },
      });
      return row as DbTeamMember;
    } catch {
      // Fallback
    }
  }
  memoryTeamMembers.set(member.userId, member);
  return member;
}

export async function getTeamMembers(teamId: string): Promise<DbTeamMember[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.teamMember.findMany({ where: { teamId } });
      if (rows && rows.length > 0) return rows as DbTeamMember[];
    } catch {
      // Fallback
    }
  }
  const result: DbTeamMember[] = [];
  for (const m of memoryTeamMembers.values()) {
    if (m.teamId === teamId) result.push(m);
  }
  return result;
}

export async function updateTeamMemberStatus(
  teamId: string,
  userId: string,
  status: 'approved' | 'suspended',
  approvedBy?: string
): Promise<DbTeamMember | null> {
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.teamMember.update({
        where: { userId },
        data: {
          status,
          ...(approvedBy ? { approvedBy } : {}),
        },
      });
      return row as DbTeamMember;
    } catch {
      // Fallback
    }
  }
  const m = memoryTeamMembers.get(userId);
  if (!m || m.teamId !== teamId) return null;
  m.status = status;
  if (approvedBy) m.approvedBy = approvedBy;
  return m;
}

export async function rotateTeamReferralCode(teamId: string): Promise<string> {
  const newCode = generateReferralCode();
  if (shouldUsePrisma()) {
    try {
      await prisma.team.update({
        where: { id: teamId },
        data: { referralCode: newCode },
      });
    } catch {
      // Fallback
    }
  }
  const team = memoryTeams.get(teamId);
  if (team) {
    team.referralCode = newCode;
  }
  return newCode;
}

export async function upsertTeamPermissionOverride(
  teamId: string,
  permissionKey: string,
  scope: PermissionScope
): Promise<void> {
  if (shouldUsePrisma()) {
    try {
      await prisma.teamPermissionOverride.upsert({
        where: {
          teamId_permissionKey: {
            teamId,
            permissionKey,
          },
        },
        create: {
          teamId,
          permissionKey,
          scope,
        },
        update: {
          scope,
        },
      });
      return;
    } catch {
      // Fallback
    }
  }
  memoryOverrides.set(`${teamId}:${permissionKey}`, { teamId, permissionKey, scope });
}

export async function getTeamPermissionOverrides(teamId: string): Promise<Record<string, PermissionScope>> {
  const result: Record<string, PermissionScope> = {};
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.teamPermissionOverride.findMany({ where: { teamId } });
      if (rows && rows.length > 0) {
        for (const row of rows) {
          result[row.permissionKey] = row.scope as PermissionScope;
        }
        return result;
      }
    } catch {
      // Fallback to memory
    }
  }
  for (const override of memoryOverrides.values()) {
    if (override.teamId === teamId) {
      result[override.permissionKey] = override.scope;
    }
  }
  return result;
}

export async function getAllRolePermissions(): Promise<RolePermissionRule[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.rolePermission.findMany();
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          roleKey: r.roleKey as RoleKey,
          permissionKey: r.permissionKey as PermissionKey,
          scope: r.scope as PermissionScope,
          premiumOnly: r.premiumOnly,
        }));
      }
    } catch {
      // Fallback to memory
    }
  }
  return memoryRolePermissions;
}

export async function getActiveEntitlements(
  subjectType: 'user' | 'team',
  subjectId: string,
  now: Date = new Date()
): Promise<DbEntitlement[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.entitlement.findMany({
        where: {
          subjectType,
          subjectId,
          startsAt: { lte: now },
          expiresAt: { gte: now },
        },
      });
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          subjectType: r.subjectType as 'user' | 'team',
          subjectId: r.subjectId,
          plan: r.plan,
          features: Array.isArray(r.features) ? (r.features as string[]) : [],
          startsAt: r.startsAt,
          expiresAt: r.expiresAt,
          source: r.source,
          grantedBy: r.grantedBy,
        }));
      }
    } catch {
      // Fallback to memory
    }
  }
  const result: DbEntitlement[] = [];
  for (const ent of memoryEntitlements.values()) {
    if (
      ent.subjectType === subjectType &&
      ent.subjectId === subjectId &&
      ent.startsAt <= now &&
      ent.expiresAt >= now
    ) {
      result.push(ent);
    }
  }
  return result;
}

export function generateReferralCode(): string {
  return crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 chars
}

/**
 * Seed default role permissions matrix into DB (idempotent)
 */
export async function seedRolePermissions(): Promise<void> {
  try {
    for (const rule of DEFAULT_ROLE_PERMISSIONS_MATRIX) {
      await prisma.rolePermission.upsert({
        where: {
          roleKey_permissionKey: {
            roleKey: rule.roleKey,
            permissionKey: rule.permissionKey,
          },
        },
        create: {
          roleKey: rule.roleKey,
          permissionKey: rule.permissionKey,
          scope: rule.scope,
          premiumOnly: rule.premiumOnly ?? false,
        },
        update: {
          scope: rule.scope,
          premiumOnly: rule.premiumOnly ?? false,
        },
      });
    }
  } catch (err) {
    // DB might be offline, fallback remains memory
  }
}

/**
 * Backfill RBAC root team and referral codes
 */
export async function backfillRbac(): Promise<void> {
  try {
    // 1. Seed permissions
    await seedRolePermissions();

    // 2. Check if platform root team exists
    const rootTeam = await prisma.team.findFirst({ where: { isPlatformRoot: true } });
    if (!rootTeam) {
      // Find owner or super_admin
      const ownerUser = await prisma.user.findFirst({
        where: {
          role: { in: ['owner', 'super_admin'] },
        },
      });
      if (ownerUser) {
        const teamId = `team-root-${ownerUser.id}`;
        await prisma.team.upsert({
          where: { leadUserId: ownerUser.id },
          create: {
            id: teamId,
            leadUserId: ownerUser.id,
            referralCode: generateReferralCode(),
            isPlatformRoot: true,
          },
          update: {
            isPlatformRoot: true,
          },
        });
      }
    }
  } catch {
    // DB offline, skip backfill
  }
}

export async function listAllEntitlements(): Promise<DbEntitlement[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.entitlement.findMany({ orderBy: { expiresAt: 'desc' } });
      if (rows) {
        return rows.map((r) => ({
          id: r.id,
          subjectType: r.subjectType as 'user' | 'team',
          subjectId: r.subjectId,
          plan: r.plan,
          features: Array.isArray(r.features) ? (r.features as string[]) : [],
          startsAt: r.startsAt,
          expiresAt: r.expiresAt,
          source: r.source,
          grantedBy: r.grantedBy,
        }));
      }
    } catch {
      // Fallback
    }
  }
  return Array.from(memoryEntitlements.values());
}

export async function createEntitlement(
  data: Omit<DbEntitlement, 'id'> & { id?: string }
): Promise<DbEntitlement> {
  const id = data.id || `ent-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const ent: DbEntitlement = {
    id,
    subjectType: data.subjectType,
    subjectId: data.subjectId,
    plan: data.plan,
    features: data.features,
    startsAt: data.startsAt,
    expiresAt: data.expiresAt,
    source: data.source,
    grantedBy: data.grantedBy,
  };
  if (shouldUsePrisma()) {
    try {
      await prisma.entitlement.create({
        data: {
          id: ent.id,
          subjectType: ent.subjectType,
          subjectId: ent.subjectId,
          plan: ent.plan,
          features: ent.features,
          startsAt: ent.startsAt,
          expiresAt: ent.expiresAt,
          source: ent.source,
          grantedBy: ent.grantedBy,
        },
      });
      return ent;
    } catch {
      // Fallback
    }
  }
  memoryEntitlements.set(ent.id, ent);
  return ent;
}

export async function deleteEntitlement(id: string): Promise<boolean> {
  if (shouldUsePrisma()) {
    try {
      await prisma.entitlement.delete({ where: { id } });
      return true;
    } catch {
      // Fallback
    }
  }
  return memoryEntitlements.delete(id);
}

export async function upsertRolePermission(
  roleKey: RoleKey,
  permissionKey: PermissionKey,
  scope: PermissionScope,
  premiumOnly?: boolean
): Promise<void> {
  if (shouldUsePrisma()) {
    try {
      await prisma.rolePermission.upsert({
        where: {
          roleKey_permissionKey: {
            roleKey,
            permissionKey,
          },
        },
        create: {
          roleKey,
          permissionKey,
          scope,
          premiumOnly: premiumOnly ?? false,
        },
        update: {
          scope,
          premiumOnly: premiumOnly ?? false,
        },
      });
      return;
    } catch {
      // Fallback
    }
  }
  const idx = memoryRolePermissions.findIndex(
    (r) => r.roleKey === roleKey && r.permissionKey === permissionKey
  );
  const rule: RolePermissionRule = {
    roleKey,
    permissionKey,
    scope,
    premiumOnly: premiumOnly ?? false,
  };
  if (idx >= 0) {
    memoryRolePermissions[idx] = rule;
  } else {
    memoryRolePermissions.push(rule);
  }
}

export async function createPropertyAssignment(data: {
  propertyId: string;
  assignedBy: string;
  assignedTo: string;
}): Promise<DbPropertyAssignment> {
  const assignedAt = new Date();
  const assignment: DbPropertyAssignment = {
    id: `pa-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    propertyId: data.propertyId,
    assignedBy: data.assignedBy,
    assignedTo: data.assignedTo,
    assignedAt,
    assigned_by: data.assignedBy,
    assigned_to: data.assignedTo,
    assigned_at: assignedAt.toISOString(),
  };
  if (shouldUsePrisma()) {
    try {
      await prisma.propertyAssignment.create({
        data: {
          id: assignment.id,
          propertyId: assignment.propertyId,
          assignedBy: assignment.assignedBy,
          assignedTo: assignment.assignedTo,
          assignedAt: assignment.assignedAt,
        },
      });
      return assignment;
    } catch {
      // Fallback
    }
  }
  memoryPropertyAssignments.set(assignment.id, assignment);
  return assignment;
}

export async function getPropertyAssignments(propertyId: string): Promise<DbPropertyAssignment[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.propertyAssignment.findMany({
        where: { propertyId },
        orderBy: { assignedAt: 'desc' },
      });
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          ...r,
          assigned_by: r.assignedBy,
          assigned_to: r.assignedTo,
          assigned_at: r.assignedAt ? r.assignedAt.toISOString() : undefined,
        }));
      }
    } catch {
      // Fallback
    }
  }
  const result: DbPropertyAssignment[] = [];
  for (const pa of memoryPropertyAssignments.values()) {
    if (pa.propertyId === propertyId) {
      result.push({
        ...pa,
        assigned_by: pa.assigned_by || pa.assignedBy,
        assigned_to: pa.assigned_to || pa.assignedTo,
        assigned_at: pa.assigned_at || (pa.assignedAt ? pa.assignedAt.toISOString() : undefined),
      });
    }
  }
  return result.sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime());
}

