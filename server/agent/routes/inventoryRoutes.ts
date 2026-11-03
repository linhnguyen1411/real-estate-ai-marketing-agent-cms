import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { getAgentFindingById, paginatedMeta } from '../agentDb';
import { getExternalInventoryById, listExternalInventory, patchExternalInventory, saveFindingToExternalInventory } from '../externalInventoryService';
import { convertExternalInventoryToOfficial } from '../externalToOfficialService';
import { updateExternalInventoryCallStatus } from '../externalInventoryCallService';
import { listFindingMatchEvents, matchFindingInventories, saveFindingMatchEvent } from '../findingMatchingService';
import { parsePagination } from '../agentValidation';

export function registerInventoryRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

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

}
