import type { Request, Response, NextFunction } from 'express';
import { getAuthUser } from '../modules/auth/authAccess';

export type UserRole = 'owner' | 'company' | 'member';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 3,
  company: 2,
  member: 1,
};

/**
 * Require a specific role or higher in hierarchy.
 * 'owner' -> owner only
 * 'company' -> owner or company
 * 'member' -> any authenticated user
 */
export function requireRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[user.role as UserRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      res.status(403).json({
        status: 'error',
        message: `Bạn không có quyền thực hiện thao tác này (yêu cầu vai trò: ${minRole}).`,
      });
      return;
    }

    next();
  };
}

/**
 * Explicit allowlist of routes that a 'member' is authorized to access.
 * Any authenticated route NOT matched in this allowlist will require at least 'company' (or 'owner').
 */
export const MEMBER_EXPLICIT_ALLOWLIST: string[] = [
  // Authentication & Profile of current user
  'GET /api/auth/me',
  'PUT /api/auth/profile',

  // Customers (CRM for sales/member daily work - scoped by company & ownership)
  'GET /api/customers',
  'POST /api/customers',
  'GET /api/customers/:id',
  'PUT /api/customers/:id',
  'DELETE /api/customers/:id',
  'POST /api/ai/analyze-customer',

  // Properties (inventory browsing & adding - scoped by company)
  'GET /api/properties',
  'POST /api/properties',
  'GET /api/properties/:id',
  'PUT /api/properties/:id',
  'DELETE /api/properties/:id',
  'POST /api/ai/generate-content',

  // Appointments (daily schedule for members)
  'GET /api/appointments',
  'POST /api/appointments',
  'PATCH /api/appointments/:id',
  'PUT /api/appointments/:id',
  'DELETE /api/appointments/:id',

  // Chat AI assistant (member conversation)
  'GET /api/chat/history',
  'POST /api/chat/send',
  'DELETE /api/chat/sessions/:sessionUserId',

  // Posts & Marketing Drafts (member authoring)
  'GET /api/posts',
  'GET /api/posts/:id',
  'POST /api/posts',
  'PUT /api/posts/:id',
  'DELETE /api/posts/:id',
  'POST /api/generate-content',
  'POST /api/upload',

  // Inbox & Chat Replies (sales answering leads)
  'GET /api/inbox',
  'GET /api/inbox/:id',
  'PUT /api/inbox/:id',
  'POST /api/ai/generate-reply',
  'POST /api/inbox/:id/reply',

  // Blog contributor drafting
  'GET /api/blog/posts',
  'GET /api/blog/posts/:id',
  'POST /api/blog/posts',
  'PUT /api/blog/posts/:id',
  'GET /api/blog/categories',
  'GET /api/blog/tags',
  'GET /api/blog/authors',
];

/**
 * Route-level RBAC map to guarantee centralized permission declaration.
 * Key: METHOD /path-pattern
 * Value: minimum required role
 */
export const RBAC_PERMISSIONS_MATRIX: Record<string, UserRole> = {
  // Knowledge Base: only owner for dangerous resets & imports; company+ for other management
  'POST /api/knowledge/reset': 'owner',
  'POST /api/knowledge/import': 'owner',
  'GET /api/knowledge/export': 'owner',
  'GET /api/knowledge/stats': 'company',
  'GET /api/knowledge/concepts': 'company',
  'POST /api/knowledge/concepts': 'company',
  'GET /api/knowledge/concepts/:id': 'company',
  'PUT /api/knowledge/concepts/:id': 'company',
  'DELETE /api/knowledge/concepts/:id': 'company',
  'POST /api/knowledge/concepts/merge': 'company',
  'GET /api/knowledge/suggestions': 'company',
  'POST /api/knowledge/suggestions/:id/approve': 'company',
  'POST /api/knowledge/suggestions/:id/reject': 'company',

  // Decision Center: only owner for rules reset/save; company+ for view/evaluate
  'POST /api/decision-center/rules/reset': 'owner',
  'POST /api/decision-center/rules': 'owner',
  'DELETE /api/decision-center/rules/:id': 'owner',
  'GET /api/decision-center/rules': 'company',
  'POST /api/decision-center/evaluate': 'company',
  'GET /api/decision-center/decisions': 'company',
  'GET /api/decision-center/summary': 'company',

  // Telegram Console control plane: owner only
  'POST /api/agent/telegram/console/start': 'owner',
  'POST /api/agent/telegram/console/stop': 'owner',
  'GET /api/agent/telegram/console/status': 'owner',

  // AI Gateway: owner only for chat proxy; company+ for health/status/providers
  'POST /api/ai-gateway/chat': 'owner',
  'GET /api/ai-gateway/health': 'company',
  'GET /api/ai-gateway/status': 'company',
  'GET /api/ai-gateway/providers': 'company',

  // Users management & bulk permissions: company+ (scoped) or owner
  'GET /api/users': 'company',
  'POST /api/users': 'company',
  'PUT /api/users/:id': 'company',
  'DELETE /api/users/:id': 'company',
  'POST /api/member-permissions/bulk': 'company',

  // System settings: company+ to read, owner to write
  'GET /api/settings': 'company',
  'PUT /api/settings': 'owner',

  // Investor Leads & Magnets: owner or company only (PII data)
  'GET /api/investor-leads': 'company',
  'PATCH /api/investor-leads/:id/status': 'company',
  'POST /api/investor-leads/:id/convert-to-customer': 'company',
  'POST /api/investor-leads/:id/call': 'company',
  'GET /api/investor-leads/:id/events': 'company',
  'GET /api/lead-magnet-content': 'company',

  // Facebook inbox, comments, leads, and admin test connection: owner or company only
  'GET /api/admin/facebook/test-connection': 'company',
  'GET /api/facebook/inbox': 'company',
  'GET /api/facebook/inbox/:id': 'company',
  'PATCH /api/facebook/inbox/:id/status': 'company',
  'GET /api/facebook/comments': 'company',
  'PATCH /api/facebook/comments/:id/status': 'company',
  'POST /api/facebook/comments/:id/create-lead': 'company',
  'GET /api/facebook/leads': 'company',
  'POST /api/facebook/conversations/:conversationId/link-lead/:leadId': 'company',
  'POST /api/facebook/conversations/:conversationId/create-lead': 'company',

  // Blog admin (publishing, uploads, AI drafts, categories, tags management): company+
  'POST /api/blog/upload-cover': 'company',
  'POST /api/blog/upload-content-image': 'company',
  'GET /api/blog/ai-drafts': 'company',
  'GET /api/blog/ai-drafts/:id': 'company',
  'POST /api/blog/ai-drafts': 'company',
  'POST /api/blog/parse-markdown': 'company',
  'POST /api/blog/ai/generate': 'company',
  'POST /api/blog/ai/assist': 'company',
  'POST /api/blog/ai/preview-checks': 'company',
  'POST /api/blog/posts/suggest': 'company',
  'DELETE /api/blog/posts/:id': 'company',
  'POST /api/blog/posts/import-markdown': 'company',
  'POST /api/blog/posts/:id/audit': 'company',
  'POST /api/blog/posts/:id/duplicate-check': 'company',
  'POST /api/blog/posts/:id/publish': 'company',
  'GET /api/blog/posts/:id/revisions': 'company',
  'GET /api/blog/posts/:id/seo-audits': 'company',
  'POST /api/blog/categories': 'company',
  'PUT /api/blog/categories/:id': 'company',
  'POST /api/blog/tags': 'company',

  // Short links admin: owner or company only
  'GET /api/admin/short-links': 'company',
  'POST /api/admin/short-links': 'company',
  'PUT /api/admin/short-links/:id': 'company',
  'DELETE /api/admin/short-links/:id': 'company',
  'GET /api/admin/short-links/:id/analytics': 'company',
  'POST /api/short-links/resolve': 'company',

  // Properties batch import & quick parse: owner or company only
  'POST /api/admin/properties/quick-parse': 'company',
  'POST /api/properties/quick-parse': 'company',
  'POST /api/admin/properties/batch-import': 'company',
  'POST /api/properties/batch-import': 'company',

  // Executive Dashboard & Execution Trace: owner or company only
  'GET /api/executive/snapshot': 'company',
  'GET /api/executive/briefing': 'company',
  'GET /api/executive/sources/:id/performance': 'company',
  'GET /api/executive/sources/:id/history': 'company',
  'GET /api/executive/buyers': 'company',
  'GET /api/executive/qualified': 'company',
  'GET /api/executive/urgent-buyers': 'company',
  'GET /api/executive/dashboard': 'company',
  'GET /api/executive/kpis': 'company',
  'GET /api/execution-trace': 'company',

  // Planning & Marketing Org: company+
  'GET /api/planning/campaigns': 'company',
  'POST /api/planning/campaigns': 'company',
  'GET /api/planning/campaigns/:id': 'company',
  'PUT /api/planning/campaigns/:id': 'company',
  'POST /api/planning/campaigns/:id/approve': 'company',
  'POST /api/planning/campaigns/:id/reject': 'company',
  'POST /api/planning/campaigns/:id/complete': 'company',
  'GET /api/marketing-org/structure': 'company',
  'POST /api/marketing-org/departments': 'company',
  'PUT /api/marketing-org/departments/:id': 'company',

  // Sales Layer & Lead Acquisition: company+
  'GET /api/sales/pipeline': 'company',
  'GET /api/sales/performance': 'company',
  'POST /api/sales/deals': 'company',
  'PUT /api/sales/deals/:id': 'company',
  'GET /api/lead-acquisition/channels': 'company',
  'POST /api/lead-acquisition/channels': 'company',
  'GET /api/lead-acquisition/metrics': 'company',

  // Agent Missions Control: company+
  'POST /api/agent/missions/:id/pause': 'company',
  'POST /api/agent/missions/:id/activate': 'company',
};

/**
 * Check whether a requested method + path matches a route pattern (with :param).
 */
export function matchesPattern(method: string, path: string, pattern: string): boolean {
  const [patMethod, patPath] = pattern.split(' ');
  if (method.toUpperCase() !== patMethod?.toUpperCase()) return false;
  if (!patPath) return false;

  const regexStr = '^' + patPath.replace(/:[a-zA-Z0-9_-]+/g, '[^/]+') + '$';
  return new RegExp(regexStr).test(path);
}

/**
 * Determine the minimum required role for a given route under deny-by-default RBAC.
 * 1. If explicitly in RBAC_PERMISSIONS_MATRIX -> return mapped role ('owner' | 'company' | 'member').
 * 2. Else if explicitly in MEMBER_EXPLICIT_ALLOWLIST -> return 'member'.
 * 3. Default fallback (Deny-by-default) -> return 'company' (blocks 'member').
 */
export function resolveRequiredRole(method: string, path: string): UserRole {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.replace(/\/+$/, '') || '/';
  const routeKey = `${normalizedMethod} ${normalizedPath}`;

  // 1. Direct or pattern match in RBAC matrix
  if (RBAC_PERMISSIONS_MATRIX[routeKey]) {
    return RBAC_PERMISSIONS_MATRIX[routeKey]!;
  }
  for (const [pattern, role] of Object.entries(RBAC_PERMISSIONS_MATRIX)) {
    if (matchesPattern(normalizedMethod, normalizedPath, pattern)) {
      return role;
    }
  }

  // 2. Direct or pattern match in Member Allowlist
  if (MEMBER_EXPLICIT_ALLOWLIST.includes(routeKey)) {
    return 'member';
  }
  for (const pattern of MEMBER_EXPLICIT_ALLOWLIST) {
    if (matchesPattern(normalizedMethod, normalizedPath, pattern)) {
      return 'member';
    }
  }

  // 3. Deny-by-default: require company role
  return 'company';
}

/**
 * Middleware that validates the incoming request against RBAC_PERMISSIONS_MATRIX and Deny-by-Default rule.
 */
export function rbacRouteGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+$/, '') || '/';
    const requiredRole = resolveRequiredRole(req.method, fullPath);
    return requireRole(requiredRole)(req, res, next);
  };
}
