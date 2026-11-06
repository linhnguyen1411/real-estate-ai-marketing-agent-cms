import { sendError } from '../../utils/httpResponses';
import { Router, type Request, type Response } from 'express';
import {
  getPublicChatGuests,
  readDatabase,
  updateSettings,
  verifyGeneratedContent,
  upsertCmsRecord,
} from '../../dbHelper';
import type { AppSettings, AutomationTask } from '../../../src/types';
import { buildCompanyScopeFilter, getAgentDashboardCounts } from '../../agent/agentDb';
import { prisma } from '../../prisma';
import { getPropertySaleStatus } from '../../../src/utils/propertyStatus';
import { listInvestorLeads } from '../../investorLeadDb';
import {
  maskSettingsSecrets,
  sendTestTelegram,
} from '../../notifications/telegramNotificationService';
import { testVpsConnection } from '../../agentSync/vpsClient';
import { getSyncOutboxStats, processOutboxBatch } from '../../agentSync/outboxService';
import {
  getAuthUser,
  requireOwner,
  canManageResource,
  scopeCollection,
} from '../auth/authAccess';
import { isSuperAdminUser } from '../auth/tenantScope';
import { filterByScope } from '../rbac/rbacService';
import type { PermissionKey, PermissionScope } from '../rbac/rbacTypes';
import type { ExecutiveKpiDashboard, SnapshotMetric } from '../executive-dashboard/kpiTypes';

/** Effective scope granted by the permission engine for a feature. */
function permissionScopeFor(req: Request, key: PermissionKey): PermissionScope {
  const perm = req.userPermissions?.[key];
  if (!perm || !perm.hasAccess || perm.scope === 'none' || perm.requiresPremiumUpgrade) {
    return 'none';
  }
  return perm.scope;
}

function scopedByPermission<T extends {
  company_id?: string;
  owner_user_id?: string;
  created_by_user_id?: string;
  team_id?: string;
  assigned_member_ids?: string[];
}>(items: T[], req: Request, key: PermissionKey): T[] {
  const user = getAuthUser(req);
  if (isSuperAdminUser(user)) return items;
  const scope = permissionScopeFor(req, key);
  if (scope === 'none') return [];
  return filterByScope(items, scope, user.id, req.teamId, user.company_id, Boolean(req.companyWide));
}

/**
 * Personal dashboard for every non-super user. It never reads platform-wide
 * executives metrics — every number is filtered by the caller's effective
 * permission scope.
 */
async function buildScopedDashboard(req: Request): Promise<ExecutiveKpiDashboard> {
  const user = getAuthUser(req);
  const db = readDatabase();
  const base = '/my';

  const has = (key: PermissionKey) => permissionScopeFor(req, key) !== 'none';
  const customers = scopedByPermission(db.customers || [], req, 'crm');
  const properties = scopedByPermission(db.properties || [], req, 'property.read')
    .filter((p: any) => getPropertySaleStatus(p) !== 'hidden');
  const posts = scopedByPermission(db.posts || [], req, 'property.read');
  const inbox = scopedByPermission(db.inbox || [], req, 'fb_inbox');
  const pendingInbox = inbox.filter((i: any) => i.status === 'pending').length;
  const investorLeads = has('investor_leads')
    ? (await listInvestorLeads(1, { includeConverted: false }).catch(() => null))?.total ?? 0
    : 0;
  const websiteChat = has('website_chat') ? getPublicChatGuests().length : 0;

  const snapshot: SnapshotMetric[] = [];
  const push = (
    id: string,
    title: string,
    value: number,
    href: string,
    unit = '',
  ) => {
    snapshot.push({
      id,
      title,
      value: `${value}${unit}`,
      valueNumeric: value,
      trendVsYesterday: null,
      trendVs7d: null,
      trendDirection: null,
      href,
      hasData: true,
    });
  };

  if (has('crm')) push('customers', 'Khách hàng', customers.length, `${base}/crm`);
  if (has('property.read')) {
    push('properties', 'Bất động sản', properties.length, `${base}/properties`);
    push('posts', 'Nội dung', posts.length, `${base}/posts`);
  }
  if (has('fb_inbox')) push('pending_inbox', 'Inbox chờ xử lý', pendingInbox, `${base}/inbox`);
  if (has('investor_leads')) push('investor_leads', 'Leads đầu tư', investorLeads, `${base}/investor-leads`);
  if (has('website_chat')) push('website_chat', 'Chat khách website', websiteChat, `${base}/website-chat`);

  if (snapshot.length === 0) {
    push('profile', 'Hồ sơ cá nhân', 1, `${base}/profile`);
  }

  const insights: string[] = [];
  if (customers.length > 0) insights.push(`Bạn đang phụ trách ${customers.length} khách hàng.`);
  if (pendingInbox > 0) insights.push(`${pendingInbox} hội thoại đang chờ phản hồi.`);
  if (properties.length > 0) insights.push(`${properties.length} bất động sản trong phạm vi được phép truy cập.`);
  if (insights.length === 0) insights.push('Chưa có dữ liệu trong phạm vi quyền của bạn.');

  const recommendations = [];
  if (pendingInbox > 0) {
    recommendations.push({ id: 'answer_inbox', action: 'Trả lời', detail: `${pendingInbox} hội thoại`, href: `${base}/inbox` });
  }
  if (has('crm')) {
    recommendations.push({ id: 'open_crm', action: 'Mở', detail: 'Khách hàng CRM', href: `${base}/crm` });
  }
  if (has('property.read')) {
    recommendations.push({ id: 'open_properties', action: 'Xem', detail: 'Danh sách BĐS', href: `${base}/properties` });
  }

  const attention = pendingInbox > 0
    ? [{ severity: 'warning' as const, text: `${pendingInbox} hội thoại chờ xử lý`, href: `${base}/inbox` }]
    : [];

  const quickActions = [
    has('crm') ? { label: 'Khách hàng', href: `${base}/crm` } : null,
    has('property.read') ? { label: 'Bất động sản', href: `${base}/properties` } : null,
    has('fb_inbox') ? { label: 'Inbox', href: `${base}/inbox` } : null,
    { label: 'Hồ sơ', href: `${base}/profile` },
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  return {
    version: 'h052_executive_command',
    generatedAt: new Date().toISOString(),
    summary: `Xin chào ${user.name || user.email}. Đây là tổng quan dữ liệu trong phạm vi quyền của bạn.`,
    hero: {
      aiStatus: 'Working',
      aiStatusLabel: 'Đang hoạt động',
      businessHealth: null,
      todayGoal: null,
      expectedRevenueTy: null,
      currentCampaign: null,
      confidence: null,
    },
    snapshot,
    insights: insights.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
    attention,
    quickActions,
    kpis: snapshot.map((s) => ({
      id: s.id,
      title: s.title,
      bigNumber: s.value,
      trend: null,
      trendDirection: null,
      miniStatus: [s.title],
      href: s.href,
    })),
  };
}

export function createContentRouter(opts: { agentEnabled: boolean }) {
  const { agentEnabled: AGENT_ENABLED } = opts;
  const router = Router();
  const navCountsCache = new Map<string, { data: any; expiresAt: number }>();

router.get('/api/dashboard', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!isSuperAdminUser(user)) {
      res.json({ status: 'success', data: await buildScopedDashboard(req) });
      return;
    }
    const force = req.query.refresh === 'true' || req.query.refresh === '1';
    const { buildExecutiveKpiDashboard } = await import('../executive-dashboard');
    const data = await buildExecutiveKpiDashboard(force);
    res.json({ status: 'success', data });
  } catch (error: unknown) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Dashboard KPI load failed',
    });
  }
});

// Lightweight sidebar badges — counts only, no entity lists.
router.get('/api/navigation-counts', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const cacheKey = `${user.id}:${user.role}:${req.scope || ''}:${req.teamId || ''}`;
    const now = Date.now();
    const cached = navCountsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return res.json({ status: 'success', data: cached.data });
    }

    const db = readDatabase();
    const isSuper = isSuperAdminUser(user);
    const has = (key: PermissionKey) => isSuper || permissionScopeFor(req, key) !== 'none';

    // Each badge uses the effective scope of its own feature permission, not
    // the scope of the /api/dashboard permission that guards this route.
    const customers = scopedByPermission(db.customers, req, 'crm');
    const properties = scopedByPermission(db.properties, req, 'property.read');
    const posts = scopedByPermission(db.posts, req, 'property.read');
    const inbox = scopedByPermission(db.inbox, req, 'fb_inbox');

    const adminVisibleProperties = properties.filter(p => getPropertySaleStatus(p) !== 'hidden').length;
    const pendingInbox = inbox.filter(i => i.status === 'pending').length;

    let leadIntelligence = 0;
    let externalInventory = 0;
    let notifications = 0;
    let jobs = 0;
    let sources = 0;

    const hasAgentAccess =
      has('agent.sources') ||
      has('agent.runtime') ||
      has('agent.reports') ||
      has('agent.notifications') ||
      has('lead.intel');

    if (AGENT_ENABLED && hasAgentAccess) {
      const agentCounts = await getAgentDashboardCounts(user);
      leadIntelligence = has('lead.intel') ? agentCounts.newFindings : 0;
      notifications = has('agent.notifications') ? agentCounts.unreadNotifications : 0;
      jobs = has('agent.runtime') ? agentCounts.queuedJobs + agentCounts.runningJobs : 0;
      sources = has('agent.sources') ? agentCounts.activeSources : 0;
      if (has('agent.sources')) {
        const companyScope = buildCompanyScopeFilter(user);
        externalInventory = await prisma.externalInventoryItem.count({
          where: {
            ...companyScope,
            status: { notIn: ['archived', 'converted'] },
          },
        }).catch(() => 0);
      }
    }

    // Use the exact same query the listing endpoint uses so the sidebar badge
    // can never report entries that the page then fails to render.
    const investorLeads = has('investor_leads')
      ? (await listInvestorLeads(1, { includeConverted: false }).catch(() => null))?.total ?? 0
      : 0;

    // Website chat guests are platform-wide guest sessions: only expose them
    // to holders of the website_chat feature.
    const websiteChat = has('website_chat') ? getPublicChatGuests().length : 0;
    const chatHistoryScoped = !has('chatbot.use')
      ? []
      : (db.chat_history || []).filter((item: { user_id?: string; company_id?: string }) => {
          if (isSuper) return true;
          if (user.company_id && item.company_id === user.company_id && permissionScopeFor(req, 'chatbot.use') === 'team') {
            return true;
          }
          return item.user_id === user.id;
        });
    const chatHistory = new Set(chatHistoryScoped.map((item: { user_id?: string }) => item.user_id).filter(Boolean)).size;

    const resultData = {
      crm: has('crm') ? customers.length : 0,
      properties: has('property.read') ? adminVisibleProperties : 0,
      posts: has('property.read') ? posts.length : 0,
      pendingInbox: has('fb_inbox') ? pendingInbox : 0,
      leadIntelligence,
      investorLeads,
      externalInventory,
      notifications,
      jobs,
      sources,
      websiteChat,
      chatHistory,
    };

    navCountsCache.set(cacheKey, { data: resultData, expiresAt: now + 15_000 });

    res.json({
      status: 'success',
      data: resultData,
    });
  } catch (error: any) {
    sendError(res, 500, error?.message || 'Không lấy được navigation counts.');
  }
});

router.get('/api/content/generated', (req: Request, res: Response) => {
  const db = readDatabase();
  const channel = String(req.query.channel || '');
  const status = String(req.query.status || '');
  const prioritizedChannels = new Set(['facebook', 'zalo']);

  const records = (db.generated_contents || []).filter(item => {
    if (channel && item.channel !== channel) return false;
    if (status && item.status !== status) return false;
    return canManageResource(item, req);
  }).sort((a, b) => {
    const aPriority = prioritizedChannels.has(a.channel) ? 0 : 1;
    const bPriority = prioritizedChannels.has(b.channel) ? 0 : 1;
    return aPriority - bPriority;
  });

  res.json({ status: 'success', data: records });
});

router.post('/api/content/generated/:id/verify', async (req: Request, res: Response) => {
  const { verifiedContent } = req.body;
  const db = readDatabase();
  const user = getAuthUser(req);
  const record = (db.generated_contents || []).find(item => item.id === req.params.id);

  if (!record) {
    sendError(res, 404, 'Không tìm thấy content đã sinh.');
    return;
  }

  if (!canManageResource(record, req)) {
    sendError(res, 403, 'Bạn không có quyền duyệt content này.');
    return;
  }

  const ok = await verifyGeneratedContent(record.id, verifiedContent || record.raw_content);
  if (!ok) {
    sendError(res, 500, 'Không thể cập nhật trạng thái verified.');
    return;
  }

  res.json({ status: 'success', data: { id: record.id, status: 'verified' } });
});

router.get('/api/automations', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: scopeCollection(db.automations, req) });
});

router.post('/api/automations/:id/toggle', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.automations.findIndex(a => a.id === req.params.id);

  if (index === -1) {
    sendError(res, 404, 'Không tìm thấy kịch bản tự động');
    return;
  }

  if (!canManageResource(db.automations[index], req)) {
    sendError(res, 403, 'Bạn không có quyền thay đổi automation này.');
    return;
  }

  const oldAuto = db.automations[index];
  const nextStatus = oldAuto.status === 'active' ? 'inactive' : 'active';
  const now = new Date().toISOString();
  const nextLogs = [`${now} - Trạng thái hoạt động chuyển sang: ${nextStatus.toUpperCase()}`, ...(oldAuto.logs || [])];

  const updatedAuto = {
    ...oldAuto,
    status: nextStatus,
    logs: nextLogs,
    updated_at: now,
  };

  const savedAuto = await upsertCmsRecord('automations', updatedAuto, oldAuto.version);
  res.json({ status: 'success', data: savedAuto });
});

// Run Demo simulation report
router.post('/api/automations/run-demo', async (req: Request, res: Response) => {
  const db = readDatabase();
  const now = new Date().toISOString();
  const scopedList = scopeCollection(db.automations, req);
  const scopedIds = new Set(scopedList.map(auto => auto.id));

  // Run all active automations
  for (const auto of db.automations as AutomationTask[]) {
    if (auto.status === 'active' && scopedIds.has(auto.id)) {
      const demoLog = `${now} - Chạy thử nghiệm thủ công bởi quản trị viên. Kết quả hoàn hảo.`;
      const updated = {
        ...auto,
        last_run: now,
        run_count: auto.run_count + 1,
        logs: [demoLog, ...auto.logs].slice(0, 20),
        updated_at: now,
      };
      await upsertCmsRecord('automations', updated, (auto as any).version);
    }
  }

  res.json({ status: 'success', data: scopeCollection(readDatabase().automations, req) });
});

router.get('/api/channels', (req: Request, res: Response) => {
  const channels = [
    { name: "Facebook Page RealEstate", platform: "facebook", connected: true, last_sync: "Ít phút trước", messages_count: 5, comments_count: 42 },
    { name: "Zalo Official Account Land", platform: "zalo", connected: true, last_sync: "5 phút trước", messages_count: 8, comments_count: 0 },
    { name: "TikTok Business Account", platform: "tiktok", connected: true, last_sync: "10 phút trước", messages_count: 2, comments_count: 154 },
    { name: "Website Customer LiveChat", platform: "website", connected: true, last_sync: "Chào đón liên tục", messages_count: 4, comments_count: 0 },
    { name: "Instagram Business Profile", platform: "facebook", connected: false, last_sync: "Không có kết nối", messages_count: 0, comments_count: 0 }
  ];

  res.json({ status: 'success', data: channels });
});

router.get('/api/settings', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: maskSettingsSecrets(db.settings) });
});

router.put('/api/settings', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;

  const body = { ...(req.body || {}) } as Record<string, unknown>;
  // Do not overwrite secrets when client sends masked values back
  const maskedLike = (v: unknown) => typeof v === 'string' && (v.includes('…') || v.includes('****'));
  if (maskedLike(body.telegram_bot_token)) delete body.telegram_bot_token;
  if (maskedLike(body.agent_sync_secret)) delete body.agent_sync_secret;
  if (maskedLike(body.gemini_api_key)) delete body.gemini_api_key;
  if (maskedLike(body.openai_api_key)) delete body.openai_api_key;

  // Settings-only write — never rewrite the full CMS DB (slow / crash-prone).
  const settings = await updateSettings(body as Partial<AppSettings>);
  res.json({ status: 'success', data: maskSettingsSecrets(settings) });
});

router.post('/api/settings/telegram/test', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const text = req.body?.text != null ? String(req.body.text) : undefined;
  const result = await sendTestTelegram({ text });
  if (!result.ok) {
    sendError(res, 400, result.error || 'Telegram test failed');
    return;
  }
  res.json({ status: 'success', data: result });
});

router.post('/api/settings/agent-sync/test', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const db = readDatabase();
  const settings = { ...db.settings } as AppSettings;
  // Allow optional overrides from request body (unsaved form values)
  const body = (req.body || {}) as Record<string, unknown>;
  if (typeof body.agent_sync_vps_url === 'string' && body.agent_sync_vps_url.trim()) {
    settings.agent_sync_vps_url = body.agent_sync_vps_url.trim();
  }
  if (typeof body.agent_sync_key_id === 'string' && body.agent_sync_key_id.trim()) {
    settings.agent_sync_key_id = body.agent_sync_key_id.trim();
  }
  if (
    typeof body.agent_sync_secret === 'string' &&
    body.agent_sync_secret.trim() &&
    !body.agent_sync_secret.includes('…') &&
    !body.agent_sync_secret.includes('****')
  ) {
    settings.agent_sync_secret = body.agent_sync_secret.trim();
  }
  if (typeof body.agent_sync_timeout_ms === 'number' && Number.isFinite(body.agent_sync_timeout_ms)) {
    settings.agent_sync_timeout_ms = body.agent_sync_timeout_ms;
  }

  const result = await testVpsConnection(settings);
  if (!result.ok) {
    res.status(400).json({ status: 'error', message: result.error || 'VPS sync test failed', data: result.data });
    return;
  }
  res.json({
    status: 'success',
    message: result.message || 'Kết nối VPS OK.',
    data: result.data,
  });
});

router.get('/api/settings/agent-sync/status', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  try {
    const stats = await getSyncOutboxStats();
    res.json({
      status: 'success',
      data: {
        envEnabled: process.env.AGENT_LOCAL_SYNC_ENABLED?.trim().toLowerCase() === 'true',
        settingsEnabled: Boolean(readDatabase().settings.agent_sync_enabled),
        ...stats,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Không lấy được sync status.',
    });
  }
});

router.post('/api/settings/agent-sync/flush', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  try {
    const result = await processOutboxBatch({
      limit: Number((req.body as { limit?: number })?.limit || 20),
    });
    const stats = await getSyncOutboxStats();
    res.json({ status: 'success', data: { flush: result, stats } });
  } catch (error: unknown) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Flush outbox thất bại.',
    });
  }
});

  return router;
}
