import { Router, type Request, type Response } from 'express';
import {
  getPublicChatGuests,
  readDatabase,
  verifyGeneratedContent,
  writeDatabase,
} from '../../dbHelper';
import type { AppSettings, AutomationTask } from '../../../src/types';
import { buildCompanyScopeFilter, getAgentDashboardCounts } from '../../agent/agentDb';
import { prisma } from '../../prisma';
import { getPropertySaleStatus } from '../../../src/utils/propertyStatus';
import { countInvestorLeads } from '../../investorLeadDb';
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

export function createContentRouter(opts: { agentEnabled: boolean }) {
  const { agentEnabled: AGENT_ENABLED } = opts;
  const router = Router();

router.get('/api/dashboard', async (_req: Request, res: Response) => {
  try {
    const { buildExecutiveKpiDashboard } = await import('../executive-dashboard');
    const data = await buildExecutiveKpiDashboard();
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
    const db = readDatabase();
    const customers = scopeCollection(db.customers, req);
    const properties = scopeCollection(db.properties, req);
    const posts = scopeCollection(db.posts, req);
    const inbox = scopeCollection(db.inbox, req);
    const user = getAuthUser(req);

    const adminVisibleProperties = properties.filter(p => getPropertySaleStatus(p) !== 'hidden').length;
    const pendingInbox = inbox.filter(i => i.status === 'pending').length;

    let leadIntelligence = 0;
    let externalInventory = 0;
    let notifications = 0;
    let jobs = 0;
    let sources = 0;

    if (AGENT_ENABLED) {
      const agentCounts = await getAgentDashboardCounts(user);
      leadIntelligence = agentCounts.newFindings;
      notifications = agentCounts.unreadNotifications;
      jobs = agentCounts.queuedJobs + agentCounts.runningJobs;
      sources = agentCounts.activeSources;
      const companyScope = buildCompanyScopeFilter(user);
      externalInventory = await prisma.externalInventoryItem.count({
        where: {
          ...companyScope,
          status: { notIn: ['archived', 'converted'] },
        },
      }).catch(() => 0);
    }

    const investorLeads = await countInvestorLeads({ includeConverted: false }).catch(() => 0);

    // Lightweight chat badges (counts only — same semantics as pre–Batch 5 App list.length).
    const websiteChat = getPublicChatGuests().length;
    const chatHistoryScoped = (db.chat_history || []).filter((item: { user_id?: string; company_id?: string }) => {
      if (user.role === 'owner') return true;
      if (user.role === 'company') return item.company_id === user.company_id;
      return item.user_id === user.id;
    });
    const chatHistory = new Set(chatHistoryScoped.map((item: { user_id?: string }) => item.user_id).filter(Boolean)).size;

    res.json({
      status: 'success',
      data: {
        crm: customers.length,
        properties: adminVisibleProperties,
        posts: posts.length,
        pendingInbox,
        leadIntelligence,
        investorLeads,
        externalInventory,
        notifications,
        jobs,
        sources,
        websiteChat,
        chatHistory,
      },
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error?.message || 'Không lấy được navigation counts.' });
  }
});

router.get('/api/content/generated', (req: Request, res: Response) => {
  const db = readDatabase();
  const user = getAuthUser(req);
  const channel = String(req.query.channel || '');
  const status = String(req.query.status || '');
  const prioritizedChannels = new Set(['facebook', 'zalo']);

  const records = (db.generated_contents || []).filter(item => {
    if (channel && item.channel !== channel) return false;
    if (status && item.status !== status) return false;
    if (user.role === 'owner') return true;
    return item.company_id === user.company_id;
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
    res.status(404).json({ status: 'error', message: 'Không tìm thấy content đã sinh.' });
    return;
  }

  if (user.role !== 'owner' && record.company_id !== user.company_id) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền duyệt content này.' });
    return;
  }

  const ok = await verifyGeneratedContent(record.id, verifiedContent || record.raw_content);
  if (!ok) {
    res.status(500).json({ status: 'error', message: 'Không thể cập nhật trạng thái verified.' });
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
    res.status(404).json({ status: 'error', message: 'Không tìm thấy kịch bản tự động' });
    return;
  }

  if (!canManageResource(db.automations[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền thay đổi automation này.' });
    return;
  }

  const currentStatus = db.automations[index].status;
  db.automations[index].status = currentStatus === 'active' ? 'inactive' : 'active';
  
  const now = new Date().toISOString();
  db.automations[index].logs.unshift(`${now} - Trạng thái hoạt động chuyển sang: ${db.automations[index].status.toUpperCase()}`);

  await writeDatabase(db);
  res.json({ status: 'success', data: db.automations[index] });
});

// Run Demo simulation report
router.post('/api/automations/run-demo', async (req: Request, res: Response) => {
  const db = readDatabase();
  const now = new Date().toISOString();
  const scopedIds = new Set(scopeCollection(db.automations, req).map(auto => auto.id));

  // Run all active automations
  db.automations = db.automations.map((auto: AutomationTask) => {
    if (auto.status === 'active' && scopedIds.has(auto.id)) {
      const demoLog = `${now} - Chạy thử nghiệm thủ công bởi quản trị viên. Kết quả hoàn hảo.`;
      return {
        ...auto,
        last_run: now,
        run_count: auto.run_count + 1,
        logs: [demoLog, ...auto.logs].slice(0, 20)
      };
    }
    return auto;
  });

  await writeDatabase(db);
  res.json({ status: 'success', data: scopeCollection(db.automations, req) });
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

  const db = readDatabase();
  const body = { ...(req.body || {}) } as Record<string, unknown>;
  // Do not overwrite secrets when client sends masked values back
  const maskedLike = (v: unknown) => typeof v === 'string' && (v.includes('…') || v.includes('****'));
  if (maskedLike(body.telegram_bot_token)) delete body.telegram_bot_token;
  if (maskedLike(body.agent_sync_secret)) delete body.agent_sync_secret;

  db.settings = {
    ...db.settings,
    ...body,
  };
  await writeDatabase(db);
  res.json({ status: 'success', data: maskSettingsSecrets(db.settings) });
});

router.post('/api/settings/telegram/test', async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const text = req.body?.text != null ? String(req.body.text) : undefined;
  const result = await sendTestTelegram({ text });
  if (!result.ok) {
    res.status(400).json({ status: 'error', message: result.error || 'Telegram test failed' });
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
