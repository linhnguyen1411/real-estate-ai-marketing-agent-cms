import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { paginatedMeta } from '../agentDb';
import { archiveSpamRule, createSpamRule, getSpamRuleById, listSpamRules, updateSpamRule } from '../spam/spamRuleRepository';
import { evaluateContentSpam } from '../spam/spamPolicyService';
import { normalizeSpamPhoneInput } from '../spam/phoneSpam';

export function registerSpamRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

  app.get('/api/agent/spam-rules', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const activeRaw = String(req.query.active ?? '').trim().toLowerCase();
      const expiredRaw = String(req.query.expired ?? '').trim().toLowerCase();
      const result = await listSpamRules({
        tenantCompanyId: user.role === 'owner' ? null : user.company_id ?? '__none__',
        companyId: user.role === 'owner' ? (req.query.companyId ? String(req.query.companyId) : undefined) : undefined,
        sourceId: req.query.sourceId ? String(req.query.sourceId) : null,
        type: req.query.type ? String(req.query.type) : null,
        action: req.query.action ? String(req.query.action) : null,
        active: activeRaw === 'true' ? true : activeRaw === 'false' ? false : null,
        expired: expiredRaw === 'true' ? true : expiredRaw === 'false' ? false : null,
        search: req.query.search ? String(req.query.search) : null,
        page,
        limit,
      });
      res.json({
        status: 'success',
        data: result.rows,
        meta: paginatedMeta(result.total, { page, limit, skip: (page - 1) * limit }),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được spam rules.');
    }
  });

  app.post('/api/agent/spam-rules', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const body = req.body || {};
      const type = String(body.type || '').trim();
      const action = String(body.action || 'block').trim();
      const rawValue = String(body.rawValue || '').trim();
      if (!type || !rawValue) {
        sendError(res, 400, 'type và rawValue là bắt buộc.');
        return;
      }
      if (!['block', 'ignore', 'lower_score', 'allow'].includes(action)) {
        sendError(res, 400, 'action không hợp lệ.');
        return;
      }
      const companyId =
        user.role === 'owner'
          ? body.companyId != null
            ? String(body.companyId)
            : null
          : user.company_id ?? null;
      const created = await createSpamRule({
        companyId,
        sourceId: body.sourceId != null ? String(body.sourceId) : null,
        missionId: body.missionId != null ? String(body.missionId) : null,
        findingType: body.findingType != null ? String(body.findingType) : null,
        type,
        action: action as 'block' | 'ignore' | 'lower_score' | 'allow',
        rawValue,
        pattern: body.pattern != null ? String(body.pattern) : null,
        label: body.label != null ? String(body.label) : null,
        reason: body.reason != null ? String(body.reason) : null,
        priority: body.priority != null ? Number(body.priority) : 100,
        isActive: body.isActive !== false,
        expiresAt: body.expiresAt || null,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
        createdBy: user.id || user.email || null,
      });
      res.status(201).json({ status: 'success', data: created });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không tạo được spam rule.');
    }
  });

  app.patch('/api/agent/spam-rules/:id', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const existing = await getSpamRuleById(String(req.params.id));
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy spam rule.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const body = req.body || {};
      const updated = await updateSpamRule(existing.id, {
        ...(body.type !== undefined ? { type: String(body.type) } : {}),
        ...(body.action !== undefined ? { action: String(body.action) } : {}),
        ...(body.rawValue !== undefined ? { rawValue: String(body.rawValue) } : {}),
        ...(body.pattern !== undefined ? { pattern: body.pattern } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        ...(body.priority !== undefined ? { priority: Number(body.priority) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
        ...(body.sourceId !== undefined ? { sourceId: body.sourceId } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
        ...(body.archivedAt !== undefined
          ? { archivedAt: body.archivedAt ? new Date(body.archivedAt) : null }
          : {}),
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không cập nhật được spam rule.');
    }
  });

  app.delete('/api/agent/spam-rules/:id', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getSpamRuleById(String(req.params.id));
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy spam rule.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const archived = await archiveSpamRule(existing.id);
      res.json({ status: 'success', data: archived });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không xóa được spam rule.');
    }
  });

  app.post('/api/agent/spam-rules/test', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const body = req.body || {};
      const contentText = String(body.contentText || body.content || '');
      const { decision, rulesLoaded } = await evaluateContentSpam({
        contentText,
        authorName: body.authorName,
        authorUrl: body.authorUrl,
        pageUrl: body.pageUrl,
        canonicalUrl: body.canonicalUrl,
        contentHash: body.contentHash,
        sourceId: body.sourceId,
        companyId: user.role === 'owner' ? body.companyId || null : user.company_id,
        classification: body.classification,
        actorRole: body.actorRole,
        tier: body.tier || 'all',
      });
      res.json({ status: 'success', data: { decision, rulesLoaded } });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không test được spam policy.');
    }
  });

  app.post('/api/agent/spam-rules/normalize-phone', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const raw = String(req.body?.phone || req.body?.rawValue || '');
      const normalized = normalizeSpamPhoneInput(raw);
      if (!normalized) {
        sendError(res, 400, 'Số điện thoại không hợp lệ.');
        return;
      }
      res.json({ status: 'success', data: normalized });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Normalize phone thất bại.');
    }
  });

}
