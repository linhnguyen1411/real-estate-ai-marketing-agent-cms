import { Router, type Request, type Response } from 'express';
import { readDatabase, upsertCmsRecord, writeDatabase, saveGeneratedContent } from '../../dbHelper';
import { generatePropertyMarketingContent } from '../../aiService';
import type { Property } from '../../../src/types';
import { sortByCreatedAtDesc } from '../../../src/utils/propertySort';
import { parseListQuery, paginateItems, matchesSearchText } from '../../listPagination';
import { getPropertySaleStatus } from '../../../src/utils/propertyStatus';
import { clearCacheKey } from '../../cache/publicCache';
import {
  accessDefaults,
  canAccessResource,
  canManageResource,
  getAuthUser,
  scopeCollection,
} from '../auth/authAccess';
import { applyPropertyHashtagSeo, syncSiteSeoKeywords } from '../public-site/seoKeywords';
import { triggerAutomationEvent } from '../content/triggerAutomationEvent';
import { resolvePropertyItemTitle } from '../../../src/seo/utils/buildPropertyItemTitle';
import { slugify } from '../../../src/seo/utils/slugify';
import { parseQuickPropertyText, generatePropertyJsonLd } from './quickPropertyParser';
import sanitizeHtml from 'sanitize-html';

export function sanitizeWebsiteHtml(rawHtml: string): string {
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'b', 'i', 'strong', 'em', 'strike', 'code',
      'hr', 'br', 'ul', 'ol', 'li', 'blockquote', 'a', 'span', 'div', 'table', 'thead',
      'tbody', 'tr', 'th', 'td', 'img'
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class', 'style']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  });
}

function normalizeIncomingPropertyTitle(propData: Record<string, unknown>): string {
  return resolvePropertyItemTitle({
    title: String(propData.title || ''),
    type: String(propData.type || ''),
    project_name: propData.project_name != null ? String(propData.project_name) : undefined,
    location: propData.location != null ? String(propData.location) : undefined,
    selling_points: Array.isArray(propData.selling_points)
      ? propData.selling_points.map(String)
      : propData.selling_points
        ? [String(propData.selling_points)]
        : undefined,
  });
}

export function createPropertiesRouter() {
  const router = Router();

router.get('/api/properties', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(sortByCreatedAtDesc(db.properties), req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);
  const type = String(req.query.type || '').trim();
  const transactionType = String(req.query.transactionType || req.query.transaction_type || '').trim();

  if (search) {
    items = items.filter(p =>
      matchesSearchText(
        [
          p.title,
          p.location,
          p.type,
          p.transaction_type || '',
          p.legal_status,
          p.direction,
          p.rich_description || p.description || '',
          p.internal_notes || '',
          getPropertySaleStatus(p),
        ].join(' '),
        search,
      ),
    );
  }
  if (status && status !== 'all') {
    if (status === 'visible') {
      items = items.filter(p => getPropertySaleStatus(p) !== 'hidden');
    } else {
      items = items.filter(p => getPropertySaleStatus(p) === status);
    }
  }
  if (type && type !== 'all') {
    items = items.filter(p => p.type === type);
  }
  if (transactionType && transactionType !== 'all') {
    items = items.filter(p => (p.transaction_type || 'Bán') === transactionType);
  }
  if (sort === 'price_asc') {
    items = items.slice().sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === 'price_desc') {
    items = items.slice().sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else if (sort === 'created_at_asc') {
    items = items.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }

  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

  // Quick Parse: Nhận tin nhắn raw Zalo/Facebook -> bóc tách trường + auto SEO
  const handleQuickParse = (req: Request, res: Response) => {
    const rawText = String(req.body.rawText || req.body.text || req.body.content || '').trim();
    if (!rawText) {
      res.status(400).json({ status: 'error', message: 'Vui lòng cung cấp nội dung bài đăng thô.' });
      return;
    }
    const parsed = parseQuickPropertyText(rawText);
    res.json({ status: 'success', data: parsed });
  };

  router.post('/api/admin/properties/quick-parse', handleQuickParse);
  router.post('/api/properties/quick-parse', handleQuickParse);

  // Batch Import: Nhập giỏ hàng hàng loạt từ CSV/Excel
  const handleBatchImport = async (req: Request, res: Response) => {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) {
      res.status(400).json({ status: 'error', message: 'Danh sách giỏ hàng trống.' });
      return;
    }
    const db = readDatabase();
    const authUser = getAuthUser(req);
    const now = new Date().toISOString();
    const created: Property[] = [];

    for (const item of rawItems) {
      const generatedSlug = item.slug || slugify(item.title || `${item.type || 'Đất nền'} ${item.block || ''} ${item.project_name || 'Nam Hòa Xuân'} ${item.area || 100}m2 ${item.price || ''}`);
      const newProp: Property = {
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        created_at: now,
        created_by_user_id: authUser.id,
        title: item.title || `${item.type || 'Đất nền'} ${item.block || ''} ${item.project_name || 'Nam Hòa Xuân'} - DT ${item.area || 100}m2 - Giá ${item.price || 0} tỷ`,
        slug: generatedSlug,
        seo_title: item.seo_title || `${item.title} | House & Life`,
        meta_description: item.meta_description || `${item.title} tại Đà Nẵng.`,
        transaction_type: item.transaction_type || 'Bán',
        type: item.type || 'Đất nền',
        project_name: item.project_name || 'Nam Hòa Xuân',
        block: item.block || undefined,
        lot: item.lot || undefined,
        street: item.street || undefined,
        location: item.location || `${item.project_name || 'Nam Hòa Xuân'}, Đà Nẵng`,
        area: parseFloat(item.area) || 100,
        price: parseFloat(item.price) || 0,
        direction: item.direction || 'Đông Nam',
        legal_status: item.legal_status || 'Sổ hồng riêng',
        road_width: parseFloat(item.road_width) || 7.5,
        contact_phone: item.contact_phone || undefined,
        description: item.description || item.rich_description || '',
        rich_description: item.rich_description || item.description || '',
        selling_points: Array.isArray(item.selling_points) ? item.selling_points : ['Vị trí đắc địa', 'Pháp lý an toàn'],
        images: item.images || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
        gallery_images: Array.isArray(item.gallery_images) ? item.gallery_images : [],
        sale_status: 'available',
        schema_json_ld: item.schema_json_ld || generatePropertyJsonLd({
          title: item.title,
          type: item.type || 'Đất nền',
          area: parseFloat(item.area) || 100,
          price: parseFloat(item.price) || 0,
          location: item.location || 'Nam Hòa Xuân, Đà Nẵng',
          slug: generatedSlug,
        }),
        ...accessDefaults(req, item),
      };
      const saved = await upsertCmsRecord('properties', newProp);
      created.push(saved);
    }

    clearCacheKey('public-properties');
    clearCacheKey('public-homepage');
    clearCacheKey('sitemap-xml');
    clearCacheKey('sitemap-properties');

    res.json({
      status: 'success',
      message: `Đã import thành công ${created.length} bất động sản vào giỏ hàng.`,
      count: created.length,
      data: created,
    });
  };

  router.post('/api/admin/properties/batch-import', handleBatchImport);
  router.post('/api/properties/batch-import', handleBatchImport);

router.post('/api/properties', async (req: Request, res: Response) => {
  const db = readDatabase();
  const propData = req.body;
  
  const now = new Date().toISOString();
  const authUser = getAuthUser(req);
  const normalizedTitle = normalizeIncomingPropertyTitle(propData) || 'BĐS Chưa đặt tên';
  const generatedSlug = propData.slug || slugify(normalizedTitle);
  const newProperty: Property = {
    id: `p-${Date.now()}`,
    created_at: now,
    created_by_user_id: authUser.id,
    title: normalizedTitle,
    slug: generatedSlug,
    seo_title: propData.seo_title || `${normalizedTitle} | House & Life`,
    meta_description: propData.meta_description || `${normalizedTitle} tại Đà Nẵng.`,
    transaction_type: String(propData.transaction_type || '').toLowerCase() === 'cho thuê' ? 'Cho thuê' : 'Bán',
    type: propData.type || 'Đất nền',
    location: propData.location || '',
    project_name: propData.project_name || 'Nam Hòa Xuân',
    block: propData.block || undefined,
    lot: propData.lot || undefined,
    street: propData.street || undefined,
    contact_phone: propData.contact_phone || undefined,
    area: parseFloat(propData.area) || 0,
    floor_area: parseFloat(propData.floor_area) || undefined,
    price: parseFloat(propData.price) || 0,
    legal_status: propData.legal_status || 'Sổ hồng riêng',
    direction: propData.direction || 'Đông',
    road_width: parseFloat(propData.road_width) || 5.5,
    floors: parseInt(propData.floors, 10) || undefined,
    bedrooms: parseInt(propData.bedrooms, 10) || undefined,
    bathrooms: parseInt(propData.bathrooms, 10) || undefined,
    garage: Boolean(propData.garage),
    pool: Boolean(propData.pool),
    description: propData.description || '',
    rich_description: propData.rich_description || propData.description || '',
    internal_notes: propData.internal_notes || '',
    sale_status: propData.sale_status === 'sold' || propData.sale_status === 'hidden' ? propData.sale_status : 'available',
    is_featured: Boolean(propData.is_featured),
    public_view_count: Number(propData.public_view_count || 0),
    images: propData.images || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
    gallery_images: Array.isArray(propData.gallery_images) ? propData.gallery_images : [],
    selling_points: Array.isArray(propData.selling_points) ? propData.selling_points : [propData.selling_points || 'Vị trí lý tưởng'],
    schema_json_ld: propData.schema_json_ld || generatePropertyJsonLd({
      title: normalizedTitle,
      type: propData.type || 'Đất nền',
      area: parseFloat(propData.area) || 0,
      price: parseFloat(propData.price) || 0,
      location: propData.location || '',
      slug: generatedSlug,
    }),
    ...accessDefaults(req, propData)
  };

  const seoProperty = applyPropertyHashtagSeo(newProperty);
  const savedProperty = await upsertCmsRecord('properties', seoProperty);
  
  // Trigger automation: Khi thêm mới bất động sản
  triggerAutomationEvent('Khi thêm mới bất động sản', `Thêm BĐS: ${savedProperty.title}`, db);
  syncSiteSeoKeywords(db);

  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  clearCacheKey('sitemap-xml');
  clearCacheKey('sitemap-properties');
  res.json({ status: 'success', data: savedProperty });
});

router.get('/api/properties/:id', (req: Request, res: Response) => {
  const db = readDatabase();
  const property = db.properties.find(p => p.id === req.params.id);
  if (!property) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản' });
    return;
  }
  if (!canAccessResource(property, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xem bất động sản này.' });
    return;
  }
  res.json({ status: 'success', data: property });
});

router.put('/api/properties/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.properties.findIndex(p => p.id === req.params.id);
  
  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản' });
    return;
  }

  if (!canManageResource(db.properties[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật bất động sản này.' });
    return;
  }

  const mergedBody = { ...req.body };
  if (mergedBody.title != null || mergedBody.type != null || mergedBody.project_name != null) {
    mergedBody.title = normalizeIncomingPropertyTitle({
      ...db.properties[index],
      ...mergedBody,
    });
  }

  const updatedProperty = applyPropertyHashtagSeo({
    ...db.properties[index],
    ...mergedBody,
    created_by_user_id:
      db.properties[index].created_by_user_id
      || db.properties[index].owner_user_id,
    public_view_count: mergedBody.public_view_count ?? db.properties[index].public_view_count ?? 0,
    last_public_view_at: mergedBody.last_public_view_at ?? db.properties[index].last_public_view_at,
    updated_at: new Date().toISOString(),
  });

  const savedProperty = await upsertCmsRecord('properties', updatedProperty, db.properties[index].version);
  syncSiteSeoKeywords(db);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: savedProperty });
});

router.delete('/api/properties/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.properties.findIndex(p => p.id === req.params.id);
  const target = index >= 0 ? db.properties[index] : null;
  
  if (!target || index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản' });
    return;
  }

  if (!canManageResource(target, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa bất động sản này.' });
    return;
  }

  const hiddenProperty = {
    ...target,
    sale_status: 'hidden',
    updated_at: new Date().toISOString(),
  };
  const savedHidden = await upsertCmsRecord('properties', hiddenProperty, target.version);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: savedHidden, message: 'Soft deleted property.' });
});

// POST /api/ai/generate-content
router.post('/api/ai/generate-content', async (req: Request, res: Response) => {
  const { propertyId, tone } = req.body;
  const db = readDatabase();
  const property = db.properties.find(p => p.id === propertyId);
  const user = getAuthUser(req);

  if (!property) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bất động sản để tạo marketing.' });
    return;
  }

  if (!canAccessResource(property, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền tạo nội dung cho bất động sản này.' });
    return;
  }

  try {
    const content = await generatePropertyMarketingContent(property, undefined, tone);
    if (content.website) {
      content.website = sanitizeWebsiteHtml(content.website);
    }
    property.ai_posts = content;
    
    // Auto populate posts CMS draft if requested or trigger automation representation
    const platformKeys: ('facebook' | 'zalo' | 'tiktok' | 'website')[] = ['facebook', 'zalo', 'tiktok', 'website'];
    for (const platform of platformKeys) {
      if (content[platform]) {
        await saveGeneratedContent({
          id: `gen-${Date.now()}-${platform}`,
          company_id: property.company_id,
          user_id: user.id,
          property_id: property.id,
          property_title: property.title,
          channel: platform,
          raw_content: content[platform],
          status: 'raw',
          created_at: new Date().toISOString()
        });

        // Check if there is already an AI post draft for this property/platform to update or add
        const existingPost = db.posts.find(post => post.property_id === propertyId && post.platform === platform && post.status === 'draft');
        if (existingPost) {
          const updatedPost = {
            ...existingPost,
            content: content[platform],
            title: content.seo?.title || existingPost.title,
            seo_title: content.seo?.title,
            meta_description: content.seo?.meta_description,
            keywords: content.seo?.keywords || [],
            hashtags: platform === 'zalo' ? [] : (content.seo?.hashtags || []),
            updated_at: new Date().toISOString(),
          };
          await upsertCmsRecord('posts', updatedPost, existingPost.version);
        } else {
          const newDraftPost = {
            id: `post-${Date.now()}-${platform}`,
            title: content.seo?.title || property.title,
            platform: platform,
            content: content[platform],
            status: 'draft',
            property_id: property.id,
            property_title: property.title,
            seo_title: content.seo?.title,
            meta_description: content.seo?.meta_description,
            keywords: content.seo?.keywords || [],
            hashtags: platform === 'zalo' ? [] : (content.seo?.hashtags || []),
            created_by_ai: true,
            created_at: new Date().toISOString(),
            company_id: property.company_id,
            owner_user_id: property.owner_user_id,
            assigned_member_ids: property.assigned_member_ids || []
          };
          await upsertCmsRecord('posts', newDraftPost);
        }
      }
    }

    for (const channel of ['image_prompt', 'video_prompt'] as const) {
      if (content[channel]) {
        await saveGeneratedContent({
          id: `gen-${Date.now()}-${channel}`,
          company_id: property.company_id,
          user_id: user.id,
          property_id: property.id,
          property_title: property.title,
          channel,
          raw_content: content[channel],
          status: 'raw',
          created_at: new Date().toISOString()
        });
      }
    }

    const savedProp = await upsertCmsRecord('properties', property, property.version);
    res.json({ status: 'success', data: savedProp });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

  return router;
}
