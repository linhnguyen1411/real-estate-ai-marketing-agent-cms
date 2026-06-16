import { Express, Request, Response } from 'express';
import {
  createBlogPost,
  deleteBlogPost,
  getBlogPostById,
  getBlogPostBySlug,
  listAuthors,
  listBlogPosts,
  listCategories,
  listTags,
  updateBlogPost,
} from './blogDb';

export function registerBlogPublicRoutes(app: Express) {
  app.get('/api/public/blog/posts', async (req: Request, res: Response) => {
    try {
      const categorySlug = String(req.query.category || '').trim() || undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const posts = await listBlogPosts({
        status: 'published',
        categorySlug,
        limit: limit && !Number.isNaN(limit) ? limit : undefined,
      });
      res.json({
        status: 'success',
        data: posts.map(post => ({
          ...post,
          content: undefined,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/public/blog/posts/:slug', async (req: Request, res: Response) => {
    try {
      const post = await getBlogPostBySlug(req.params.slug, true);
      if (!post) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
        return;
      }
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/public/blog/categories', async (_req: Request, res: Response) => {
    try {
      const categories = await listCategories();
      res.json({ status: 'success', data: categories });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
}

export function registerBlogAdminRoutes(app: Express) {
  app.get('/api/blog/posts', async (req: Request, res: Response) => {
    try {
      const status = String(req.query.status || '').trim() || undefined;
      const categorySlug = String(req.query.category || '').trim() || undefined;
      const posts = await listBlogPosts({ status, categorySlug });
      res.json({ status: 'success', data: posts });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/blog/posts/:id', async (req: Request, res: Response) => {
    try {
      const post = await getBlogPostById(req.params.id);
      if (!post) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
        return;
      }
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/posts', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const post = await createBlogPost({
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt,
        content: body.content,
        metaTitle: body.metaTitle || body.meta_title,
        metaDescription: body.metaDescription || body.meta_description,
        coverImage: body.coverImage || body.cover_image,
        status: body.status,
        categoryId: body.categoryId || body.category_id,
        authorId: body.authorId || body.author_id,
        publishedAt: body.publishedAt || body.published_at,
        tagIds: body.tagIds || body.tag_ids,
        faqs: body.faqs,
      });
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.put('/api/blog/posts/:id', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const post = await updateBlogPost(req.params.id, {
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt,
        content: body.content,
        metaTitle: body.metaTitle || body.meta_title,
        metaDescription: body.metaDescription || body.meta_description,
        coverImage: body.coverImage || body.cover_image,
        status: body.status,
        categoryId: body.categoryId || body.category_id,
        authorId: body.authorId || body.author_id,
        publishedAt: body.publishedAt || body.published_at,
        tagIds: body.tagIds || body.tag_ids,
        faqs: body.faqs,
      });
      if (!post) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
        return;
      }
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.delete('/api/blog/posts/:id', async (req: Request, res: Response) => {
    try {
      await deleteBlogPost(req.params.id);
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/blog/categories', async (_req: Request, res: Response) => {
    try {
      const categories = await listCategories();
      res.json({ status: 'success', data: categories });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/blog/tags', async (_req: Request, res: Response) => {
    try {
      const tags = await listTags();
      res.json({ status: 'success', data: tags });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/blog/authors', async (_req: Request, res: Response) => {
    try {
      const authors = await listAuthors();
      res.json({ status: 'success', data: authors });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
}
