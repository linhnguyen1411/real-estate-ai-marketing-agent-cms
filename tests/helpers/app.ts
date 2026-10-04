import { createApp } from '../../server/bootstrap/createApp';
import { mountRoutes } from '../../server/bootstrap/mountRoutes';
import { setCacheForTesting } from '../../server/dbHelper';
import { signToken, toAuthUser } from '../../server/modules/auth/authAccess';
import type { Express } from 'express';
import type { User, Company } from '../../src/types';

export interface TestContext {
  app: Express;
  companies: Company[];
  users: {
    owner: User;
    companyAdminA: User;
    companyAdminB: User;
    memberA: User;
    memberB: User;
  };
  tokens: {
    owner: string;
    companyAdminA: string;
    companyAdminB: string;
    memberA: string;
    memberB: string;
  };
}

export function createTestApp(): TestContext {
  const companyA: Company = {
    id: 'comp-alpha',
    name: 'Công ty Bất Động Sản Alpha',
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const companyB: Company = {
    id: 'comp-beta',
    name: 'Công ty Địa Ốc Beta',
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const owner: User = {
    id: 'user-owner-1',
    name: 'Platform Owner',
    email: 'owner@bdsdanang.site',
    password: 'mocked-hash-password',
    role: 'owner',
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const companyAdminA: User = {
    id: 'user-admin-a',
    name: 'Admin Alpha',
    email: 'admin@alpha.vn',
    password: 'mocked-hash-password',
    role: 'company',
    company_id: companyA.id,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const companyAdminB: User = {
    id: 'user-admin-b',
    name: 'Admin Beta',
    email: 'admin@beta.vn',
    password: 'mocked-hash-password',
    role: 'company',
    company_id: companyB.id,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const memberA: User = {
    id: 'user-member-a',
    name: 'Môi Giới Alpha',
    email: 'member@alpha.vn',
    password: 'mocked-hash-password',
    role: 'member',
    company_id: companyA.id,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const memberB: User = {
    id: 'user-member-b',
    name: 'Môi Giới Beta',
    email: 'member@beta.vn',
    password: 'mocked-hash-password',
    role: 'member',
    company_id: companyB.id,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const companies = [companyA, companyB];
  const users = [owner, companyAdminA, companyAdminB, memberA, memberB];

  const mockDb = {
    companies,
    users,
    customers: [
      {
        id: 'cust-a1',
        name: 'Khách hàng Alpha 1',
        phone: '0901111111',
        company_id: companyA.id,
        owner_user_id: companyAdminA.id,
        assigned_member_ids: [memberA.id],
        status: 'lead',
        created_at: new Date().toISOString(),
      },
      {
        id: 'cust-b1',
        name: 'Khách hàng Beta 1',
        phone: '0902222222',
        company_id: companyB.id,
        owner_user_id: companyAdminB.id,
        assigned_member_ids: [memberB.id],
        status: 'lead',
        created_at: new Date().toISOString(),
      },
    ],
    properties: [
      {
        id: 'prop-a1',
        title: 'Đất nền Alpha Hòa Xuân',
        price: 3.5,
        area: 100,
        company_id: companyA.id,
        owner_user_id: companyAdminA.id,
        assigned_member_ids: [memberA.id],
        status: 'active',
        created_at: new Date().toISOString(),
      },
      {
        id: 'prop-b1',
        title: 'Biệt thự Beta Cẩm Lệ',
        price: 9.5,
        area: 250,
        company_id: companyB.id,
        owner_user_id: companyAdminB.id,
        assigned_member_ids: [memberB.id],
        status: 'active',
        created_at: new Date().toISOString(),
      },
    ],
    posts: [],
    inbox: [],
    automations: [],
  };

  // Seed cache for testing
  setCacheForTesting(mockDb as any);

  const tokens = {
    owner: signToken(toAuthUser(owner, mockDb)),
    companyAdminA: signToken(toAuthUser(companyAdminA, mockDb)),
    companyAdminB: signToken(toAuthUser(companyAdminB, mockDb)),
    memberA: signToken(toAuthUser(memberA, mockDb)),
    memberB: signToken(toAuthUser(memberB, mockDb)),
  };

  const app = createApp({ facebookGraphLegacyEnabled: false });
  mountRoutes(app, {
    facebookGraphLegacyEnabled: false,
    agentEnabled: false,
  });

  return {
    app,
    companies,
    users: {
      owner,
      companyAdminA,
      companyAdminB,
      memberA,
      memberB,
    },
    tokens,
  };
}
