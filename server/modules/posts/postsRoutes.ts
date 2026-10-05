import { Router, type Request, type Response } from 'express';
import { readDatabase, upsertCmsRecord, deleteCmsRecord, writeDatabase } from '../../dbHelper';
import { appendStandardHashtags, buildPropertySeo } from '../../aiService';
import type { Post } from '../../../src/types';
import { parseListQuery, paginateItems, matchesSearchText } from '../../listPagination';
import {
  accessDefaults,
  canAccessResource,
  canManageResource,
  scopeCollection,
} from '../auth/authAccess';

export function createPostsRouter() {
  const router = Router();

router.get('/api/posts', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(db.posts, req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);
  if (search) {
    items = items.filter(p => matchesSearchText([p.title, p.content, p.platform].join(' '), search));
  }
  if (status) {
    items = items.filter(p => String((p as any).status || '') === status);
  }
  if (sort === 'views_desc') {
    items = items.slice().sort((a, b) => Number(b.engagement?.views || 0) - Number(a.engagement?.views || 0));
  }
  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

router.get('/api/posts/:id', (req: Request, res: Response) => {
  const db = readDatabase();
  const post = db.posts.find(p => p.id === req.params.id);
  if (!post) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
    return;
  }
  if (!canAccessResource(post, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xem bài viết này.' });
    return;
  }
  res.json({ status: 'success', data: post });
});

router.post('/api/posts', async (req: Request, res: Response) => {
  const db = readDatabase();
  const postData = req.body;
  const linkedProperty = db.properties.find(property => property.id === postData.property_id);
  const propertySeo = linkedProperty ? buildPropertySeo(linkedProperty) : null;
  const platform = postData.platform || 'facebook';
  const hashtags = propertySeo && platform !== 'zalo' ? propertySeo.hashtags : [];
  const content = hashtags.length
    ? appendStandardHashtags(postData.content || '', hashtags)
    : (postData.content || '');

  const newPost: Post = {
    id: `post-${Date.now()}`,
    title: postData.title || propertySeo?.title || 'Bài viết mới',
    platform,
    content,
    status: postData.status || 'draft',
    scheduled_at: postData.scheduled_at || '',
    property_id: postData.property_id || '',
    property_title: postData.property_title || '',
    seo_title: postData.seo_title || propertySeo?.title || postData.title || '',
    meta_description: postData.meta_description || propertySeo?.meta_description || '',
    keywords: Array.isArray(postData.keywords) ? postData.keywords : (propertySeo?.keywords || []),
    hashtags: Array.isArray(postData.hashtags) ? postData.hashtags : hashtags,
    created_by_ai: postData.created_by_ai || false,
    engagement: { views: 0, likes: 0, shares: 0, comments: 0 },
    created_at: new Date().toISOString(),
    ...accessDefaults(req, postData)
  };

  const savedPost = await upsertCmsRecord('posts', newPost);
  res.json({ status: 'success', data: savedPost });
});

router.put('/api/posts/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.posts.findIndex(p => p.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
    return;
  }

  if (!canManageResource(db.posts[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật bài viết này.' });
    return;
  }

  const oldPost = db.posts[index];
  const updatedPost = {
    ...oldPost,
    ...req.body,
    updated_at: new Date().toISOString(),
  };

  const savedPost = await upsertCmsRecord('posts', updatedPost, oldPost.version);
  res.json({ status: 'success', data: savedPost });
});

router.delete('/api/posts/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const target = db.posts.find(p => p.id === req.params.id);

  if (!target) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
    return;
  }

  if (!canManageResource(target, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa bài viết này.' });
    return;
  }

  await deleteCmsRecord('posts', req.params.id);
  res.json({ status: 'success', message: 'Đã xóa bài viết thành công' });
});

  return router;
}
