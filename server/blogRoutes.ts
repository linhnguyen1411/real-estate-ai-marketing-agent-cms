import { Express, Request, Response } from 'express';
import {
  auditPostById,
  createAiDraftRecord,
  createBlogPost,
  createCategory,
  createTag,
  deleteBlogPost,
  duplicateCheckPostById,
  getAiDraftById,
  getBlogPostById,
  getBlogPostBySlug,
  importMarkdownPost,
  listAiDrafts,
  listAuthors,
  listBlogPosts,
  listCategories,
  listCategoriesWithPublishedCount,
  listRevisions,
  listSeoAudits,
  listTags,
  publishPost,
  suggestForPost,
  updateAiDraftRecord,
  updateBlogPost,
  updateCategory,
} from './blogDb';
import { generateAiDraftMarkdown } from './blog/aiDraftService';
import { runAiAssist } from './blog/aiAssistService';
import { parseMarkdownImport } from './blog/markdownPipeline';
import { parsePromptMarkdown } from './blog/promptMarkdownParser';
import { runSeoAudit } from './blog/seoAudit';
import { runDuplicateCheck } from './blog/duplicateCheck';
import { suggestRelatedPostsFromPublished } from './blog/relatedPostSuggest';
import { buildPostCta } from '../src/seo/buildPostCta';
import { saveBlogCoverFromDataUrl } from './blog/coverImageStorage';
import { saveImageFromDataUrl } from './blog/imageStorage';

export function registerBlogPublicRoutes(app: Express) {
  app.get('/api/public/blog/posts', async (req: Request, res: Response) => {
    try {
      const categorySlug = String(req.query.category || '').trim() || undefined;
      const tagSlug = String(req.query.tag || '').trim() || undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const posts = await listBlogPosts({
        status: 'published',
        categorySlug,
        tagSlug,
        limit: limit && !Number.isNaN(limit) ? limit : undefined,
      });
      res.json({
        status: 'success',
        data: posts.map(post => ({ ...post, content: undefined, contentMarkdown: undefined, contentHtml: undefined })),
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
      const categories = await listCategoriesWithPublishedCount(true);
      res.json({ status: 'success', data: categories });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });
}

function optionalNullableString(...values: unknown[]) {
  for (const value of values) {
    if (value !== undefined) {
      if (value === null) return null;
      const trimmed = String(value).trim();
      return trimmed === '' ? null : trimmed;
    }
  }
  return undefined;
}

function mapPostBody(body: Record<string, any>) {
  return {
    title: body.title,
    slug: body.slug,
    excerpt: body.excerpt,
    content: body.content || body.contentMarkdown,
    contentMarkdown: body.contentMarkdown || body.content,
    contentHtml: body.contentHtml,
    metaTitle: body.metaTitle || body.meta_title,
    metaDescription: body.metaDescription || body.meta_description,
    canonicalUrl: optionalNullableString(body.canonicalUrl, body.canonical_url),
    coverImage: optionalNullableString(body.coverImage, body.cover_image),
    status: body.status,
    categoryId: body.categoryId || body.category_id,
    authorId: body.authorId || body.author_id,
    publishedAt: body.publishedAt || body.published_at,
    tagIds: body.tagIds || body.tag_ids,
    faqs: body.faqs,
    internalLinks: body.internalLinks || body.internal_links,
    relatedSuggestions: body.relatedSuggestions || body.related_suggestions,
    relatedPostIds: body.relatedPostIds || body.related_post_ids,
    sourceType: body.sourceType || body.source_type,
    primaryKeyword: body.primaryKeyword || body.primary_keyword,
    secondaryKeywords: body.secondaryKeywords || body.secondary_keywords,
    targetIntent: body.targetIntent || body.target_intent,
    cluster: body.cluster,
    articleType: body.articleType || body.article_type,
    isPillar: body.isPillar ?? body.is_pillar,
    isIndexable: body.isIndexable ?? body.is_indexable,
    skipRevision: body.skipRevision,
  };
}

export function registerBlogAdminRoutes(app: Express) {
  app.post('/api/blog/upload-cover', async (req: Request, res: Response) => {
    try {
      const image = String(req.body?.image || '').trim();
      if (!image) {
        res.status(400).json({ status: 'error', message: 'Thiếu dữ liệu ảnh.' });
        return;
      }
      const slug = String(req.body?.slug || req.body?.postId || '').trim() || undefined;
      const url = saveBlogCoverFromDataUrl(image, slug);
      res.json({ status: 'success', data: { url } });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message || 'Upload ảnh thất bại.' });
    }
  });

  app.post('/api/blog/upload-content-image', async (req: Request, res: Response) => {
    try {
      const image = String(req.body?.image || '').trim();
      if (!image) {
        res.status(400).json({ status: 'error', message: 'Thiếu dữ liệu ảnh.' });
        return;
      }
      const slug = String(req.body?.slug || '').trim() || undefined;
      const url = saveImageFromDataUrl(image, 'content-images', slug || 'content');
      res.json({ status: 'success', data: { url } });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message || 'Upload ảnh thất bại.' });
    }
  });

  app.get('/api/blog/ai-drafts', async (_req: Request, res: Response) => {
    try {
      const drafts = await listAiDrafts();
      res.json({ status: 'success', data: drafts });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/blog/ai-drafts/:id', async (req: Request, res: Response) => {
    try {
      const draft = await getAiDraftById(req.params.id);
      if (!draft) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy AI draft' });
        return;
      }
      const input = (draft.input || {}) as Record<string, unknown>;
      const resultMeta = (input.resultMeta || {}) as Record<string, unknown>;
      let post = draft.postId ? await getBlogPostById(draft.postId) : null;
      let audit = resultMeta.audit || null;
      let duplicate = resultMeta.duplicate || null;
      if (draft.postId && draft.status === 'completed' && !audit) {
        audit = await auditPostById(draft.postId);
        duplicate = await duplicateCheckPostById(draft.postId);
      }
      res.json({
        status: 'success',
        data: {
          ...draft,
          post,
          audit,
          duplicate,
          bannedCheck: resultMeta.bannedCheck || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/ai-drafts', async (req: Request, res: Response) => {
    try {
      const input = req.body || {};
      const record = await createAiDraftRecord(input);
      res.json({ status: 'success', data: record });

      void (async () => {
        try {
          await updateAiDraftRecord(record.id, { status: 'generating' });
          const { markdown, articleType, bannedCheck } = await generateAiDraftMarkdown(input);
          const authorId = input.authorId;
          if (!authorId) {
            await updateAiDraftRecord(record.id, {
              status: 'failed',
              errorMessage: 'Thiếu authorId',
              outputMarkdown: markdown,
              articleType,
              resultMeta: { bannedCheck },
            });
            return;
          }
          const post = await importMarkdownPost(markdown, {
            authorId,
            categoryId: input.categoryId,
            articleType: input.articleType || articleType,
          });
          await updateBlogPost(post!.id, { sourceType: 'ai_draft', articleType, status: 'draft' });
          const audit = await auditPostById(post!.id);
          const duplicate = await duplicateCheckPostById(post!.id);
          await updateAiDraftRecord(record.id, {
            status: 'completed',
            outputMarkdown: markdown,
            articleType,
            postId: post!.id,
            resultMeta: { audit, duplicate, bannedCheck },
          });
        } catch (error: any) {
          await updateAiDraftRecord(record.id, {
            status: 'failed',
            errorMessage: error.message || String(error),
          });
        }
      })();
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/parse-markdown', async (req: Request, res: Response) => {
    try {
      const markdown = String(req.body?.markdown || '').trim();
      if (!markdown) {
        res.status(400).json({ status: 'error', message: 'Thiếu markdown' });
        return;
      }
      const parsed = parsePromptMarkdown(markdown);
      for (const name of parsed.tagNames) {
        await createTag(name);
      }
      const allTags = await listTags();
      const tagIds = allTags
        .filter(t => parsed.tagNames.some(n => n.toLowerCase() === t.name.toLowerCase() || n.toLowerCase() === t.slug.replace(/-/g, ' ')))
        .map(t => t.id);
      const published = await listBlogPosts({ status: 'published' });
      const cta = buildPostCta({
        title: parsed.title,
        primaryKeyword: parsed.primaryKeyword,
        tags: parsed.tagNames,
        contentText: parsed.contentMarkdown,
      });
      const suggestedRelated = suggestRelatedPostsFromPublished(published as any, {
        categoryId: req.body?.categoryId,
        tagIds,
        tagNames: parsed.tagNames,
        primaryKeyword: parsed.primaryKeyword,
        relatedSuggestions: parsed.relatedSuggestions,
      });
      const audit = runSeoAudit({
        title: parsed.title,
        slug: parsed.slug,
        excerpt: parsed.excerpt,
        contentMarkdown: parsed.contentMarkdown,
        metaTitle: parsed.metaTitle,
        metaDescription: parsed.metaDescription,
        primaryKeyword: parsed.primaryKeyword,
        faqCount: parsed.faqs.length,
        ctaGenerated: true,
        relatedPostCount: 0,
        tagCount: tagIds.length,
        targetIntent: cta.leadIntent,
      });
      const duplicate = runDuplicateCheck(
        {
          slug: parsed.slug,
          title: parsed.title,
          metaTitle: parsed.metaTitle,
          metaDescription: parsed.metaDescription,
          contentMarkdown: parsed.contentMarkdown,
        },
        published.map(p => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
          content: p.contentMarkdown || p.content || '',
        }))
      );
      res.json({
        status: 'success',
        data: {
          title: parsed.title,
          slug: parsed.slug,
          excerpt: parsed.excerpt,
          metaTitle: parsed.metaTitle,
          metaDescription: parsed.metaDescription,
          primaryKeyword: parsed.primaryKeyword,
          coverImage: parsed.coverImage,
          tagNames: parsed.tagNames,
          tagIds,
          markdown: parsed.contentMarkdown,
          faqs: parsed.faqs,
          relatedSuggestions: parsed.relatedSuggestions,
          suggestedRelated,
          cta,
          cleanWarnings: parsed.cleanWarnings,
          audit,
          duplicate,
        },
      });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/ai/generate', async (req: Request, res: Response) => {
    try {
      const input = req.body || {};
      const { markdown, articleType, bannedCheck } = await generateAiDraftMarkdown(input);
      const parsed = parseMarkdownImport(markdown);
      const allCategories = await listCategories();
      const category = allCategories.find(c => c.slug === parsed.categorySlug);
      const published = await listBlogPosts({ status: 'published' });
      const audit = runSeoAudit({
        title: parsed.title,
        slug: parsed.slug,
        excerpt: parsed.excerpt,
        contentMarkdown: parsed.contentMarkdown,
        metaTitle: parsed.metaTitle,
        metaDescription: parsed.metaDescription,
        primaryKeyword: parsed.primaryKeyword,
        faqCount: parsed.faqs.length,
      });
      const duplicate = runDuplicateCheck(
        {
          slug: parsed.slug,
          title: parsed.title,
          metaTitle: parsed.metaTitle,
          metaDescription: parsed.metaDescription,
          contentMarkdown: parsed.contentMarkdown,
        },
        published.map(p => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
          content: p.contentMarkdown || p.content || '',
        }))
      );
      res.json({
        status: 'success',
        data: {
          title: parsed.title,
          slug: parsed.slug,
          excerpt: parsed.excerpt,
          metaTitle: parsed.metaTitle,
          metaDescription: parsed.metaDescription,
          primaryKeyword: parsed.primaryKeyword,
          targetIntent: parsed.targetIntent,
          categoryId: category?.id || null,
          categorySlug: parsed.categorySlug,
          tagNames: parsed.tagNames,
          markdown: parsed.contentMarkdown,
          faqs: parsed.faqs,
          articleType,
          bannedCheck,
          audit,
          duplicate,
        },
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/ai/assist', async (req: Request, res: Response) => {
    try {
      const { action, ...payload } = req.body || {};
      if (!action) {
        res.status(400).json({ status: 'error', message: 'Thiếu action' });
        return;
      }
      const result = await runAiAssist(action, payload);
      res.json({ status: 'success', data: result });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/ai/preview-checks', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const audit = runSeoAudit({
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt,
        contentMarkdown: body.content || body.contentMarkdown,
        metaTitle: body.metaTitle,
        metaDescription: body.metaDescription,
        primaryKeyword: body.primaryKeyword,
        faqCount: Array.isArray(body.faqs) ? body.faqs.length : 0,
      });
      const published = await listBlogPosts({ status: 'published' });
      const duplicate = runDuplicateCheck(
        {
          id: body.excludePostId,
          slug: body.slug,
          title: body.title,
          metaTitle: body.metaTitle,
          metaDescription: body.metaDescription,
          contentMarkdown: body.content || body.contentMarkdown,
        },
        published.map(p => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
          content: p.contentMarkdown || p.content || '',
        }))
      );
      res.json({ status: 'success', data: { audit, duplicate } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

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

  app.post('/api/blog/posts/suggest', async (req: Request, res: Response) => {
    try {
      const data = await suggestForPost(req.body || {});
      res.json({ status: 'success', data });
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
      const post = await createBlogPost(mapPostBody(req.body || {}) as any);
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      const message =
        error?.code === 'P2002'
          ? 'Slug hoặc ID bài viết đã tồn tại — hãy đổi slug hoặc mở bài cũ để sửa.'
          : error.message;
      res.status(error?.code === 'P2002' ? 409 : 500).json({ status: 'error', message });
    }
  });

  app.put('/api/blog/posts/:id', async (req: Request, res: Response) => {
    try {
      const post = await updateBlogPost(req.params.id, mapPostBody(req.body || {}) as any);
      if (!post) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
        return;
      }
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      const message =
        error?.code === 'P2002'
          ? 'Slug đã được bài khác sử dụng — hãy đổi slug.'
          : error.message;
      res.status(error?.code === 'P2002' ? 409 : 500).json({ status: 'error', message });
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

  app.post('/api/blog/posts/import-markdown', async (req: Request, res: Response) => {
    try {
      const { markdown, authorId, categoryId } = req.body || {};
      if (!markdown || !authorId) {
        res.status(400).json({ status: 'error', message: 'Thiếu markdown hoặc authorId' });
        return;
      }
      const post = await importMarkdownPost(String(markdown), { authorId, categoryId });
      res.json({ status: 'success', data: post });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/posts/:id/audit', async (req: Request, res: Response) => {
    try {
      const audit = await auditPostById(req.params.id);
      if (!audit) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
        return;
      }
      res.json({ status: 'success', data: audit });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/posts/:id/duplicate-check', async (req: Request, res: Response) => {
    try {
      const result = await duplicateCheckPostById(req.params.id);
      if (!result) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy bài viết' });
        return;
      }
      res.json({ status: 'success', data: result });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/posts/:id/publish', async (req: Request, res: Response) => {
    try {
      const force = Boolean(req.body?.force);
      const result = await publishPost(req.params.id, force);
      if (!result.ok) {
        res.status(422).json({ status: 'error', message: result.message, data: result });
        return;
      }
      res.json({ status: 'success', data: result });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });


  app.get('/api/blog/posts/:id/revisions', async (req: Request, res: Response) => {
    try {
      const revisions = await listRevisions(req.params.id);
      res.json({ status: 'success', data: revisions });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/blog/posts/:id/seo-audits', async (req: Request, res: Response) => {
    try {
      const audits = await listSeoAudits(req.params.id);
      res.json({ status: 'success', data: audits });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/blog/categories', async (_req: Request, res: Response) => {
    try {
      const categories = await listCategoriesWithPublishedCount(false);
      res.json({ status: 'success', data: categories });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/blog/categories', async (req: Request, res: Response) => {
    try {
      const category = await createCategory(req.body);
      res.json({ status: 'success', data: category });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.put('/api/blog/categories/:id', async (req: Request, res: Response) => {
    try {
      const category = await updateCategory(req.params.id, req.body);
      res.json({ status: 'success', data: category });
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

  app.post('/api/blog/tags', async (req: Request, res: Response) => {
    try {
      const tag = await createTag(req.body.name);
      res.json({ status: 'success', data: tag });
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
