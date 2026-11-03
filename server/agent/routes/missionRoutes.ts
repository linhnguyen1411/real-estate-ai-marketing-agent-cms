import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { Prisma } from '@prisma/client';
import { createAgentMission, getAgentMissionById, listAgentMissions, paginatedMeta, updateAgentMission } from '../agentDb';
import { enqueueMissionRun } from '../agentJobService';
import { buildMissionPayloadFromTemplate, getMissionTemplateById, listMissionTemplates } from '../missionTemplates';
import { parsePagination, validateMissionCreate, validateMissionPatch } from '../agentValidation';
import { assertValidPipeline, getMissionWorkflowTemplate, listMissionWorkflowTemplates, syncMissionSources } from '../../modules/mission-engine';

export function registerMissionRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

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

}
