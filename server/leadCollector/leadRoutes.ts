import type { Express, Request, Response } from 'express';
import {
  extractOne,
  extractBatch,
  extractBulkText,
  saveOne,
  saveBatch,
  extractAndSavePosts,
  finishAutoCollectSession
} from './leadApi';
import { getExtensionCollectStats } from '../dbHelper';

type AccessDefaults = (req: Request, body?: unknown) => {
  company_id?: string;
  owner_user_id?: string;
  assigned_member_ids?: string[];
};

export function registerLeadRoutes(app: Express, accessDefaults: AccessDefaults) {
  app.post('/api/leads/extract', (req: Request, res: Response) => {
    res.json({ status: 'success', data: extractOne(req.body || {}) });
  });

  app.post('/api/leads/extract-batch', (req: Request, res: Response) => {
    res.json({ status: 'success', data: extractBatch(req.body || {}) });
  });

  app.post('/api/leads/bulk-extract', (req: Request, res: Response) => {
    res.json({ status: 'success', data: extractBulkText(req.body || {}) });
  });

  app.post('/api/leads', (req: Request, res: Response) => {
    const defaults = accessDefaults(req, req.body);
    const result = saveOne(req.body || {}, defaults);

    if (!result.saved) {
      res.status(409).json({
        status: 'error',
        message: result.reason === 'phone'
          ? 'Lead trùng số điện thoại trong CRM.'
          : 'Lead trùng URL nguồn.',
        data: { duplicate: true, reason: result.reason, customer: result.customer }
      });
      return;
    }

    res.json({ status: 'success', data: result.customer });
  });

  app.post('/api/leads/batch-save', (req: Request, res: Response) => {
    const defaults = accessDefaults(req, req.body);
    res.json({ status: 'success', data: saveBatch(req.body || {}, defaults) });
  });

  /** @deprecated Dùng POST /api/leads/batch-save với body.leads hoặc body.previews */
  app.post('/api/leads/bulk-save', (req: Request, res: Response) => {
    const defaults = accessDefaults(req, req.body);
    res.json({ status: 'success', data: saveBatch(req.body || {}, defaults) });
  });

  /** @deprecated Luồng cũ — extract + save một lần từ posts[] */
  app.post('/api/leads/batch-extract', (req: Request, res: Response) => {
    const defaults = accessDefaults(req, req.body);
    res.json({ status: 'success', data: extractAndSavePosts(req.body || {}, defaults) });
  });

  app.post('/api/leads/auto-collect/finish', (req: Request, res: Response) => {
    res.json({ status: 'success', data: finishAutoCollectSession(req.body || {}) });
  });

  app.get('/api/leads/auto-collect/stats', (_req: Request, res: Response) => {
    res.json({ status: 'success', data: getExtensionCollectStats() });
  });
}
