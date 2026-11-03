import type { Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import { canAccessAgentRecord, canManageAgentConfig } from '../agentDb';
import { sendError } from '../../utils/httpResponses';

export interface AgentRouteHelpers {
  requireManage(req: Request, res: Response): boolean;
  assertRecordAccess(
    req: Request,
    res: Response,
    companyId: string | null | undefined,
  ): boolean;
}

export function createAgentRouteHelpers(
  getAuthUser: AgentRouteDeps['getAuthUser'],
): AgentRouteHelpers {
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

  return { requireManage, assertRecordAccess };
}
