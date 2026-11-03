import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { getAgentFindingById, paginatedMeta } from '../agentDb';
import { approveProposal, copyProposalText, createProposalsFromFinding, getActionProposalById, isValidActionType, isValidProposalStatus, listActionProposals, listProposalAudits, rejectProposal, updateProposalDraft } from '../actionProposalService';
import { parsePagination } from '../agentValidation';

export function registerActionProposalRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

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

}
