import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { canManageAgentConfig, getAgentFindingById, bulkActionAgentFindings, listAgentFindings, listScannedContents, getScannedContentById, updateScannedContentStatus, hardDeleteScannedContent, reanalyzeScannedContent, paginatedMeta, updateAgentFinding } from '../agentDb';
import { promoteFindingToLead } from '../findingPromotionService';
import { approveScannedContentAsFinding } from '../approveFindingService';
import { parsePagination, validateFindingPatch, validateFindingsBulkAction } from '../agentValidation';
import { createSpamRule } from '../spam/spamRuleRepository';

export function registerFindingRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

  app.get('/api/agent/findings', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const q = req.query as Record<string, unknown>;
      const minScoreRaw = q.minScore ?? q.min_score;
      const maxScoreRaw = q.maxScore ?? q.max_score;
      const minScore = minScoreRaw !== undefined ? Number(minScoreRaw) : undefined;
      const maxScore = maxScoreRaw !== undefined ? Number(maxScoreRaw) : undefined;
      const bool = (v: unknown) =>
        v === true || v === '1' || v === 'true' || v === 'yes';

      const filters: Record<string, unknown> = {
        minScore: Number.isFinite(minScore) ? minScore : undefined,
        maxScore: Number.isFinite(maxScore) ? maxScore : undefined,
        status: String(q.status || '').trim() || undefined,
        type: String(q.type || '').trim() || undefined,
        sourceId: String(q.sourceId || q.source_id || '').trim() || undefined,
        classification: String(q.classification || '').trim() || undefined,
        intent: String(q.intent || '').trim() || undefined,
        actorRole: String(q.actorRole || q.actor_role || '').trim() || undefined,
        priority: String(q.priority || '').trim() || undefined,
        hasPhone: q.hasPhone !== undefined || q.has_phone !== undefined
          ? bool(q.hasPhone ?? q.has_phone)
          : undefined,
        hasBudget: q.hasBudget !== undefined || q.has_budget !== undefined
          ? bool(q.hasBudget ?? q.has_budget)
          : undefined,
        location: String(q.location || '').trim() || undefined,
        propertyType: String(q.propertyType || q.property_type || '').trim() || undefined,
        dedupeStatus: String(q.dedupeStatus || q.dedupe_status || '').trim() || undefined,
        createdFrom: String(q.createdFrom || q.created_from || '').trim() || undefined,
        createdTo: String(q.createdTo || q.created_to || '').trim() || undefined,
        search: String(q.search || '').trim() || undefined,
        includeSupplySignals: bool(q.includeSupplySignals ?? q.include_supply_signals),
        includeDismissed: bool(q.includeDismissed ?? q.include_dismissed),
        includeConsumed: bool(q.includeConsumed ?? q.include_consumed),
        quickFilter: String(q.quickFilter || q.quick_filter || q.filter || '').trim() || undefined,
        needsReview: bool(q.needsReview ?? q.needs_review),
        dismissReason: String(q.dismissReason || q.dismiss_reason || '').trim() || undefined,
        includeManualApproved: bool(
          q.includeManualApproved ?? q.include_manual_approved ?? true,
        ),
        promoted: q.promoted !== undefined ? bool(q.promoted) : undefined,
        externalInventorySaved:
          q.externalInventorySaved !== undefined || q.external_inventory_saved !== undefined
            ? bool(q.externalInventorySaved ?? q.external_inventory_saved)
            : undefined,
        scoreStatus: String(q.scoreStatus || q.score_status || '').trim() || undefined,
      };
      // Convenience: ?filter=processed or status=processed
      if (String(q.filter || '').toLowerCase() === 'processed' || filters.status === 'processed') {
        filters.quickFilter = 'processed';
        filters.status = undefined;
        filters.includeConsumed = true;
      }
      const { items, total } = await listAgentFindings(user, pagination, filters as Parameters<typeof listAgentFindings>[2]);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách finding.');
    }
  });

  app.post('/api/agent/findings/bulk-action', async (req: Request, res: Response) => {
    const validated = validateFindingsBulkAction(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }
    try {
      const user = getAuthUser(req);
      const result = await bulkActionAgentFindings({
        user,
        action: validated.value.action,
        findingIds: validated.value.findingIds,
        reason: validated.value.reason,
        note: validated.value.note,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Bulk action thất bại.');
    }
  });

  app.get('/api/agent/scanned-contents', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        sourceId: String(req.query.sourceId || req.query.source_id || '').trim() || undefined,
        status: String(req.query.status || '').trim() || undefined,
        search: String(req.query.search || '').trim() || undefined,
      };
      const { items, total } = await listScannedContents(user, pagination, filters);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được nội dung đã quét.');
    }
  });

  app.delete('/api/agent/scanned-contents/:id', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (user.role !== 'owner') {
        sendError(res, 403, 'Chỉ owner được hard-delete.');
        return;
      }
      const existing = await getScannedContentById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nội dung quét.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const confirmRaw =
        (req.query as Record<string, unknown>).confirm ??
        (req.body as Record<string, unknown> | undefined)?.confirm;
      const confirm =
        confirmRaw === true ||
        confirmRaw === 'true' ||
        confirmRaw === '1' ||
        confirmRaw === 1;

      const result = await hardDeleteScannedContent({
        id: existing.id,
        user,
        confirm,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Xóa nội dung quét thất bại.';
      const status = /confirm/i.test(msg) ? 400 : /quyền|owner/i.test(msg) ? 403 : 400;
      sendError(res, status, msg);
    }
  });

  app.patch('/api/agent/scanned-contents/:id', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getScannedContentById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nội dung quét.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const body = (req.body || {}) as Record<string, unknown>;
      const action = String(body.action || body.status || '').trim().toLowerCase();

      if (action === 'hard-delete' || action === 'hard_delete') {
        if (user.role !== 'owner') {
          sendError(res, 403, 'Chỉ owner được hard-delete.');
          return;
        }
        const result = await hardDeleteScannedContent({
          id: existing.id,
          user,
          confirm: Boolean(body.confirm),
        });
        res.json({ status: 'success', data: result });
        return;
      }

      if (action === 'reanalyze' || action === 're-analyze') {
        const result = await reanalyzeScannedContent({ id: existing.id, user });
        res.json({ status: 'success', data: result });
        return;
      }

      if (
        action === 'approve_finding' ||
        action === 'approve-finding' ||
        action === 'promote_finding' ||
        action === 'duyet_finding'
      ) {
        const result = await approveScannedContentAsFinding({
          id: existing.id,
          user,
          note: body.note != null ? String(body.note) : undefined,
        });
        res.json({ status: 'success', data: result });
        return;
      }

      const statusMap: Record<string, string> = {
        archive: 'archived',
        archived: 'archived',
        ignore: 'ignored',
        ignored: 'ignored',
        restore: 'collected',
        collected: 'collected',
      };
      const nextStatus = statusMap[action];
      if (!nextStatus) {
        sendError(
          res,
          400,
          'Action không hợp lệ. Cho phép: archive, ignore, restore, reanalyze, approve_finding, hard-delete.',
        );
        return;
      }
      const updated = await updateScannedContentStatus({
        id: existing.id,
        status: nextStatus,
        user,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được nội dung quét.');
    }
  });

  app.patch('/api/agent/findings/:id', async (req: Request, res: Response) => {
    const validated = validateFindingPatch(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      if (
        (validated.value.status === 'promoted' ||
          validated.value.status === 'promoted_to_investor_lead') &&
        !canManageAgentConfig(getAuthUser(req))
      ) {
        sendError(res, 403, 'Chỉ owner/company admin mới được promote finding.');
        return;
      }

      const user = getAuthUser(req);
      const updated = await updateAgentFinding(existing.id, {
        ...validated.value,
        dismissedBy: validated.value.status === 'dismissed' ? user.id : undefined,
        reviewedBy: validated.value.status === 'reviewed' ? user.id : undefined,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được finding.');
    }
  });

  app.post('/api/agent/findings/:id/promote', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!canManageAgentConfig(user)) {
        sendError(res, 403, 'Chỉ owner/company admin mới được promote finding.');
        return;
      }
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const result = await promoteFindingToLead({ findingId: existing.id, user });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Promote Lead thất bại.');
    }
  });

  app.patch('/api/agent/findings/:id/reviewed', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const updated = await updateAgentFinding(existing.id, {
        status: 'reviewed',
        reviewedBy: user.id,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không đánh dấu đã xem.');
    }
  });

  app.patch('/api/agent/findings/:id/dismiss', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const body = (req.body || {}) as Record<string, unknown>;
      const updated = await updateAgentFinding(existing.id, {
        status: 'dismissed',
        dismissReason: body.dismissReason != null ? String(body.dismissReason) : body.reason != null ? String(body.reason) : 'other',
        dismissNote: body.dismissNote != null ? String(body.dismissNote) : body.note != null ? String(body.note) : null,
        dismissedBy: user.id,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không dismiss được finding.');
    }
  });

  app.post('/api/agent/scanned-contents/:id/block', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const content = await getScannedContentById(String(req.params.id));
      if (!content) {
        sendError(res, 404, 'Không tìm thấy nội dung quét.');
        return;
      }
      if (!assertRecordAccess(req, res, content.companyId)) return;
      const body = req.body || {};
      const blockType = String(body.type || 'phone');
      const rawValue = String(body.rawValue || body.phone || '').trim();
      if (!rawValue) {
        sendError(res, 400, 'rawValue / phone là bắt buộc.');
        return;
      }
      const rule = await createSpamRule({
        companyId: content.companyId || user.company_id || null,
        sourceId: body.applyToSource === true ? content.sourceId : null,
        type: blockType,
        action: body.action === 'allow' ? 'allow' : 'block',
        rawValue,
        label: body.label != null ? String(body.label) : null,
        reason: body.reason != null ? String(body.reason) : 'blocked_from_scanned_content',
        createdBy: user.id || user.email || null,
      });

      await updateScannedContentStatus({
        user,
        id: content.id,
        status: 'blocked',
      });

      // Persist spam meta without re-running full AI pipeline
      const existingMetrics =
        content.metrics && typeof content.metrics === 'object'
          ? (content.metrics as Record<string, unknown>)
          : {};
      const { prisma } = await import('../../prisma');
      await prisma.scannedContent.update({
        where: { id: content.id },
        data: {
          status: 'blocked',
          metrics: {
            ...existingMetrics,
            leadAnalysis: {
              ...((existingMetrics.leadAnalysis as object) || {}),
              filterStage: 'blocked',
              spamDecision: 'block',
              spamReason: rule.type === 'phone' ? 'blocked_phone' : rule.reason || 'blocked',
              matchedSpamRuleIds: [rule.id],
              blockedAt: new Date().toISOString(),
            },
          },
          rawData: {
            ...((content.rawData as object) || {}),
            spamDecision: 'block',
            spamReason: rule.type === 'phone' ? 'blocked_phone' : rule.reason,
            matchedSpamRuleIds: [rule.id],
          },
        },
      });

      res.json({
        status: 'success',
        data: { rule, contentId: content.id, status: 'blocked' },
        warning:
          'Finding / Lead đã promote (nếu có) không bị xóa. Rule chỉ chặn các lần scan sau và đánh dấu content hiện tại.',
      });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không block được nội dung.');
    }
  });

  app.post('/api/agent/findings/:id/block', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const finding = await getAgentFindingById(String(req.params.id));
      if (!finding) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, finding.companyId)) return;
      const body = req.body || {};
      const blockType = String(body.type || 'phone');
      const extracted = (finding.extractedData || {}) as Record<string, unknown>;
      const rawValue = String(
        body.rawValue ||
          body.phone ||
          finding.primaryPhone ||
          extracted.primaryPhone ||
          '',
      ).trim();
      if (!rawValue && blockType === 'phone') {
        sendError(res, 400, 'Finding không có số điện thoại để block.');
        return;
      }
      if (!rawValue) {
        sendError(res, 400, 'rawValue là bắt buộc.');
        return;
      }
      const rule = await createSpamRule({
        companyId: finding.companyId || user.company_id || null,
        sourceId: body.applyToSource === true ? finding.sourceId : null,
        type: blockType,
        action: body.action === 'allow' ? 'allow' : 'block',
        rawValue,
        label: body.label != null ? String(body.label) : null,
        reason: body.reason != null ? String(body.reason) : 'blocked_from_finding',
        createdBy: user.id || user.email || null,
      });

      const promoted = Boolean(finding.promotedLeadId || finding.consumptionType === 'investor_lead');
      if (!promoted) {
        await updateAgentFinding(finding.id, {
          status: 'dismissed',
          dismissReason: 'spam_block',
          dismissNote: `Blocked via rule ${rule.id}`,
          dismissedBy: user.id || user.email || null,
        });
      }

      res.json({
        status: 'success',
        data: { rule, findingId: finding.id, dismissed: !promoted },
        warning: promoted
          ? 'Finding đã promote — không xóa Lead/CRM. Rule chỉ chặn scan sau.'
          : undefined,
      });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không block được finding.');
    }
  });
}
