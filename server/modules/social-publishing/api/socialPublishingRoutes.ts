import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../../../agent/agentTypes';
import { canAccessAgentRecord, canManageAgentConfig } from '../../../agent/agentDb';
import { listAuditLogs } from '../auditService';
import {
  activateChannel,
  connectPageToken,
  createChannel,
  getChannelById,
  listChannels,
  pauseChannel,
  updateChannel,
  verifyChannel,
} from '../channelService';
import {
  approveDraft,
  approveAndSchedule,
  createDraft,
  getDraftById,
  listDrafts,
  publishNow,
  rejectDraft,
  submitForReview,
  updateDraft,
} from '../draftService';
import { listAttempts, listAttemptsForJob } from '../attemptService';
import { cancelJob, getJobById, listJobs, retryJob } from '../jobService';
import { canScheduleDraftStatus } from '../safetyService';
import { DEFAULT_SAFETY_SETTINGS } from '../types';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerSocialPublishingRoutes(app: Express, deps: AgentRouteDeps) {
  const { getAuthUser, accessDefaults } = deps;

  function requireManage(req: Request, res: Response): boolean {
    const user = getAuthUser(req);
    if (!canManageAgentConfig(user)) {
      sendError(res, 403, 'Bạn không có quyền quản lý Social Publishing.');
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

  // ── Channels ──────────────────────────────────────────────
  app.get('/api/social/channels', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const companyId = user.role === 'owner' ? undefined : user.company_id ?? '__none__';
      const data = await listChannels({
        companyId,
        type: String(req.query.type || '').trim() || undefined,
        status: String(req.query.status || '').trim() || undefined,
        includeInactive: String(req.query.includeInactive || '') === '1',
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được channels.');
    }
  });

  app.post('/api/social/channels', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const access = accessDefaults(req, req.body as Record<string, unknown>);
      const body = (req.body || {}) as Record<string, unknown>;
      const channel = await createChannel({
        companyId: access.company_id || user.company_id,
        type: String(body.type || ''),
        name: String(body.name || ''),
        externalId: body.externalId != null ? String(body.externalId) : null,
        profileUrl: body.profileUrl != null ? String(body.profileUrl) : null,
        executionMode: String(body.executionMode || 'browser'),
        browserSessionId: body.browserSessionId != null ? String(body.browserSessionId) : null,
        config: (body.config && typeof body.config === 'object'
          ? (body.config as Record<string, unknown>)
          : {}),
        actor: user.id,
      });
      res.status(201).json({ status: 'success', data: channel });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không tạo được channel.');
    }
  });

  app.patch('/api/social/channels/:id', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getChannelById(req.params.id);
      if (!existing) return sendError(res, 404, 'Channel not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const channel = await updateChannel(req.params.id, {
        name: body.name != null ? String(body.name) : undefined,
        externalId: body.externalId !== undefined ? (body.externalId as string | null) : undefined,
        profileUrl: body.profileUrl !== undefined ? (body.profileUrl as string | null) : undefined,
        browserSessionId:
          body.browserSessionId !== undefined ? (body.browserSessionId as string | null) : undefined,
        executionMode: body.executionMode != null ? String(body.executionMode) : undefined,
        config:
          body.config && typeof body.config === 'object'
            ? (body.config as Record<string, unknown>)
            : undefined,
        actor: user.id,
      });
      res.json({ status: 'success', data: channel });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không cập nhật được channel.');
    }
  });

  app.post('/api/social/channels/:id/test', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getChannelById(req.params.id);
      if (!existing) return sendError(res, 404, 'Channel not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const health = await verifyChannel(req.params.id);
      res.json({ status: 'success', data: health });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Test channel failed.');
    }
  });

  app.post('/api/social/channels/:id/pause', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getChannelById(req.params.id);
      if (!existing) return sendError(res, 404, 'Channel not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const data = await pauseChannel(req.params.id, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Pause failed.');
    }
  });

  app.post('/api/social/channels/:id/activate', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getChannelById(req.params.id);
      if (!existing) return sendError(res, 404, 'Channel not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const data = await activateChannel(req.params.id, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Activate failed.');
    }
  });

  app.post('/api/social/channels/:id/connect', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getChannelById(req.params.id);
      if (!existing) return sendError(res, 404, 'Channel not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const pageAccessToken = String(body.pageAccessToken || '').trim();
      if (!pageAccessToken) return sendError(res, 400, 'pageAccessToken is required');
      const channel = await connectPageToken(req.params.id, {
        pageAccessToken,
        pageId: body.pageId != null ? String(body.pageId) : undefined,
        pageName: body.pageName != null ? String(body.pageName) : undefined,
        actor: user.id,
      });
      // Verify after connect so connection fields are fresh
      let health = null;
      try {
        health = await verifyChannel(req.params.id);
      } catch {
        // connect still succeeded
      }
      res.json({ status: 'success', data: { channel, health } });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Connect failed.');
    }
  });

  // ── Drafts ────────────────────────────────────────────────
  app.get('/api/social/drafts', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const companyId = user.role === 'owner' ? undefined : user.company_id ?? '__none__';
      const data = await listDrafts({
        companyId,
        status: String(req.query.status || '').trim() || undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được drafts.');
    }
  });

  app.post('/api/social/drafts', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const access = accessDefaults(req, req.body as Record<string, unknown>);
      const body = (req.body || {}) as Record<string, unknown>;
      const draft = await createDraft({
        companyId: access.company_id || user.company_id,
        title: body.title != null ? String(body.title) : null,
        body: String(body.body || ''),
        linkUrl: body.linkUrl != null ? String(body.linkUrl) : null,
        createdBy: user.id,
        metadata:
          body.metadata && typeof body.metadata === 'object'
            ? (body.metadata as Record<string, unknown>)
            : {},
        media: Array.isArray(body.media) ? (body.media as never[]) : undefined,
      });
      res.status(201).json({ status: 'success', data: draft });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không tạo được draft.');
    }
  });

  app.patch('/api/social/drafts/:id', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getDraftById(req.params.id);
      if (!existing) return sendError(res, 404, 'Draft not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const draft = await updateDraft(req.params.id, {
        title: body.title !== undefined ? (body.title as string | null) : undefined,
        body: body.body != null ? String(body.body) : undefined,
        linkUrl: body.linkUrl !== undefined ? (body.linkUrl as string | null) : undefined,
        metadata:
          body.metadata && typeof body.metadata === 'object'
            ? (body.metadata as Record<string, unknown>)
            : undefined,
        media: Array.isArray(body.media) ? (body.media as never[]) : undefined,
        actor: user.id,
      });
      res.json({ status: 'success', data: draft });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không cập nhật được draft.');
    }
  });

  app.post('/api/social/drafts/:id/submit-review', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getDraftById(req.params.id);
      if (!existing) return sendError(res, 404, 'Draft not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const data = await submitForReview(req.params.id, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Submit review failed.');
    }
  });

  app.post('/api/social/drafts/:id/approve', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getDraftById(req.params.id);
      if (!existing) return sendError(res, 404, 'Draft not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const channelId = body.channelId != null ? String(body.channelId) : '';
      const scheduledAtRaw = body.scheduledAt != null ? String(body.scheduledAt) : '';
      if (channelId && scheduledAtRaw) {
        const scheduledAt = new Date(scheduledAtRaw);
        if (Number.isNaN(scheduledAt.getTime())) {
          return sendError(res, 400, 'Invalid scheduledAt');
        }
        const data = await approveAndSchedule(req.params.id, channelId, scheduledAt, user.id);
        return res.json({ status: 'success', data });
      }
      const data = await approveDraft(req.params.id, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Approve failed.');
    }
  });

  app.post('/api/social/drafts/:id/reject', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getDraftById(req.params.id);
      if (!existing) return sendError(res, 404, 'Draft not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const data = await rejectDraft(
        req.params.id,
        user.id,
        body.reason != null ? String(body.reason) : undefined,
      );
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Reject failed.');
    }
  });

  app.post('/api/social/drafts/:id/schedule', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getDraftById(req.params.id);
      if (!existing) return sendError(res, 404, 'Draft not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const channelId = String(body.channelId || '').trim();
      const scheduledAt = new Date(String(body.scheduledAt || ''));
      if (!channelId || Number.isNaN(scheduledAt.getTime())) {
        return sendError(res, 400, 'channelId and scheduledAt are required');
      }
      if (!canScheduleDraftStatus(existing.status)) {
        return sendError(
          res,
          400,
          `Draft must be approved before schedule (status=${existing.status}). Use approve+schedule or publish-now.`,
        );
      }
      const data = await approveAndSchedule(req.params.id, channelId, scheduledAt, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Schedule failed.');
    }
  });

  app.post('/api/social/drafts/:id/publish-now', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const existing = await getDraftById(req.params.id);
      if (!existing) return sendError(res, 404, 'Draft not found');
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const user = getAuthUser(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const channelId = String(body.channelId || '').trim();
      if (!channelId) return sendError(res, 400, 'channelId is required');
      const data = await publishNow(req.params.id, channelId, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Publish-now failed.');
    }
  });

  // ── Jobs ──────────────────────────────────────────────────
  app.get('/api/social/jobs', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const companyId = user.role === 'owner' ? undefined : user.company_id ?? '__none__';
      const data = await listJobs({
        companyId,
        status: String(req.query.status || '').trim() || undefined,
        channelId: String(req.query.channelId || '').trim() || undefined,
        draftId: String(req.query.draftId || '').trim() || undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được jobs.');
    }
  });

  app.post('/api/social/jobs/:id/cancel', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const job = await getJobById(req.params.id);
      if (!job) return sendError(res, 404, 'Job not found');
      if (!assertRecordAccess(req, res, job.companyId)) return;
      const data = await cancelJob(req.params.id, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Cancel failed.');
    }
  });

  app.post('/api/social/jobs/:id/retry', async (req: Request, res: Response) => {
    try {
      if (!requireManage(req, res)) return;
      const user = getAuthUser(req);
      const job = await getJobById(req.params.id);
      if (!job) return sendError(res, 404, 'Job not found');
      if (!assertRecordAccess(req, res, job.companyId)) return;
      const data = await retryJob(req.params.id, user.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Retry failed.');
    }
  });

  app.get('/api/social/jobs/:id/attempts', async (req: Request, res: Response) => {
    try {
      const job = await getJobById(req.params.id);
      if (!job) return sendError(res, 404, 'Job not found');
      if (!assertRecordAccess(req, res, job.companyId)) return;
      const data = await listAttemptsForJob(req.params.id);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được attempts.');
    }
  });

  app.get('/api/social/attempts', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const companyId = user.role === 'owner' ? undefined : user.company_id ?? '__none__';
      const limitRaw = Number(req.query.limit);
      const data = await listAttempts({
        companyId,
        jobId: String(req.query.jobId || '').trim() || undefined,
        channelId: String(req.query.channelId || '').trim() || undefined,
        limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được attempts.');
    }
  });

  // ── Audit + settings ──────────────────────────────────────
  app.get('/api/social/audit', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const companyId = user.role === 'owner' ? undefined : user.company_id ?? '__none__';
      const data = await listAuditLogs({
        companyId,
        entityType: String(req.query.entityType || '').trim() || undefined,
        entityId: String(req.query.entityId || '').trim() || undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được audit.');
    }
  });

  app.get('/api/social/settings', async (_req: Request, res: Response) => {
    res.json({
      status: 'success',
      data: {
        ...DEFAULT_SAFETY_SETTINGS,
        allowedMime: [...DEFAULT_SAFETY_SETTINGS.allowedMime],
      },
    });
  });
}
