import type { Express, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AgentRouteDeps } from './agentTypes';
import {
  canAccessAgentRecord,
  canManageAgentConfig,
  cancelQueuedJobsForSource,
  createAgentMission,
  createAgentSource,
  deleteAgentJob,
  deleteAgentJobsByStatus,
  forceDeleteAgentSource,
  getAgentDashboardCounts,
  getAgentFindingById,
  getAgentJobById,
  getAgentMissionById,
  getAgentNotificationById,
  getAgentSourceById,
  bulkActionAgentFindings,
  listAgentFindings,
  listAgentJobs,
  listAgentMissions,
  listAgentNotifications,
  listAgentSources,
  listBrowserSessions,
  listScannedContents,
  getScannedContentById,
  updateScannedContentStatus,
  hardDeleteScannedContent,
  reanalyzeScannedContent,
  markAllAgentNotificationsRead,
  markNotificationRead,
  countUnreadAgentNotifications,
  paginatedMeta,
  updateAgentFinding,
  updateAgentMission,
  updateAgentSource,
} from './agentDb';
import { promoteFindingToLead } from './findingPromotionService';
import { approveScannedContentAsFinding } from './approveFindingService';
import {
  getExternalInventoryById,
  listExternalInventory,
  patchExternalInventory,
  saveFindingToExternalInventory,
} from './externalInventoryService';
import { convertExternalInventoryToOfficial } from './externalToOfficialService';
import { updateExternalInventoryCallStatus } from './externalInventoryCallService';
import {
  listFindingMatchEvents,
  matchFindingInventories,
  saveFindingMatchEvent,
} from './findingMatchingService';
import { enqueueMissionRun, enqueueSourceScan } from './agentJobService';
import { getDailyAgentReport } from './dailyReportService';
import {
  buildMissionPayloadFromTemplate,
  getMissionTemplateById,
  listMissionTemplates,
} from './missionTemplates';
import {
  approveProposal,
  copyProposalText,
  createProposalsFromFinding,
  getActionProposalById,
  isValidActionType,
  isValidProposalStatus,
  listActionProposals,
  listProposalAudits,
  rejectProposal,
  updateProposalDraft,
} from './actionProposalService';
import {
  parsePagination,
  validateFindingPatch,
  validateFindingsBulkAction,
  validateMissionCreate,
  validateMissionPatch,
  validateSourceCreate,
  validateSourcePatch,
} from './agentValidation';
import {
  archiveSpamRule,
  createSpamRule,
  getSpamRuleById,
  listSpamRules,
  updateSpamRule,
} from './spam/spamRuleRepository';
import { evaluateContentSpam } from './spam/spamPolicyService';
import { normalizeSpamPhoneInput } from './spam/phoneSpam';
import { registerMissionEngineRoutes, syncMissionSources } from '../modules/mission-engine/api/missionRunRoutes';
import {
  getMissionWorkflowTemplate,
  listMissionWorkflowTemplates,
} from '../modules/mission-engine/domain/missionTemplates';
import { assertValidPipeline } from '../modules/mission-engine/domain/workflowValidation';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

function isPrismaUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function registerAgentAdminRoutes(app: Express, deps: AgentRouteDeps) {
  const { getAuthUser, accessDefaults } = deps;

  registerMissionEngineRoutes(app, deps);

  function requireManage(req: Request, res: Response): boolean {
    const user = getAuthUser(req);
    if (!canManageAgentConfig(user)) {
      sendError(res, 403, 'Bạn không có quyền quản lý AI Agent.');
      return false;
    }
    return true;
  }

  function assertRecordAccess(
    req: Request,
    res: Response,
    companyId: string | null | undefined,
  ): boolean {
    const user = getAuthUser(req);
    if (!canAccessAgentRecord(user, companyId)) {
      sendError(res, 403, 'Bạn không có quyền truy cập dữ liệu này.');
      return false;
    }
    return true;
  }

  app.get('/api/agent/dashboard', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const data = await getAgentDashboardCounts(user);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được dashboard.');
    }
  });

  app.get('/api/agent/sources', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: String(req.query.status || '').trim() || undefined,
        type: String(req.query.type || '').trim() || undefined,
        search: String(req.query.search || '').trim() || undefined,
      };
      const { items, total } = await listAgentSources(user, pagination, filters);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách nguồn.');
    }
  });

  app.post('/api/agent/sources', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateSourceCreate(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const defaults = accessDefaults(req, req.body);
      const created = await createAgentSource({
        companyId: defaults.company_id,
        name: validated.value.name,
        type: validated.value.type,
        url: validated.value.url,
        status: validated.value.status ?? 'active',
        priority: validated.value.priority ?? 5,
        scanIntervalMinutes: validated.value.scanIntervalMinutes ?? 60,
        config: (validated.value.config ?? {}) as Prisma.InputJsonValue,
        checkpoint: validated.value.checkpoint === null
          ? Prisma.JsonNull
          : (validated.value.checkpoint as Prisma.InputJsonValue | undefined),
        nextScanAt: new Date(),
      });
      res.json({ status: 'success', data: created });
    } catch (error: unknown) {
      if (isPrismaUniqueError(error)) {
        sendError(res, 409, 'URL nguồn đã tồn tại trong company này.');
        return;
      }
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được nguồn.');
    }
  });

  app.patch('/api/agent/sources/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateSourcePatch(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const existing = await getAgentSourceById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nguồn.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const patch = validated.value as Prisma.AgentSourceUpdateInput;
      const updated = await updateAgentSource(existing.id, patch);
      if (patch.status === 'paused' && existing.status === 'active') {
        await cancelQueuedJobsForSource(existing.id);
      }
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      if (isPrismaUniqueError(error)) {
        sendError(res, 409, 'URL nguồn đã tồn tại trong company này.');
        return;
      }
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được nguồn.');
    }
  });

  app.post('/api/agent/sources/:id/run', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    try {
      const user = getAuthUser(req);
      const existing = await getAgentSourceById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nguồn.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const missionId = String(req.body?.missionId || req.body?.mission_id || '').trim() || undefined;
      const result = await enqueueSourceScan({
        sourceId: existing.id,
        companyId: existing.companyId ?? user.company_id ?? 'comp-da-nang',
        triggeredByUserId: user.id,
        missionId,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không enqueue được quét nguồn.');
    }
  });

  app.delete('/api/agent/sources/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    try {
      const existing = await getAgentSourceById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nguồn.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const result = await forceDeleteAgentSource(existing.id);
      res.json({
        status: 'success',
        data: result.record,
        meta: {
          deleted: result.deleted,
          message: `Đã xóa nguồn cùng ${result.deleted.jobs} job, ${result.deleted.scannedContents} nội dung đã quét, ${result.deleted.findings} finding.`,
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không xóa được nguồn.');
    }
  });

  app.get('/api/agent/missions', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      const { items, total } = await listAgentMissions(user, pagination, status);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách mission.');
    }
  });

  app.get('/api/agent/missions/templates', async (_req: Request, res: Response) => {
    try {
      const workflow = listMissionWorkflowTemplates().map(t => ({
        id: t.id,
        name: t.name,
        objective: t.objective,
        category: t.category,
        pipeline: t.pipeline,
        rules: t.rulesDefaults,
        schedule: t.schedule,
        workflowVersion: 2,
      }));
      const legacy = listMissionTemplates().map(t => ({ ...t, workflowVersion: 1 }));
      res.json({ status: 'success', data: [...workflow, ...legacy] });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được templates.');
    }
  });

  app.post('/api/agent/missions/from-template', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const body = (req.body || {}) as Record<string, unknown>;
    const templateId = String(body.templateId ?? '').trim();
    if (!templateId) {
      sendError(res, 400, 'templateId là bắt buộc.');
      return;
    }

    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.map(id => String(id).trim()).filter(Boolean)
      : undefined;
    const status = body.status !== undefined ? String(body.status).trim() : 'draft';

    const wf = getMissionWorkflowTemplate(templateId);
    if (wf) {
      try {
        const defaults = accessDefaults(req, body);
        const pipeline = assertValidPipeline(wf.pipeline);
        const ids = sourceIds ?? [];
        const created = await createAgentMission({
          companyId: defaults.company_id,
          ownerUserId: defaults.owner_user_id,
          name: String(body.name || wf.name).trim(),
          objective: String(body.objective || wf.objective).trim(),
          status,
          templateKey: wf.id,
          pipeline: pipeline as unknown as Prisma.InputJsonValue,
          pipelineVersion: pipeline.version,
          rules: {
            ...wf.rulesDefaults,
            sourceIds: ids,
          } as Prisma.InputJsonValue,
          schedule: (wf.schedule || undefined) as Prisma.InputJsonValue | undefined,
        });
        if (ids.length) {
          await syncMissionSources({
            missionId: created.id,
            companyId: created.companyId,
            sourceIds: ids,
          });
        }
        res.json({ status: 'success', data: created });
        return;
      } catch (error: unknown) {
        sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được mission từ template.');
        return;
      }
    }

    const template = getMissionTemplateById(templateId);
    if (!template) {
      sendError(res, 404, 'Không tìm thấy mission template.');
      return;
    }

    const payload = buildMissionPayloadFromTemplate(template, {
      sourceIds,
      name: body.name !== undefined ? String(body.name) : undefined,
      objective: body.objective !== undefined ? String(body.objective) : undefined,
      status,
    });

    const validated = validateMissionCreate(payload);
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const defaults = accessDefaults(req, body);
      const created = await createAgentMission({
        companyId: defaults.company_id,
        ownerUserId: defaults.owner_user_id,
        name: validated.value.name,
        objective: validated.value.objective,
        status: validated.value.status ?? 'draft',
        rules: (validated.value.rules ?? {}) as Prisma.InputJsonValue,
        schedule: validated.value.schedule === null
          ? Prisma.JsonNull
          : (validated.value.schedule as Prisma.InputJsonValue | undefined),
      });
      const ids =
        sourceIds ??
        (Array.isArray((validated.value.rules as { sourceIds?: string[] } | undefined)?.sourceIds)
          ? ((validated.value.rules as { sourceIds: string[] }).sourceIds)
          : []);
      if (ids.length) {
        await syncMissionSources({
          missionId: created.id,
          companyId: created.companyId,
          sourceIds: ids,
        });
      }
      res.json({ status: 'success', data: created });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được mission từ template.');
    }
  });

  app.post('/api/agent/missions', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateMissionCreate(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const defaults = accessDefaults(req, req.body);
      const created = await createAgentMission({
        companyId: defaults.company_id,
        ownerUserId: defaults.owner_user_id,
        name: validated.value.name,
        objective: validated.value.objective,
        status: validated.value.status ?? 'draft',
        rules: (validated.value.rules ?? {}) as Prisma.InputJsonValue,
        schedule: validated.value.schedule === null
          ? Prisma.JsonNull
          : (validated.value.schedule as Prisma.InputJsonValue | undefined),
      });
      res.json({ status: 'success', data: created });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được mission.');
    }
  });

  app.patch('/api/agent/missions/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateMissionPatch(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const existing = await getAgentMissionById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const patch = validated.value as Prisma.AgentMissionUpdateInput;
      const updated = await updateAgentMission(existing.id, patch);
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được mission.');
    }
  });

  app.post('/api/agent/missions/:id/run', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    try {
      const user = getAuthUser(req);
      const mission = await getAgentMissionById(req.params.id);
      if (!mission) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertRecordAccess(req, res, mission.companyId)) return;

      const result = await enqueueMissionRun({
        missionId: mission.id,
        companyId: mission.companyId ?? user.company_id ?? 'comp-da-nang',
        triggeredByUserId: user.id,
      });

      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không enqueue được mission.');
    }
  });

  app.get('/api/agent/jobs', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: String(req.query.status || '').trim() || undefined,
        type: String(req.query.type || '').trim() || undefined,
        sourceId: String(req.query.sourceId || req.query.source_id || '').trim() || undefined,
        missionId: String(req.query.missionId || req.query.mission_id || '').trim() || undefined,
      };
      const { items, total } = await listAgentJobs(user, pagination, filters);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách job.');
    }
  });

  // Bulk cleanup of terminal (completed/failed) jobs. Never touches running jobs.
  app.post('/api/agent/jobs/cleanup', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const user = getAuthUser(req);
      const sourceId = String(req.body?.sourceId || req.body?.source_id || '').trim() || undefined;
      const statuses = Array.isArray(req.body?.statuses)
        ? (req.body.statuses as unknown[]).map(String)
        : undefined;
      const count = await deleteAgentJobsByStatus({
        companyId: user.company_id ?? undefined,
        sourceId,
        statuses,
      });
      res.json({ status: 'success', data: { deleted: count } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không dọn được job.');
    }
  });

  app.delete('/api/agent/jobs/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const existing = await getAgentJobById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy job.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      if (existing.status === 'running' || existing.status === 'claimed') {
        sendError(res, 409, 'Không thể xóa job đang chạy. Đợi job kết thúc rồi xóa.');
        return;
      }
      await deleteAgentJob(existing.id);
      res.json({ status: 'success', data: { id: existing.id } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không xóa được job.');
    }
  });

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

  app.post('/api/agent/findings/:id/promote-investor-lead', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!canManageAgentConfig(user)) {
        sendError(res, 403, 'Chỉ owner/company admin mới được chuyển Lead đầu tư.');
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
      sendError(res, 500, error instanceof Error ? error.message : 'Chuyển Lead đầu tư thất bại.');
    }
  });

  app.post('/api/agent/findings/:id/save-external-inventory', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const force = Boolean((req.body || {}).force);
      const result = await saveFindingToExternalInventory({
        findingId: existing.id,
        user,
        force,
      });
      if (result.requiresConfirmation) {
        res.status(409).json({ status: 'confirm_required', data: result });
        return;
      }
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Lưu giỏ hàng ngoài thất bại.');
    }
  });

  app.post('/api/agent/findings/:id/match', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const body = (req.body || {}) as Record<string, unknown>;
      if (body.itemId && body.inventoryKind) {
        const saved = await saveFindingMatchEvent({
          findingId: existing.id,
          user,
          inventoryKind: String(body.inventoryKind) as 'official' | 'external',
          itemId: String(body.itemId),
          matchScore: Number(body.matchScore || 0),
          reasons: Array.isArray(body.reasons) ? body.reasons.map(String) : [],
          note: body.note != null ? String(body.note) : undefined,
          sentToClient: Boolean(body.sentToClient),
        });
        res.json({ status: 'success', data: saved });
        return;
      }
      const result = await matchFindingInventories({ findingId: existing.id, user });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Matching thất bại.');
    }
  });

  app.get('/api/agent/findings/:id/matches', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const live = String(req.query.live || '1') !== '0';
      if (live) {
        const result = await matchFindingInventories({ findingId: existing.id, user });
        res.json({ status: 'success', data: result });
        return;
      }
      const events = await listFindingMatchEvents(existing.id, user);
      res.json({ status: 'success', data: { events } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được matches.');
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

  app.get('/api/agent/external-inventory', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const q = req.query as Record<string, unknown>;
      const bool = (v: unknown) => v === true || v === '1' || v === 'true' || v === 'yes';
      const { items, total } = await listExternalInventory(user, pagination, {
        transactionType: String(q.transactionType || q.transaction_type || '').trim() || undefined,
        propertyType: String(q.propertyType || q.property_type || '').trim() || undefined,
        city: String(q.city || '').trim() || undefined,
        hasPhone: q.hasPhone !== undefined || q.has_phone !== undefined
          ? bool(q.hasPhone ?? q.has_phone)
          : undefined,
        verificationStatus:
          String(q.verificationStatus || q.verification_status || '').trim() || undefined,
        status: String(q.status || '').trim() || undefined,
        search: String(q.search || '').trim() || undefined,
        minPrice: q.minPrice != null ? Number(q.minPrice) : undefined,
        maxPrice: q.maxPrice != null ? Number(q.maxPrice) : undefined,
      });
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được giỏ hàng ngoài.');
    }
  });

  app.get('/api/agent/external-inventory/:id', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const item = await getExternalInventoryById(req.params.id, user);
      if (!item) {
        sendError(res, 404, 'Không tìm thấy item.');
        return;
      }
      res.json({ status: 'success', data: item });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được item.');
    }
  });

  app.patch('/api/agent/external-inventory/:id', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const updated = await patchExternalInventory(req.params.id, user, {
        status: body.status != null ? String(body.status) : undefined,
        verificationStatus:
          body.verificationStatus != null
            ? String(body.verificationStatus)
            : body.verification_status != null
              ? String(body.verification_status)
              : undefined,
        note: body.note != null ? String(body.note) : undefined,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được item.');
    }
  });

  app.post('/api/agent/external-inventory/:id/convert-to-official', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await convertExternalInventoryToOfficial({
        itemId: req.params.id,
        user,
        confirm: body.confirm === true || body.confirm === '1' || body.confirm === 'true',
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Chuyển kho chính thức thất bại.');
    }
  });

  app.post('/api/agent/external-inventory/:id/call', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const verificationStatus = String(
        body.verificationStatus || body.verification_status || body.status || '',
      ).trim();
      if (!verificationStatus) {
        sendError(res, 400, 'Thiếu verificationStatus.');
        return;
      }
      const result = await updateExternalInventoryCallStatus({
        itemId: req.params.id,
        user,
        verificationStatus,
        note: body.note != null ? String(body.note) : null,
        status: body.itemStatus != null ? String(body.itemStatus) : body.item_status != null ? String(body.item_status) : null,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Cập nhật cuộc gọi thất bại.');
    }
  });

  app.post('/api/agent/findings/:id/action-proposals', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const body = (req.body || {}) as Record<string, unknown>;
      const actionType = body.actionType !== undefined ? String(body.actionType).trim() : undefined;
      if (actionType && !isValidActionType(actionType)) {
        sendError(res, 400, 'actionType không hợp lệ.');
        return;
      }

      const created = await createProposalsFromFinding({
        user,
        findingId: existing.id,
        actionType,
        count: body.count !== undefined ? Number(body.count) : undefined,
      });
      res.json({ status: 'success', data: created });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được đề xuất phản hồi.');
    }
  });

  app.get('/api/agent/action-proposals', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      if (status && !isValidProposalStatus(status)) {
        sendError(res, 400, 'status không hợp lệ.');
        return;
      }
      const actionType = String(req.query.actionType || req.query.action_type || '').trim() || undefined;
      if (actionType && !isValidActionType(actionType)) {
        sendError(res, 400, 'actionType không hợp lệ.');
        return;
      }
      const findingId = String(req.query.findingId || req.query.finding_id || '').trim() || undefined;

      const { items, total } = await listActionProposals(user, pagination, {
        status,
        actionType,
        findingId,
      });
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được hàng chờ đề xuất.');
    }
  });

  app.get('/api/agent/action-proposals/:id', async (req: Request, res: Response) => {
    try {
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      res.json({ status: 'success', data: existing });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được đề xuất.');
    }
  });

  app.patch('/api/agent/action-proposals/:id', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const body = (req.body || {}) as Record<string, unknown>;
      const updated = await updateProposalDraft({
        user,
        proposalId: existing.id,
        draftText: body.draftText !== undefined ? String(body.draftText) : undefined,
        rationale: body.rationale !== undefined ? String(body.rationale) : undefined,
        riskLevel: body.riskLevel !== undefined ? String(body.riskLevel) : undefined,
        actionType: body.actionType !== undefined ? String(body.actionType) : undefined,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không cập nhật được đề xuất.';
      sendError(res, message.includes('Chỉ sửa') ? 400 : 500, message);
    }
  });

  app.post('/api/agent/action-proposals/:id/approve', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const updated = await approveProposal({ user, proposalId: existing.id });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không approve được đề xuất.';
      sendError(res, message.includes('Chỉ approve') ? 400 : 500, message);
    }
  });

  app.post('/api/agent/action-proposals/:id/reject', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const reason = (req.body as { reason?: string } | undefined)?.reason;
      const updated = await rejectProposal({
        user,
        proposalId: existing.id,
        reason: reason !== undefined ? String(reason) : undefined,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không reject được đề xuất.';
      sendError(res, message.includes('Không reject') ? 400 : 500, message);
    }
  });

  app.post('/api/agent/action-proposals/:id/copy', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const markApproved = Boolean((req.body as { markApproved?: boolean } | undefined)?.markApproved);
      const result = await copyProposalText({
        user,
        proposalId: existing.id,
        markApproved,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không copy được đề xuất.';
      sendError(res, message.includes('Không copy') ? 400 : 500, message);
    }
  });

  app.get('/api/agent/action-proposals/:id/audits', async (req: Request, res: Response) => {
    try {
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const audits = await listProposalAudits(existing.id);
      res.json({ status: 'success', data: audits });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được audit log.');
    }
  });

  app.get('/api/agent/notifications', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      const { items, total } = await listAgentNotifications(user, pagination, { status });
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được thông báo.');
    }
  });

  app.get('/api/agent/notifications/unread-count', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const unread = await countUnreadAgentNotifications(user);
      res.json({ status: 'success', data: { unread } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không đếm được thông báo.');
    }
  });

  app.patch('/api/agent/notifications/read-all', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const updated = await markAllAgentNotificationsRead(user);
      res.json({ status: 'success', data: { updated } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không đánh dấu đã đọc.');
    }
  });

  app.patch('/api/agent/notifications/:id/read', async (req: Request, res: Response) => {
    try {
      const existing = await getAgentNotificationById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy thông báo.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const user = getAuthUser(req);
      if (user.role === 'member' && existing.userId && existing.userId !== user.id) {
        sendError(res, 403, 'Bạn không có quyền đọc thông báo này.');
        return;
      }

      const updated = await markNotificationRead(existing.id);
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được thông báo.');
    }
  });

  app.get('/api/agent/sessions', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      const { items, total } = await listBrowserSessions(user, pagination, { status });
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được browser sessions.');
    }
  });

  app.get('/api/agent/runtime', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../modules/control-plane');
      const refreshMetrics =
        String(req.query.refresh || '').trim() === '1' ||
        String(req.query.refresh || '').trim().toLowerCase() === 'true';
      const data = await ControlPlane.getRuntime(user, { refreshMetrics });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được runtime observability.');
    }
  });

  app.get('/api/agent/fleet', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { opsGetFleet } = await import('../modules/control-plane/operationsService');
      const companyId = user.role === 'owner' ? null : user.company_id ?? null;
      const data = await opsGetFleet(companyId);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được fleet.');
    }
  });

  app.get('/api/agent/operations', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { opsGetOperationsMetrics } = await import('../modules/control-plane/operationsService');
      const companyId = user.role === 'owner' ? null : user.company_id ?? null;
      const refresh =
        String(req.query.refresh || '').trim() === '1' ||
        String(req.query.refresh || '').trim().toLowerCase() === 'true';
      const data = await opsGetOperationsMetrics({
        companyId,
        refresh,
        reason: refresh ? 'manual' : 'dashboard',
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được operations metrics.');
    }
  });

  app.get('/api/agent/agents', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../modules/control-plane');
      const onlineOnly = String(req.query.onlineOnly || '').trim() === '1';
      const data = await ControlPlane.listAgents({
        companyId: user.role === 'owner' ? undefined : user.company_id ?? '__none__',
        onlineOnly,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được agent registry.');
    }
  });

  app.get('/api/agent/runtime/events', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../modules/control-plane');
      const limit = Number(req.query.limit || 50);
      const data = await ControlPlane.listEvents({
        companyId: user.role === 'owner' ? undefined : user.company_id ?? null,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được runtime events.');
    }
  });

  app.get('/api/agent/reports/control-plane', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../modules/control-plane');
      const kindRaw = String(req.query.kind || 'daily').trim().toLowerCase();
      const allowed = new Set([
        'daily',
        'weekly',
        'campaign',
        'publish',
        'scanner',
        'runtime_health',
        'agent',
        'browser',
        'fleet',
        'failed',
      ]);
      const kind = allowed.has(kindRaw) ? kindRaw : 'daily';
      const date = String(req.query.date || '').trim() || undefined;
      const data = await ControlPlane.report(user, kind as never, { date });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được control-plane report.');
    }
  });

  /** Shared Command Engine — Web / CLI / any client */
  app.post('/api/agent/console/command', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const text = String(req.body?.text || req.body?.command || '').trim();
      if (!text) {
        sendError(res, 400, 'Thiếu text command.');
        return;
      }
      const { ControlPlane } = await import('../modules/control-plane');
      const data = await ControlPlane.command(text, {
        user,
        companyId:
          typeof req.body?.companyId === 'string'
            ? req.body.companyId
            : user.company_id ?? null,
        client: 'web',
        triggeredBy: user.id,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Console command thất bại.');
    }
  });

  app.post('/api/agent/telegram/command', async (req: Request, res: Response) => {
    try {
      getAuthUser(req);
      const text = String(req.body?.text || req.body?.command || '').trim();
      if (!text) {
        sendError(res, 400, 'Thiếu text command.');
        return;
      }
      const { ControlPlane } = await import('../modules/control-plane');
      const data = await ControlPlane.telegramCommand(text, {
        companyId: typeof req.body?.companyId === 'string' ? req.body.companyId : null,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Telegram command thất bại.');
    }
  });

  app.get('/api/agent/reports/daily', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const date = String(req.query.date || '').trim() || undefined;
      const includeAiRaw = String(req.query.includeAiSummary ?? 'true').trim().toLowerCase();
      const includeAiSummary = includeAiRaw !== '0' && includeAiRaw !== 'false' && includeAiRaw !== 'no';

      const report = await getDailyAgentReport(user, { date, includeAiSummary });
      res.json({ status: 'success', data: report });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được báo cáo ngày.');
    }
  });

  // ─── Spam & Block Rules (AI Scanner 2.0) ─────────────────────────────
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
      const { prisma } = await import('../prisma');
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
