import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/bootstrap/createApp';
import { mountRoutes } from '../../server/bootstrap/mountRoutes';
import { setCacheForTesting, getUserById } from '../../server/dbHelper';
import { signToken, toAuthUser } from '../../server/modules/auth/authAccess';
import {
  resolveRequiredRole,
  MEMBER_EXPLICIT_ALLOWLIST,
  RBAC_PERMISSIONS_MATRIX,
  UserRole,
} from '../../server/security/rbac';

function extractRoutes(app: any): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];

  function print(path: string[], layer: any) {
    if (layer.route) {
      const routePath = layer.route?.path;
      const fullPath = [...path, routePath]
        .filter(Boolean)
        .join('')
        .replace(/\/+/g, '/');
      const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase());
      for (const method of methods) {
        routes.push({ method, path: fullPath });
      }
    } else if (layer.name === 'router' && layer.handle.stack) {
      let routerPath = '';
      if (layer.regexp) {
        // Express converts paths to regexps
        const match = layer.regexp.source
          .replace('\\/?(?=\\/|$)', '')
          .replace('^\\', '')
          .replace('\\/?$', '')
          .replace(/\\\//g, '/')
          .replace('(?=\\/|$)', '');
        if (match && !match.startsWith('^') && !match.includes('.*')) {
          routerPath = match.startsWith('/') ? match : `/${match}`;
        }
      }
      layer.handle.stack.forEach((subLayer: any) => {
        print([...path, routerPath], subLayer);
      });
    }
  }

  if (app._router && app._router.stack) {
    app._router.stack.forEach((layer: any) => {
      print([], layer);
    });
  }

  return routes;
}

describe('P4 Route Registry & Role Resolution Verification', () => {
  let app: any;
  let memberToken: string;
  let ownerToken: string;
  let extractedApiRoutes: Array<{ method: string; path: string }> = [];

  beforeEach(() => {
    app = createApp({ facebookGraphLegacyEnabled: true });
    mountRoutes(app, { facebookGraphLegacyEnabled: true, agentEnabled: true });

    setCacheForTesting({
      companies: [
        { id: 'comp-1', name: 'Công ty Test', status: 'active', created_at: new Date().toISOString() },
      ],
      users: [
        {
          id: 'u-owner-1',
          name: 'Owner Admin',
          email: 'owner@test.com',
          role: 'owner',
          status: 'active',
          token_version: 1,
          must_change_password: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 'u-member-1',
          name: 'Member User',
          email: 'member@test.com',
          role: 'member',
          company_id: 'comp-1',
          status: 'active',
          token_version: 1,
          must_change_password: false,
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
      companies: [{ id: 'comp-1', name: 'Công ty Test', status: 'active', created_at: new Date().toISOString() }],
      users: [],
    };

    memberToken = signToken(toAuthUser(getUserById('u-member-1')!, db as any));
    ownerToken = signToken(toAuthUser(getUserById('u-owner-1')!, db as any));
  });

  it('1. Extracts all /api/* routes from live mounted app and verifies explicit role resolution', () => {
    extractedApiRoutes = extractRoutes(app).filter(r => r.path.startsWith('/api'));
    expect(extractedApiRoutes.length).toBeGreaterThan(0);

    // Filter out public routes that bypass auth gate
    const publicPrefixes = ['/api/public', '/api/health', '/api/social/media/files'];
    const protectedApiRoutes = extractedApiRoutes.filter(
      r => !publicPrefixes.some(p => r.path.startsWith(p)) && r.path !== '/api/auth/login'
    );

    expect(protectedApiRoutes.length).toBeGreaterThan(20);

    for (const route of protectedApiRoutes) {
      const resolvedRole = resolveRequiredRole(route.method, route.path);
      // Every protected route must resolve to an explicit role
      expect(['owner', 'company', 'member']).toContain(resolvedRole);
    }
  });

  it('2. Member receives 403 on protected company/owner routes', async () => {
    // Critical company/owner routes must deny member access with 403
    const restrictedRoutes = [
      { method: 'get', path: '/api/users' },
      { method: 'get', path: '/api/settings' },
      { method: 'get', path: '/api/investor-leads' },
      { method: 'get', path: '/api/admin/short-links' },
      { method: 'get', path: '/api/executive/snapshot' },
      { method: 'get', path: '/api/decision-center/rules' },
      { method: 'get', path: '/api/knowledge/stats' },
      { method: 'get', path: '/api/planning/campaigns' },
      { method: 'get', path: '/api/sales/pipeline' },
      { method: 'get', path: '/api/lead-acquisition/channels' },
      { method: 'get', path: '/api/agent/telegram/console/status' },
      { method: 'post', path: '/api/agent/telegram/console/start' },
    ];

    for (const { method, path } of restrictedRoutes) {
      const res = await (request(app) as any)[method](path)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status, `Expected 403 for member on ${method.toUpperCase()} ${path}`).toBe(403);
      expect(res.body.message).toContain('Bạn không có quyền thực hiện thao tác này');
    }
  });

  it('3. Member receives non-403 on routes declared in MEMBER_EXPLICIT_ALLOWLIST', async () => {
    const memberAllowedRoutes = [
      { method: 'get', path: '/api/auth/me' },
      { method: 'get', path: '/api/customers' },
      { method: 'get', path: '/api/properties' },
      { method: 'get', path: '/api/appointments' },
      { method: 'get', path: '/api/chat/history' },
      { method: 'get', path: '/api/posts' },
      { method: 'get', path: '/api/inbox' },
      { method: 'get', path: '/api/blog/posts' },
      { method: 'get', path: '/api/blog/categories' },
      { method: 'get', path: '/api/blog/tags' },
    ];

    for (const { method, path } of memberAllowedRoutes) {
      const res = await (request(app) as any)[method](path)
        .set('Authorization', `Bearer ${memberToken}`);

      // Crucial: Must NOT be 403 Forbidden!
      expect(res.status, `Expected non-403 for member on ${method.toUpperCase()} ${path}`).not.toBe(403);
    }
  });
});
