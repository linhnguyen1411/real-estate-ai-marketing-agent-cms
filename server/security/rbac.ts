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
 * Route-level RBAC map to guarantee centralized permission declaration.
 * Key: METHOD /path-pattern
 * Value: minimum required role
 */
export const RBAC_PERMISSIONS_MATRIX: Record<string, UserRole> = {
  // Knowledge Base: only owner for dangerous resets & imports; company+ for other management
  'POST /api/knowledge/reset': 'owner',
  'POST /api/knowledge/import': 'owner',
  'POST /api/knowledge/concepts': 'company',
  'DELETE /api/knowledge/concepts/:id': 'company',
  'POST /api/knowledge/concepts/merge': 'company',
  'POST /api/knowledge/suggestions/:id/approve': 'company',
  'POST /api/knowledge/suggestions/:id/reject': 'company',

  // Decision Center: only owner for rules reset/save; company+ for view/evaluate
  'POST /api/decision-center/rules/reset': 'owner',
  'POST /api/decision-center/rules': 'owner',
  'DELETE /api/decision-center/rules/:id': 'owner',

  // Telegram Console control plane: owner only
  'POST /api/agent/telegram/console/start': 'owner',
  'POST /api/agent/telegram/console/stop': 'owner',

  // AI Gateway: owner only for chat proxy
  'POST /api/ai-gateway/chat': 'owner',

  // Users management: company+ (scoped) or owner
  'GET /api/users': 'company',
  'POST /api/users': 'company',
  'PUT /api/users/:id': 'company',
  'DELETE /api/users/:id': 'company',

  // System settings: company+ to read, owner to write
  'GET /api/settings': 'company',
  'PUT /api/settings': 'owner',

  // Investor Leads: owner or company only (PII data)
  'GET /api/investor-leads': 'company',
  'POST /api/investor-leads': 'company',
  'GET /api/investor-leads/:id': 'company',
  'PATCH /api/investor-leads/:id': 'company',
  'DELETE /api/investor-leads/:id': 'company',

  // Facebook inbox, comments, leads: owner or company only
  'GET /api/facebook/inbox': 'company',
  'GET /api/facebook/comments': 'company',
  'GET /api/facebook/leads': 'company',

  // Blog admin (write/delete): owner or company only
  'POST /api/blog/posts': 'company',
  'PUT /api/blog/posts/:id': 'company',
  'DELETE /api/blog/posts/:id': 'company',
  'POST /api/blog/upload': 'company',

  // Short links admin: owner or company only
  'GET /api/admin/short-links': 'company',
  'POST /api/admin/short-links': 'company',
  'PUT /api/admin/short-links/:id': 'company',
  'DELETE /api/admin/short-links/:id': 'company',

  // Properties batch import: owner or company only
  'POST /api/properties/batch-import': 'company',

  // Executive Dashboard & Execution Trace: owner or company only
  'GET /api/executive/dashboard': 'company',
  'GET /api/executive/kpis': 'company',
  'GET /api/execution-trace': 'company',

  // Planning campaigns approve/reject: company+
  'POST /api/planning/campaigns/:id/approve': 'company',
  'POST /api/planning/campaigns/:id/reject': 'company',
  'POST /api/planning/campaigns/:id/complete': 'company',

  // Appointments admin: company+
  'GET /api/appointments': 'company',
  'POST /api/appointments': 'company',
  'PUT /api/appointments/:id': 'company',
  'DELETE /api/appointments/:id': 'company',

  // Chat session deletion: company+
  'DELETE /api/chat/sessions/:sessionUserId': 'company',
};

/**
 * Middleware that validates the incoming request against RBAC_PERMISSIONS_MATRIX
 */
export function rbacRouteGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    const routeKey = `${req.method.toUpperCase()} ${req.baseUrl}${req.path}`.replace(/\/+$/, '');
    
    // Check exact matches or parameterized matches
    let matchedMinRole: UserRole | undefined = RBAC_PERMISSIONS_MATRIX[routeKey];
    
    if (!matchedMinRole) {
      for (const [pattern, role] of Object.entries(RBAC_PERMISSIONS_MATRIX)) {
        const [method, pathPattern] = pattern.split(' ');
        if (req.method.toUpperCase() !== method) continue;
        
        const regexStr = '^' + pathPattern.replace(/:[a-zA-Z0-9_-]+/g, '[^/]+') + '$';
        if (new RegExp(regexStr).test(`${req.baseUrl}${req.path}`)) {
          matchedMinRole = role;
          break;
        }
      }
    }

    if (matchedMinRole) {
      return requireRole(matchedMinRole)(req, res, next);
    }

    next();
  };
}
