import type { Request, Response, NextFunction } from 'express';
import { getAuthUser } from '../auth/authAccess';
import {
  type PermissionKey,
  type PermissionScope,
  type RoleKey,
  type UserEffectivePermission,
} from './rbacTypes';
import { resolvePermissions, matchesFeature, type AuthUserInput } from './rbacService';

declare global {
  namespace Express {
    interface Request {
      scope?: PermissionScope;
      teamId?: string;
      userState?: RoleKey;
      userPermissions?: Record<PermissionKey, UserEffectivePermission>;
      activeEntitlementFeatures?: Set<string>;
      _rbacPermissionChecked?: PermissionKey;
    }
  }
}

/**
 * Public allowlist for paths that do not require RBAC checks
 */
export const PUBLIC_ALLOWLIST_PATTERNS = [
  /^\/healthz$/,
  /^\/readyz$/,
  /^\/api\/health$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/verify-otp$/,
  /^\/api\/auth\/forgot-password$/,
  /^\/api\/auth\/reset-password$/,
  /^\/api\/auth\/captcha$/,
  /^\/api\/public(\/.*)?$/,
  /^\/api\/social\/media\/files(\/.*)?$/,
  /^\/api\/short-links\/r(\/.*)?$/,
  /^\/api\/blog\/(posts|categories|tags)(\/.*)?$/,
  /^\/api\/chat\/guest(\/.*)?$/,
  /^\/api\/chat\/public(\/.*)?$/,
  /^\/api\/appointments\/public(\/.*)?$/,
  /^\/api\/agent-ingest(\/.*)?$/,
  /^\/api\/license\/(activate|heartbeat|refresh-token)$/,
  /^\/api\/webhooks\/telegram(\/.*)?$/,
];

export function isPublicPath(path: string): boolean {
  return PUBLIC_ALLOWLIST_PATTERNS.some((pattern) => pattern.test(path));
}

export interface RoutePermissionRule {
  pattern: RegExp;
  method?: string;
  permission: PermissionKey;
}

export const ROUTE_PERMISSION_MAP: RoutePermissionRule[] = [
  // Dashboard & Navigation badges & Channels & Safe Settings Read
  { pattern: /^\/api\/dashboard(\/.*)?$/, permission: 'dashboard' },
  { pattern: /^\/api\/navigation-counts(\/.*)?$/, permission: 'dashboard' },
  { pattern: /^\/api\/channels(\/.*)?$/, permission: 'dashboard' },
  { pattern: /^\/api\/settings$/, method: 'GET', permission: 'dashboard' },

  // Properties
  { pattern: /^\/api\/properties\/distribute/, permission: 'property.distribute' },
  { pattern: /^\/api\/properties\/batch-import/, permission: 'property.write' },
  { pattern: /^\/api\/admin\/properties\/batch-import/, permission: 'property.write' },
  { pattern: /^\/api\/properties\/quick-parse/, permission: 'property.write' },
  { pattern: /^\/api\/admin\/properties\/quick-parse/, permission: 'property.write' },
  { pattern: /^\/api\/ai\/generate-content(\/.*)?$/, permission: 'property.write' },
  { pattern: /^\/api\/properties(\/.*)?$/, method: 'GET', permission: 'property.read' },
  { pattern: /^\/api\/properties(\/.*)?$/, method: 'POST', permission: 'property.write' },
  { pattern: /^\/api\/properties(\/.*)?$/, method: 'PUT', permission: 'property.write' },
  { pattern: /^\/api\/properties(\/.*)?$/, method: 'DELETE', permission: 'property.write' },

  // Customers (CRM)
  { pattern: /^\/api\/customers(\/.*)?$/, permission: 'crm' },
  { pattern: /^\/api\/ai\/analyze-customer/, permission: 'crm' },

  // Internal AI Chatbot
  { pattern: /^\/api\/ai\/chat/, permission: 'chatbot.use' },
  { pattern: /^\/api\/chat\/history/, permission: 'chatbot.use' },
  { pattern: /^\/api\/chat\/sessions(\/.*)?$/, permission: 'chatbot.use' },

  // Website Chat Admin (requires platform root team)
  { pattern: /^\/api\/chat\/guests(\/.*)?$/, permission: 'website_chat' },

  // Shortlinks
  { pattern: /^\/api\/short-links(\/.*)?$/, permission: 'shortlink.manage' },
  { pattern: /^\/api\/admin\/short-links(\/.*)?$/, permission: 'shortlink.manage' },

  // Facebook Inbox
  { pattern: /^\/api\/facebook(\/.*)?$/, permission: 'fb_inbox' },
  { pattern: /^\/api\/admin\/facebook(\/.*)?$/, permission: 'fb_inbox' },
  { pattern: /^\/api\/inbox(\/.*)?$/, permission: 'fb_inbox' },
  { pattern: /^\/api\/ai\/generate-reply(\/.*)?$/, permission: 'fb_inbox' },

  // Investor Leads
  { pattern: /^\/api\/investor-leads(\/.*)?$/, permission: 'investor_leads' },
  { pattern: /^\/api\/lead-magnet-content(\/.*)?$/, permission: 'investor_leads' },

  // Agent Modules
  { pattern: /^\/api\/planning(\/.*)?$/, permission: 'agent.runtime' },
  { pattern: /^\/api\/knowledge(\/.*)?$/, permission: 'agent.sources' },
  { pattern: /^\/api\/decision-center(\/.*)?$/, permission: 'agent.runtime' },
  { pattern: /^\/api\/executive(\/.*)?$/, permission: 'agent.reports' },
  { pattern: /^\/api\/sales(\/.*)?$/, permission: 'lead.intel' },
  { pattern: /^\/api\/marketing-org(\/.*)?$/, permission: 'agent.sources' },
  { pattern: /^\/api\/lead-acquisition(\/.*)?$/, permission: 'agent.sources' },
  { pattern: /^\/api\/execution-trace(\/.*)?$/, permission: 'agent.runtime' },
  { pattern: /^\/api\/ai-gateway(\/.*)?$/, permission: 'agent.runtime' },
  { pattern: /^\/api\/agent\/notifications(\/.*)?$/, permission: 'agent.notifications' },
  { pattern: /^\/api\/agent\/reports(\/.*)?$/, permission: 'agent.reports' },
  { pattern: /^\/api\/agent\/sources(\/.*)?$/, permission: 'agent.sources' },
  { pattern: /^\/api\/agent(\/.*)?$/, permission: 'agent.runtime' },
  { pattern: /^\/api\/control-plane(\/.*)?$/, permission: 'agent.runtime' },
  { pattern: /^\/api\/telegram(\/.*)?$/, permission: 'agent.notifications' },
  { pattern: /^\/api\/social(\/.*)?$/, permission: 'agent.sources' },

  // Appointments
  { pattern: /^\/api\/appointments(\/.*)?$/, permission: 'appointments.manage' },

  // Blog admin & Posts
  { pattern: /^\/api\/blog(\/.*)?$/, permission: 'seo_blog.admin' },
  { pattern: /^\/api\/posts(\/.*)?$/, method: 'GET', permission: 'property.read' },
  { pattern: /^\/api\/posts(\/.*)?$/, permission: 'property.write' },
  { pattern: /^\/api\/seo(\/.*)?$/, permission: 'seo_blog.admin' },

  // Projects admin
  { pattern: /^\/api\/projects\/admin(\/.*)?$/, permission: 'projects.admin' },

  // Content & Automations
  { pattern: /^\/api\/content(\/.*)?$/, permission: 'ai_content.admin' },
  { pattern: /^\/api\/automations(\/.*)?$/, permission: 'automation.admin' },

  // User management
  { pattern: /^\/api\/users(\/.*)?$/, permission: 'user.manage' },
  { pattern: /^\/api\/member-permissions\/bulk(\/.*)?$/, permission: 'team.permissions.edit' },

  // System settings
  { pattern: /^\/api\/settings(\/.*)?$/, permission: 'settings.system' },

  // Team & License & Matrix
  { pattern: /^\/api\/team\/members(\/.*)?$/, permission: 'team.members.manage' },
  { pattern: /^\/api\/team\/permissions(\/.*)?$/, permission: 'team.permissions.edit' },
  { pattern: /^\/api\/team(\/.*)?$/, permission: 'team.members.manage' },
  { pattern: /^\/api\/rbac(\/.*)?$/, permission: 'rbac.matrix' },
  { pattern: /^\/api\/entitlements(\/.*)?$/, permission: 'entitlement' },
  { pattern: /^\/api\/admin\/licenses(\/.*)?$/, permission: 'license.manage' },
  { pattern: /^\/api\/license\/(download-trial|my-license|my-key|request-pem|upgrade-plan)(\/.*)?$/, permission: 'tool.download' },
  { pattern: /^\/api\/tools\/download(\/.*)?$/, permission: 'tool.download' },

  // Wallet & Tokens
  { pattern: /^\/api\/wallet(\/.*)?$/, permission: 'tool.download' },
  { pattern: /^\/api\/admin\/wallets(\/.*)?$/, permission: 'license.manage' },
];

export function resolveRoutePermission(method: string, path: string): PermissionKey | null {
  const normMethod = method.toUpperCase();
  for (const rule of ROUTE_PERMISSION_MAP) {
    if (rule.method && rule.method !== normMethod) continue;
    if (rule.pattern.test(path)) {
      return rule.permission;
    }
  }
  return null;
}

/**
 * Middleware: require a specific RBAC permission.
 * Sets req.scope, req.teamId, req.userState.
 * Returns 401 if unauthenticated.
 * Returns 402 if premium is required but user has no entitlement.
 * Returns 403 if user lacks permission or has scope 'none'.
 */
export function requirePermission(permissionKey: PermissionKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req._rbacPermissionChecked === permissionKey) {
        return next();
      }

      const authUser = getAuthUser(req);
      if (!authUser || !authUser.id) {
        res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
        return;
      }

      const resolved = await resolvePermissions(authUser as AuthUserInput);
      const perm = resolved.permissions[permissionKey];

      if (!perm) {
        res.status(403).json({
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền thực hiện thao tác này.',
        });
        return;
      }

      if (perm.requiresPremiumUpgrade) {
        res.status(402).json({
          status: 'error',
          code: 'PREMIUM_REQUIRED',
          message: 'Tính năng này yêu cầu gói Premium.',
        });
        return;
      }

      if (!perm.hasAccess || perm.scope === 'none') {
        res.status(403).json({
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền thực hiện thao tác này.',
        });
        return;
      }

      // Attach context to req
      req.scope = perm.scope;
      req.teamId = resolved.teamId;
      req.userState = resolved.roleKey;
      req.userPermissions = resolved.permissions;
      req.activeEntitlementFeatures = resolved.activeEntitlementFeatures;
      req._rbacPermissionChecked = permissionKey;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware: require an active premium feature entitlement.
 */
export function requirePremium(feature: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !authUser.id) {
        res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
        return;
      }

      const resolved = await resolvePermissions(authUser as AuthUserInput);
      if (resolved.roleKey === 'super_admin' || matchesFeature(resolved.activeEntitlementFeatures, feature)) {
        next();
        return;
      }

      res.status(402).json({
        status: 'error',
        code: 'PREMIUM_REQUIRED',
        message: `Tính năng yêu cầu gói Premium (${feature}).`,
      });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Deny-by-default guard for all routes under /api
 */
export function denyByDefaultGuard() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const fullPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    const cleanPath = fullPath.replace(/\/+$/, '') || '/';

    // 1. Allow public routes
    if (isPublicPath(cleanPath) || isPublicPath(req.path)) {
      return next();
    }

    // 2. Allow self profile endpoints and basic app settings read
    if (
      cleanPath === '/api/auth/me' ||
      cleanPath === '/api/auth/profile' ||
      cleanPath === '/api/auth/my-team' ||
      cleanPath === '/api/auth/join-team' ||
      cleanPath === '/api/wallet/my' ||
      cleanPath === '/api/ai/status' ||
      (cleanPath === '/api/settings' && req.method === 'GET') ||
      (cleanPath === '/api/channels' && req.method === 'GET')
    ) {
      return next();
    }

    // 3. For all other /api routes, user must be authenticated
    const authUser = getAuthUser(req);
    if (!authUser || !authUser.id) {
      res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
      return;
    }

    // 4. Resolve permission for this route
    const permission = resolveRoutePermission(req.method, cleanPath);
    if (!permission) {
      // Deny-by-default: Route not declared in allowlist or permission map
      res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Tuyến đường chưa được khai báo quyền trong hệ thống (Deny-by-default).',
      });
      return;
    }

    // 5. Enforce resolved permission
    return requirePermission(permission)(req, res, next);
  };
}
