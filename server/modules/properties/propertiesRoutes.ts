import { Router, type Request, type Response } from 'express';
import { readDatabase, writeDatabase, saveGeneratedContent } from '../../dbHelper';
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

router.post('/api/properties', async (req: Request, res: Response) => {
  const db = readDatabase();
  const propData = req.body;
  
  const now = new Date().toISOString();
  const authUser = getAuthUser(req);
  const newProperty: Property = {
    id: `p-${Date.now()}`,
    created_at: now,
    created_by_user_id: authUser.id,
    title: propData.title || 'BĐS Chưa đặt tên',
    transaction_type: String(propData.transaction_type || '').toLowerCase() === 'cho thuê' ? 'Cho thuê' : 'Bán',
    type: propData.type || 'Đất nền',
    location: propData.location || '',
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
    ...accessDefaults(req, propData)
  };

  db.properties.unshift(newProperty);
  
  // Trigger automation: Khi thêm mới bất động sản
  triggerAutomationEvent('Khi thêm mới bất động sản', `Thêm BĐS: ${newProperty.title}`, db);

  const indexedProperty = 0;
  db.properties[indexedProperty] = applyPropertyHashtagSeo(db.properties[indexedProperty]);
  syncSiteSeoKeywords(db);

  await writeDatabase(db);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: db.properties[indexedProperty] });
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

  db.properties[index] = applyPropertyHashtagSeo({
    ...db.properties[index],
    ...req.body,
    created_by_user_id:
      db.properties[index].created_by_user_id
      || db.properties[index].owner_user_id,
    public_view_count: req.body.public_view_count ?? db.properties[index].public_view_count ?? 0,
    last_public_view_at: req.body.last_public_view_at ?? db.properties[index].last_public_view_at
  });

  syncSiteSeoKeywords(db);
  await writeDatabase(db);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: db.properties[index] });
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

  db.properties[index] = {
    ...db.properties[index],
    sale_status: 'hidden'
  };
  await writeDatabase(db);
  clearCacheKey('public-properties');
  clearCacheKey('public-homepage');
  res.json({ status: 'success', data: db.properties[index], message: 'Soft deleted property.' });
  return;
  await writeDatabase(db);
  res.json({ status: 'success', message: 'Đã xóa bất động sản thành công' });
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
          existingPost.content = content[platform];
          existingPost.title = content.seo?.title || existingPost.title;
          existingPost.seo_title = content.seo?.title;
          existingPost.meta_description = content.seo?.meta_description;
          existingPost.keywords = content.seo?.keywords || [];
          existingPost.hashtags = platform === 'zalo' ? [] : (content.seo?.hashtags || []);
        } else {
          db.posts.push({
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
          });
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

    await writeDatabase(db);
    res.json({ status: 'success', data: property });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

  return router;
}
