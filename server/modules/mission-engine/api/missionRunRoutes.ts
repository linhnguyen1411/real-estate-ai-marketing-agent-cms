import type { Express, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma';
import type { AgentRouteDeps } from '../../../agent/agentTypes';
import { canAccessAgentRecord, paginatedMeta } from '../../../agent/agentDb';
import { parsePagination } from '../../../agent/agentValidation';
import { assertValidPipeline, validateWorkflowPipeline } from '../domain/workflowValidation';
import { resolveMissionPipeline } from '../domain/missionTemplates';
import {
  completeMissionRunIfSettled,
  getMissionRunById,
  listMissionRuns,
  updateMissionRun,
} from '../repositories/missionRunRepository';
import {
  cancelPendingSteps,
  listStepRunsForMissionRun,
} from '../repositories/workflowStepRunRepository';
import { executeContentWorkflow } from '../application/workflowExecutionService';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

async function syncMissionSources(input: {
  missionId: string;
  companyId: string | null;
  sourceIds: string[];
}) {
  const unique = [...new Set(input.sourceIds.map(s => s.trim()).filter(Boolean))];
  await prisma.$transaction(async tx => {
    if (unique.length === 0) {
      await tx.agentMissionSource.updateMany({
        where: { missionId: input.missionId },
        data: { isActive: false },
      });
      return;
    }
    await tx.agentMissionSource.deleteMany({
      where: { missionId: input.missionId, sourceId: { notIn: unique } },
    });
    for (const sourceId of unique) {
      await tx.agentMissionSource.upsert({
        where: { missionId_sourceId: { missionId: input.missionId, sourceId } },
        create: {
          companyId: input.companyId,
          missionId: input.missionId,
          sourceId,
          isActive: true,
        },
        update: { isActive: true, companyId: input.companyId },
      });
    }
  });
}

function extractSourceIds(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.sourceIds)) return [];
  return body.sourceIds.map(id => String(id).trim()).filter(Boolean);
}

export { syncMissionSources };

/** Mission 2.0 API additions — does not replace legacy mission CRUD. */
export function registerMissionEngineRoutes(app: Express, deps: AgentRouteDeps) {
  const { getAuthUser } = deps;

  const requireManage = (req: Request, res: Response): boolean => {
    const user = getAuthUser(req);
    if (!user?.id) {
      sendError(res, 401, 'Unauthorized');
      return false;
    }
    return true;
  };

  const assertAccess = (
    req: Request,
    res: Response,
    companyId: string | null | undefined,
  ): boolean => {
    const user = getAuthUser(req);
    if (!canAccessAgentRecord(user, companyId)) {
      sendError(res, 403, 'Forbidden');
      return false;
    }
    return true;
  };

  app.post('/api/agent/missions/validate-pipeline', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    const result = validateWorkflowPipeline(req.body?.pipeline ?? req.body);
    res.status(result.ok ? 200 : 400).json({ status: result.ok ? 'success' : 'error', data: result });
  });

  app.post('/api/agent/missions/:id/pause', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const mission = await prisma.agentMission.findUnique({ where: { id: req.params.id } });
      if (!mission) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertAccess(req, res, mission.companyId)) return;
      const updated = await prisma.agentMission.update({
        where: { id: mission.id },
        data: { status: 'paused' },
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không pause được mission.');
    }
  });

  app.post('/api/agent/missions/:id/activate', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const mission = await prisma.agentMission.findUnique({ where: { id: req.params.id } });
      if (!mission) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertAccess(req, res, mission.companyId)) return;
      const updated = await prisma.agentMission.update({
        where: { id: mission.id },
        data: { status: 'active' },
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không activate được mission.');
    }
  });

  app.get('/api/agent/missions/:id/runs', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const mission = await prisma.agentMission.findUnique({ where: { id: req.params.id } });
      if (!mission) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertAccess(req, res, mission.companyId)) return;
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const { items, total } = await listMissionRuns({
        missionId: mission.id,
        companyId: user.company_id ?? mission.companyId,
        skip: pagination.skip,
        take: pagination.limit,
      });
      res.json({ status: 'success', data: items, meta: paginatedMeta(total, pagination) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được runs.');
    }
  });

  app.get('/api/agent/mission-runs/:runId', async (req: Request, res: Response) => {
    try {
      const run = await getMissionRunById(req.params.runId);
      if (!run) {
        sendError(res, 404, 'Không tìm thấy mission run.');
        return;
      }
      if (!assertAccess(req, res, run.companyId)) return;
      const steps = await listStepRunsForMissionRun(run.id);
      res.json({ status: 'success', data: { ...run, steps } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được mission run.');
    }
  });

  app.get('/api/agent/mission-runs/:runId/steps', async (req: Request, res: Response) => {
    try {
      const run = await getMissionRunById(req.params.runId);
      if (!run) {
        sendError(res, 404, 'Không tìm thấy mission run.');
        return;
      }
      if (!assertAccess(req, res, run.companyId)) return;
      const steps = await listStepRunsForMissionRun(run.id);
      res.json({ status: 'success', data: steps });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được steps.');
    }
  });

  app.post('/api/agent/mission-runs/:runId/cancel', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const run = await getMissionRunById(req.params.runId);
      if (!run) {
        sendError(res, 404, 'Không tìm thấy mission run.');
        return;
      }
      if (!assertAccess(req, res, run.companyId)) return;
      await updateMissionRun(run.id, {
        status: 'cancelled',
        completedAt: new Date(),
        error: 'Cancelled by user',
      });
      await cancelPendingSteps(run.id);
      await prisma.agentJob.updateMany({
        where: {
          missionRunId: run.id,
          status: { in: ['queued', 'claimed'] },
        },
        data: { status: 'cancelled', finishedAt: new Date() },
      });
      res.json({ status: 'success', data: { id: run.id, status: 'cancelled' } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cancel được run.');
    }
  });

  app.post('/api/agent/mission-runs/:runId/retry-failed', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const run = await getMissionRunById(req.params.runId);
      if (!run) {
        sendError(res, 404, 'Không tìm thấy mission run.');
        return;
      }
      if (!assertAccess(req, res, run.companyId)) return;

      const steps = await listStepRunsForMissionRun(run.id);
      const failedContentIds = [
        ...new Set(
          steps
            .filter(s => s.status === 'failed' && s.scannedContentId)
            .map(s => s.scannedContentId as string),
        ),
      ];

      await prisma.agentWorkflowStepRun.updateMany({
        where: { missionRunId: run.id, status: 'failed' },
        data: {
          status: 'pending',
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          durationMs: null,
        },
      });

      let retried = 0;
      for (const scannedContentId of failedContentIds) {
        const sample = steps.find(s => s.scannedContentId === scannedContentId);
        await executeContentWorkflow({
          missionRunId: run.id,
          scannedContentId,
          jobId: sample?.jobId,
          sourceId: sample?.sourceId,
        });
        retried += 1;
      }

      await updateMissionRun(run.id, { status: 'running', completedAt: null, error: null });
      await completeMissionRunIfSettled(run.id);
      res.json({ status: 'success', data: { retried } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không retry được.');
    }
  });

  app.patch('/api/agent/missions/:id/workflow', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const mission = await prisma.agentMission.findUnique({ where: { id: req.params.id } });
      if (!mission) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertAccess(req, res, mission.companyId)) return;

      const body = (req.body || {}) as Record<string, unknown>;
      const data: Prisma.AgentMissionUpdateInput = {};

      if (body.pipeline !== undefined) {
        const pipeline = assertValidPipeline(body.pipeline);
        data.pipeline = pipeline as unknown as Prisma.InputJsonValue;
        data.pipelineVersion = pipeline.version;
      }
      if (body.status !== undefined) data.status = String(body.status);
      if (body.name !== undefined) data.name = String(body.name);
      if (body.objective !== undefined) data.objective = String(body.objective);

      let updated = await prisma.agentMission.update({ where: { id: mission.id }, data });

      if (Array.isArray(body.sourceIds)) {
        const sourceIds = extractSourceIds(body);
        await syncMissionSources({
          missionId: mission.id,
          companyId: mission.companyId,
          sourceIds,
        });
        const rules = {
          ...((mission.rules as Record<string, unknown>) || {}),
          sourceIds,
        };
        updated = await prisma.agentMission.update({
          where: { id: mission.id },
          data: { rules: rules as Prisma.InputJsonValue },
        });
      }

      res.json({
        status: 'success',
        data: {
          ...updated,
          pipelineResolved: resolveMissionPipeline(updated),
        },
      });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không cập nhật workflow.');
    }
  });
}
