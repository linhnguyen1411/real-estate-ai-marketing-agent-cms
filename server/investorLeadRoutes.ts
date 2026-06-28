import { Router, Request, Response } from 'express';

import { processLeadCapture } from './investorLeadService';

import {

  getLeadByAccessToken,

  listInvestorLeads,

  recordLeadEvent,

  updateLeadStatus,

  getLeadEvents,

} from './investorLeadDb';

import { LEAD_MAGNETS, getLeadMagnet } from '../src/leadGen/leadMagnets';
import {
  getLeadMagnetContent,
  listLeadMagnetContentMeta,
} from './services/leadMagnetContentService';

import type { LeadCapturePayload } from '../src/types/investorLead';



export function createInvestorLeadPublicRouter() {

  const router = Router();



  router.get('/lead-magnets', (_req: Request, res: Response) => {

    res.json({ status: 'success', data: LEAD_MAGNETS });

  });



  router.post('/leads', async (req: Request, res: Response) => {

    try {

      const body = req.body || {};

      const name = String(body.name || '').trim();

      const phone = String(body.phone || '').trim();

      const email = String(body.email || '').trim();



      if (!name || !phone) {

        res.status(400).json({ status: 'error', message: 'Vui lòng nhập họ tên và số điện thoại.' });

        return;

      }



      const payload: LeadCapturePayload = {

        name,

        phone,

        email: email || undefined,

        city: String(body.city || '').trim() || undefined,

        interest_type: body.interest_type,

        budget_range: body.budget_range,

        source: body.source || 'website',

        channel: body.channel || 'website',

        utm_source: body.utm_source,

        utm_medium: body.utm_medium,

        utm_campaign: body.utm_campaign,

        page_path: body.page_path,

        magnet_slug: body.magnet_slug,

        short_link_slug: body.short_link_slug || body.shortLinkSlug,

        session_id: body.session_id,

        tags: Array.isArray(body.tags) ? body.tags : undefined,

        form_type: body.form_type || 'simple',

      };



      const lead = await processLeadCapture(payload);

      res.json({

        status: 'success',

        data: {

          id: lead.id,

          investor_score: lead.investor_score,

          access_token: lead.access_token,

          score_breakdown: lead.score_breakdown,

        },

      });

    } catch (error) {

      console.error('[Leads] capture error:', error);

      res.status(500).json({ status: 'error', message: 'Không lưu được thông tin. Vui lòng thử lại.' });

    }

  });



  router.post('/leads/event', async (req: Request, res: Response) => {

    try {

      const event = await recordLeadEvent({

        lead_id: req.body?.lead_id,

        session_id: req.body?.session_id,

        event_type: String(req.body?.event_type || 'unknown'),

        event_data: req.body?.event_data,

        page_path: req.body?.page_path,

      });

      res.json({ status: 'success', data: event });

    } catch {

      res.status(500).json({ status: 'error', message: 'Event failed' });

    }

  });



  router.get('/lead-magnets/:slug/content', async (req: Request, res: Response) => {

    const slug = String(req.params.slug || '');

    const token = String(req.query.token || '');

    const magnet = getLeadMagnet(slug);



    if (!magnet) {

      res.status(404).json({ status: 'error', message: 'Không tìm thấy tài liệu.' });

      return;

    }



    if (!token) {

      res.status(403).json({ status: 'error', message: 'Cần đăng ký để xem nội dung.', requires_form: true });

      return;

    }



    const lead = await getLeadByAccessToken(slug, token);

    if (!lead) {

      res.status(403).json({ status: 'error', message: 'Token không hợp lệ.', requires_form: true });

      return;

    }



    const content = getLeadMagnetContent(slug);

    if (!content) {

      res.status(404).json({ status: 'error', message: 'Nội dung tài liệu chưa sẵn sàng.' });

      return;

    }



    await recordLeadEvent({

      lead_id: lead.id,

      event_type: slug.includes('bao-cao') ? 'download_report' : 'ebook_download',

      event_data: { magnet_slug: slug },

    });



    res.json({ status: 'success', data: { magnet, content, lead_name: lead.name } });

  });



  return router;

}



export function registerInvestorLeadAdminRoutes(app: import('express').Express) {

  app.get('/api/investor-leads', async (_req: Request, res: Response) => {

    const leads = await listInvestorLeads(300);

    res.json({ status: 'success', data: leads });

  });



  app.patch('/api/investor-leads/:id/status', async (req: Request, res: Response) => {

    const status = req.body?.status;

    if (!['new', 'contacted', 'qualified', 'closed', 'lost'].includes(status)) {

      res.status(400).json({ status: 'error', message: 'Status không hợp lệ.' });

      return;

    }

    await updateLeadStatus(req.params.id, status);

    res.json({ status: 'success' });

  });



  app.get('/api/investor-leads/:id/events', async (req: Request, res: Response) => {

    res.json({ status: 'success', data: await getLeadEvents(req.params.id) });

  });



  app.get('/api/lead-magnet-content', async (_req: Request, res: Response) => {

    res.json({ status: 'success', data: listLeadMagnetContentMeta() });

  });

}

