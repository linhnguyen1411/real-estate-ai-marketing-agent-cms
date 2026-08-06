import { Express, Request, Response } from 'express';
import type { Property } from '../../src/types';
import { getPublicPropertySlug } from '../../src/utils/propertyShare';
import {
  buildRedirectUrl,
  createShortLink,
  deleteShortLink,
  ensureShortLinkForEntity,
  getShortLinkAnalytics,
  getShortLinkBySlug,
  listShortLinks,
  recordShortLinkClick,
  toRedirectInput,
  updateShortLink,
} from './shortLinkDb';
import { suggestBlogShortSlug, suggestPropertyShortSlug } from './slugUtils';
import { getBlogPostBySlug } from '../blogDb';
import type { ShortLinkInput } from '../../src/types/shortLink';
import { isSocialPreviewCrawler, renderShortLinkOgHtml } from './socialCrawler';
import {
  findPropertyForShortLinkTarget,
  resolveShareMetaForShortLink,
} from './resolveShareMeta';

function getPublicOrigin(req: Request): string {
  const configured = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configured)) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function getClientIp(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || '';
}

function parseBodyInput(body: Record<string, unknown>): ShortLinkInput {
  return {
    slug: String(body.slug || '').trim() || undefined,
    target_url: String(body.target_url || body.targetUrl || '').trim(),
    title: String(body.title || '').trim() || undefined,
    description: String(body.description || '').trim() || undefined,
    entity_type: String(body.entity_type || body.entityType || '').trim() || undefined,
    entity_id: String(body.entity_id || body.entityId || '').trim() || undefined,
    campaign: String(body.campaign || '').trim() || undefined,
    utm_source: String(body.utm_source || body.utmSource || '').trim() || undefined,
    utm_medium: String(body.utm_medium || body.utmMedium || '').trim() || undefined,
    utm_campaign: String(body.utm_campaign || body.utmCampaign || '').trim() || undefined,
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    expires_at: String(body.expires_at || body.expiresAt || '').trim() || undefined,
  };
}

export function registerShortLinkRedirect(
  app: Express,
  getProperties: () => Property[],
) {
  app.get('/s/:slug', async (req: Request, res: Response) => {
    // Short link chỉ để tracking/redirect nội bộ (Zalo, Facebook, campaign...),
    // không phải trang nội dung -> luôn chặn index để tránh Google hiển thị URL rác
    // này trong kết quả tìm kiếm thay vì trang đích thật (property/landing page).
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    try {
      const slug = String(req.params.slug || '').trim();
      const shortLink = await getShortLinkBySlug(slug);

      if (!shortLink || !shortLink.is_active) {
        res.status(404).type('text/html').send(`
          <!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Link không tồn tại</title></head>
          <body style="font-family:sans-serif;text-align:center;padding:48px;">
            <h1>Link không tồn tại</h1>
            <p>Short link <strong>/${slug}</strong> không hợp lệ hoặc đã bị tắt.</p>
            <p><a href="/">Về trang chủ</a></p>
          </body></html>
        `);
        return;
      }

      if (shortLink.expires_at && new Date(shortLink.expires_at).getTime() < Date.now()) {
        res.status(410).type('text/html').send(`
          <!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Link đã hết hạn</title></head>
          <body style="font-family:sans-serif;text-align:center;padding:48px;">
            <h1>Link đã hết hạn</h1>
            <p>Short link <strong>/${slug}</strong> không còn hiệu lực.</p>
            <p><a href="/">Về trang chủ</a></p>
          </body></html>
        `);
        return;
      }

      await recordShortLinkClick({
        shortLinkId: shortLink.id,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || ''),
        referer: String(req.headers.referer || ''),
        utmSource: String(req.query.utm_source || ''),
        utmMedium: String(req.query.utm_medium || ''),
        utmCampaign: String(req.query.utm_campaign || ''),
      });

      const redirectUrl = buildRedirectUrl(toRedirectInput(shortLink), {
        utm_source: String(req.query.utm_source || ''),
        utm_medium: String(req.query.utm_medium || ''),
        utm_campaign: String(req.query.utm_campaign || ''),
      });

      const origin = getPublicOrigin(req);
      const userAgent = String(req.headers['user-agent'] || '');
      if (isSocialPreviewCrawler(userAgent)) {
        let shareMeta = await resolveShareMetaForShortLink(shortLink, origin, getProperties);
        if (!shareMeta.image.includes('/property-images/')) {
          const property = findPropertyForShortLinkTarget(shortLink.target_url, getProperties);
          if (property) {
            shareMeta = await resolveShareMetaForShortLink(
              { ...shortLink, entity_type: 'property', entity_id: property.id },
              origin,
              getProperties,
            );
          }
        }
        res
          .status(200)
          .type('text/html')
          .send(renderShortLinkOgHtml({ ...shareMeta, redirectUrl }));
        return;
      }

      res.redirect(302, redirectUrl);
    } catch (error) {
      console.error('[short-link] redirect error:', error);
      res.status(500).send('Không thể chuyển hướng link.');
    }
  });
}

export function registerShortLinkPublicRoutes(
  app: Express,
  getProperties: () => Property[],
) {
  app.get('/api/public/short-links/resolve', async (req: Request, res: Response) => {
    try {
      const entityType = String(req.query.entityType || req.query.entity_type || '').trim();
      const entityId = String(req.query.entityId || req.query.entity_id || '').trim();
      const origin = getPublicOrigin(req);

      if (!entityType || !entityId) {
        res.status(400).json({ status: 'error', message: 'Thiếu entityType hoặc entityId.' });
        return;
      }

      let targetUrl = '';
      let title = '';
      let description = '';
      let suggestedSlug = '';

      if (entityType === 'property') {
        const property = getProperties().find(item => item.id === entityId);
        if (!property || ['sold', 'hidden'].includes(property.sale_status || 'available')) {
          res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản.' });
          return;
        }
        targetUrl = `${origin}/${encodeURIComponent(getPublicPropertySlug(property))}`;
        title = property.title;
        description = property.rich_description || property.description || property.title;
        suggestedSlug = suggestPropertyShortSlug(property);
      } else if (entityType === 'blog_post') {
        const post = await getBlogPostBySlug(entityId, true);
        if (!post) {
          res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết.' });
          return;
        }
        targetUrl = `${origin}/tin-tuc/${post.slug}`;
        title = post.title;
        description = post.metaDescription || post.excerpt;
        suggestedSlug = suggestBlogShortSlug(post.slug);
      } else {
        res.status(400).json({ status: 'error', message: 'entityType không hỗ trợ.' });
        return;
      }

      const shortLink = await ensureShortLinkForEntity({
        entityType,
        entityId,
        targetUrl,
        title,
        description,
        suggestedSlug,
        origin,
        utmSource: 'share',
        utmMedium: 'short_link',
        utmCampaign: suggestedSlug,
      });

      res.json({ status: 'success', data: shortLink });
    } catch (error: any) {
      console.error('[short-link] resolve error:', error);
      res.status(500).json({ status: 'error', message: error.message || 'Không tạo được short link.' });
    }
  });
}

export function registerShortLinkAdminRoutes(app: Express) {
  app.get('/api/admin/short-links', async (req: Request, res: Response) => {
    try {
      const origin = getPublicOrigin(req);
      const links = await listShortLinks(origin);
      res.json({ status: 'success', data: links });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message || 'Không tải được short links.' });
    }
  });

  app.post('/api/admin/short-links', async (req: Request, res: Response) => {
    try {
      const input = parseBodyInput(req.body || {});
      if (!input.target_url) {
        res.status(400).json({ status: 'error', message: 'Thiếu target_url.' });
        return;
      }
      const origin = getPublicOrigin(req);
      const createdBy = (req as any).authUser?.id || undefined;
      const link = await createShortLink(input, { createdBy, origin, suggestedSlug: input.slug });
      res.json({ status: 'success', data: link });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message || 'Không tạo được short link.' });
    }
  });

  app.patch('/api/admin/short-links/:id', async (req: Request, res: Response) => {
    try {
      const input = parseBodyInput(req.body || {});
      const origin = getPublicOrigin(req);
      const link = await updateShortLink(req.params.id, input, origin);
      res.json({ status: 'success', data: link });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message || 'Không cập nhật được short link.' });
    }
  });

  app.delete('/api/admin/short-links/:id', async (req: Request, res: Response) => {
    try {
      await deleteShortLink(req.params.id);
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message || 'Không xóa được short link.' });
    }
  });

  app.get('/api/admin/short-links/:id/analytics', async (req: Request, res: Response) => {
    try {
      const analytics = await getShortLinkAnalytics(req.params.id);
      res.json({ status: 'success', data: analytics });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message || 'Không tải được analytics.' });
    }
  });
}
