import { describe, it, expect } from 'vitest';
import { buildSourceScopeFilter } from '../../server/agent/agentDb';

describe('Agent source scope policy', () => {
  it('super admin sees every source, including system-wide ones', () => {
    expect(buildSourceScopeFilter({ role: 'owner' } as any)).toEqual({});
    expect(buildSourceScopeFilter({ role: 'super_admin' } as any)).toEqual({});
    expect(buildSourceScopeFilter({ role: 'member', roleKey: 'super_admin' } as any)).toEqual({});
  });

  it('company users see their own sources plus system-wide sources', () => {
    expect(buildSourceScopeFilter({ role: 'company', company_id: 'comp-alpha' } as any)).toEqual({
      OR: [{ companyId: 'comp-alpha' }, { companyId: null }],
    });
    expect(buildSourceScopeFilter({ role: 'member', company_id: 'comp-beta' } as any)).toEqual({
      OR: [{ companyId: 'comp-beta' }, { companyId: null }],
    });
  });

  it('users without a company only get system-wide sources', () => {
    expect(buildSourceScopeFilter({ role: 'member' } as any)).toEqual({
      OR: [{ companyId: '__none__' }, { companyId: null }],
    });
  });
});
