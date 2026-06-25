import { prisma } from './prisma';
import { DEFAULT_CMS_CATEGORIES } from './blog/defaultCategories';
import { parseMarkdownImport, markdownToHtml } from './blog/markdownPipeline';
import { runSeoAudit } from './blog/seoAudit';
import { runDuplicateCheck } from './blog/duplicateCheck';
import {
  suggestCategoryAndTags,
  categorySlugForArticleType,
  detectArticleType,
} from './blog/categorySuggest';
import { suggestInternalLinks } from './blog/internalLinkSuggest';
import { countWords, estimateReadingTime, slugifyTag } from './blog/textUtils';
import { buildPostCta } from '../src/seo/buildPostCta';

export type PostStatus = 'draft' | 'review' | 'published' | 'archived';

export interface BlogPostInput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  contentMarkdown?: string;
  contentHtml?: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string | null;
  coverImage?: string | null;
  status?: PostStatus;
  categoryId: string;
  authorId: string;
  publishedAt?: string | Date | null;
  tagIds?: string[];
  faqs?: { question: string; answer: string; sortOrder?: number }[];
  internalLinks?: { label: string; href: string; sortOrder?: number; isAuto?: boolean }[];
  relatedSuggestions?: string[];
  relatedPostIds?: string[];
  sourceType?: string;
  primaryKeyword?: string | null;
  secondaryKeywords?: string[];
  targetIntent?: string | null;
  cluster?: string | null;
  articleType?: string | null;
  isPillar?: boolean;
  isIndexable?: boolean;
  skipRevision?: boolean;
  forcePublish?: boolean;
}

function getMarkdown(post: { content: string; contentMarkdown?: string | null }) {
  return post.contentMarkdown || post.content;
}

function serializePost(post: any) {
  const markdown = getMarkdown(post);
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: markdown,
    contentMarkdown: markdown,
    contentHtml: post.contentHtml,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    canonicalUrl: post.canonicalUrl,
    coverImage: post.coverImage,
    status: post.status,
    categoryId: post.categoryId,
    authorId: post.authorId,
    publishedAt: post.publishedAt?.toISOString() || null,
    readingTime: post.readingTime,
    wordCount: post.wordCount,
    seoScore: post.seoScore,
    contentQualityScore: post.contentQualityScore,
    sourceType: post.sourceType,
    primaryKeyword: post.primaryKeyword,
    secondaryKeywords: post.secondaryKeywords,
    targetIntent: post.targetIntent,
    cluster: post.cluster,
    articleType: post.articleType,
    isPillar: post.isPillar,
    isIndexable: post.isIndexable,
    relatedSuggestions: Array.isArray(post.relatedSuggestions) ? post.relatedSuggestions : [],
    relatedPostIds: Array.isArray(post.relatedPostIds) ? post.relatedPostIds : [],
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    category: post.category
      ? {
          id: post.category.id,
          name: post.category.name,
          slug: post.category.slug,
          hubPath: post.category.hubPath,
          legacyHubPath: post.category.legacyHubPath,
        }
      : undefined,
    author: post.author
      ? { id: post.author.id, name: post.author.name, slug: post.author.slug }
      : undefined,
    tags: (post.tags || []).map((item: any) => ({
      id: item.tag.id,
      name: item.tag.name,
      slug: item.tag.slug,
    })),
    faqs: (post.faqs || [])
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      .map((faq: any) => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        sortOrder: faq.sortOrder,
      })),
    internalLinks: (post.internalLinks || [])
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      .map((link: any) => ({
        id: link.id,
        label: link.label,
        href: link.href,
        sortOrder: link.sortOrder,
        isAuto: link.isAuto,
      })),
  };
}

const postInclude = {
  category: true,
  author: true,
  tags: { include: { tag: true } },
  faqs: { orderBy: { sortOrder: 'asc' as const } },
  internalLinks: { orderBy: { sortOrder: 'asc' as const } },
};

function computeMetrics(markdown: string) {
  const wordCount = countWords(markdown);
  return { wordCount, readingTime: estimateReadingTime(wordCount) };
}

export async function seedDefaultCategories() {
  for (const cat of DEFAULT_CMS_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: { ...cat, isActive: true },
      update: {
        name: cat.name,
        description: cat.description,
        hubPath: cat.hubPath,
        legacyHubPath: 'legacyHubPath' in cat ? cat.legacyHubPath : undefined,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });
  }
}

export async function listBlogPosts(filters?: {
  status?: string;
  categorySlug?: string;
  tagSlug?: string;
  limit?: number;
}) {
  const where: any = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.categorySlug) where.category = { slug: filters.categorySlug };
  if (filters?.tagSlug) where.tags = { some: { tag: { slug: filters.tagSlug } } };

  const posts = await prisma.blogPost.findMany({
    where,
    include: postInclude,
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    take: filters?.limit,
  });
  return posts.map(serializePost);
}

export async function getBlogPostBySlug(slug: string, publicOnly = false) {
  const post = await prisma.blogPost.findFirst({
    where: {
      slug,
      ...(publicOnly ? { status: 'published', isIndexable: true } : {}),
    },
    include: postInclude,
  });
  return post ? serializePost(post) : null;
}

export async function getBlogPostById(id: string) {
  const post = await prisma.blogPost.findUnique({ where: { id }, include: postInclude });
  return post ? serializePost(post) : null;
}

async function saveRevision(postId: string, snapshot: Record<string, unknown>, note?: string) {
  await prisma.blogPostRevision.create({
    data: {
      id: `rev-${postId}-${Date.now()}`,
      postId,
      snapshot: snapshot as import('@prisma/client').Prisma.InputJsonValue,
      note,
    },
  });
}

async function syncTagsByNames(tagNames: string[]) {
  const ids: string[] = [];
  for (const name of tagNames) {
    const slug = slugifyTag(name);
    const id = `tag-${slug}`;
    await prisma.tag.upsert({
      where: { slug },
      create: { id, name, slug },
      update: { name },
    });
    ids.push(id);
  }
  return ids;
}

async function persistSeoAudit(postId: string, audit: ReturnType<typeof runSeoAudit>) {
  await prisma.blogPostSeoAudit.create({
    data: {
      id: `audit-${postId}-${Date.now()}`,
      postId,
      passed: audit.passed,
      score: audit.score,
      results: audit.checks as any,
      warnings: audit.warnings,
      errors: audit.errors,
    },
  });
  await prisma.blogPost.update({
    where: { id: postId },
    data: { seoScore: audit.score, contentQualityScore: audit.score },
  });
}

function auditSerializedPost(post: any) {
  const cta = buildPostCta({
    title: post.title,
    primaryKeyword: post.primaryKeyword,
    tags: (post.tags || []).map((t: { name: string }) => t.name),
    categoryName: post.category?.name,
    contentText: post.contentMarkdown || post.content || '',
  });
  return runSeoAudit({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    contentMarkdown: post.contentMarkdown || post.content || '',
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    canonicalUrl: post.canonicalUrl,
    primaryKeyword: post.primaryKeyword,
    faqCount: post.faqs?.length || 0,
    ctaGenerated: Boolean(cta.leadIntent),
    relatedPostCount: Array.isArray(post.relatedPostIds) ? post.relatedPostIds.length : 0,
    tagCount: post.tags?.length || 0,
    targetIntent: post.targetIntent || cta.leadIntent,
  });
}

export async function createBlogPost(input: BlogPostInput) {
  const id = `blog-${input.slug}`;
  const existing = await prisma.blogPost.findFirst({
    where: { OR: [{ id }, { slug: input.slug }] },
    select: { id: true },
  });
  if (existing) {
    return updateBlogPost(existing.id, input);
  }

  const markdown = input.contentMarkdown || input.content;
  const html = input.contentHtml || markdownToHtml(markdown);
  const metrics = computeMetrics(markdown);
  const publishedAt =
    input.status === 'published'
      ? input.publishedAt
        ? new Date(input.publishedAt)
        : new Date()
      : null;

  await prisma.blogPost.create({
    data: {
      id,
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt,
      content: markdown,
      contentMarkdown: markdown,
      contentHtml: html,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      canonicalUrl: input.canonicalUrl || null,
      coverImage: input.coverImage || null,
      status: input.status || 'draft',
      categoryId: input.categoryId,
      authorId: input.authorId,
      publishedAt,
      readingTime: metrics.readingTime,
      wordCount: metrics.wordCount,
      sourceType: input.sourceType || 'manual',
      primaryKeyword: input.primaryKeyword || null,
      secondaryKeywords: input.secondaryKeywords || [],
      targetIntent: input.targetIntent || null,
      cluster: input.cluster || null,
      articleType: input.articleType || null,
      isPillar: input.isPillar ?? false,
      isIndexable: input.isIndexable ?? true,
      relatedSuggestions: input.relatedSuggestions || [],
      relatedPostIds: input.relatedPostIds || [],
      tags: input.tagIds?.length ? { create: input.tagIds.map(tagId => ({ tagId })) } : undefined,
      faqs: input.faqs?.length
        ? {
            create: input.faqs.map((faq, index) => ({
              id: `${id}-faq-${index + 1}`,
              question: faq.question,
              answer: faq.answer,
              sortOrder: faq.sortOrder ?? index,
            })),
          }
        : undefined,
      internalLinks: input.internalLinks?.length
        ? {
            create: input.internalLinks.map((link, index) => ({
              id: `${id}-link-${index + 1}`,
              label: link.label,
              href: link.href,
              sortOrder: link.sortOrder ?? index,
              isAuto: link.isAuto ?? false,
            })),
          }
        : undefined,
    },
  });

  const post = await getBlogPostById(id);
  if (post) {
    const audit = auditSerializedPost(post);
    await persistSeoAudit(id, audit);
  }
  return post;
}

export async function updateBlogPost(id: string, input: Partial<BlogPostInput>) {
  const current = await prisma.blogPost.findUnique({ where: { id }, include: postInclude });
  if (!current) return null;

  if (!input.skipRevision) {
    await saveRevision(id, serializePost(current) as any, 'auto-save');
  }

  const nextStatus = (input.status ?? current.status) as PostStatus;
  let publishedAt = current.publishedAt;
  const hasPublishedAtInput =
    input.publishedAt !== undefined && input.publishedAt !== null && input.publishedAt !== '';

  if (nextStatus === 'draft') {
    publishedAt = null;
  } else if (hasPublishedAtInput) {
    publishedAt = new Date(input.publishedAt as string | Date);
  } else if (nextStatus === 'published' && !publishedAt) {
    publishedAt = new Date();
  }

  const markdown = input.contentMarkdown || input.content || current.contentMarkdown || current.content;
  const html = input.contentHtml || markdownToHtml(markdown);
  const metrics = computeMetrics(markdown);

  await prisma.blogPost.update({
    where: { id },
    data: {
      title: input.title ?? current.title,
      slug: input.slug ?? current.slug,
      excerpt: input.excerpt ?? current.excerpt,
      content: markdown,
      contentMarkdown: markdown,
      contentHtml: html,
      metaTitle: input.metaTitle ?? current.metaTitle,
      metaDescription: input.metaDescription ?? current.metaDescription,
      canonicalUrl: input.canonicalUrl !== undefined ? input.canonicalUrl : current.canonicalUrl,
      coverImage: input.coverImage !== undefined ? input.coverImage || null : current.coverImage,
      status: (input.status ?? current.status) as string,
      categoryId: input.categoryId ?? current.categoryId,
      authorId: input.authorId ?? current.authorId,
      publishedAt,
      readingTime: metrics.readingTime,
      wordCount: metrics.wordCount,
      sourceType: input.sourceType ?? current.sourceType,
      primaryKeyword: input.primaryKeyword !== undefined ? input.primaryKeyword : current.primaryKeyword,
      secondaryKeywords: input.secondaryKeywords ?? current.secondaryKeywords,
      targetIntent: input.targetIntent !== undefined ? input.targetIntent : current.targetIntent,
      cluster: input.cluster !== undefined ? input.cluster : current.cluster,
      articleType: input.articleType !== undefined ? input.articleType : current.articleType,
      isPillar: input.isPillar ?? current.isPillar,
      isIndexable: input.isIndexable ?? current.isIndexable,
      relatedSuggestions:
        input.relatedSuggestions !== undefined ? input.relatedSuggestions : current.relatedSuggestions,
      relatedPostIds: input.relatedPostIds !== undefined ? input.relatedPostIds : current.relatedPostIds,
    },
  });

  if (input.tagIds !== undefined) {
    await prisma.blogPostTag.deleteMany({ where: { postId: id } });
    if (input.tagIds.length) {
      await prisma.blogPostTag.createMany({ data: input.tagIds.map(tagId => ({ postId: id, tagId })) });
    }
  }

  if (input.faqs !== undefined) {
    await prisma.blogPostFaq.deleteMany({ where: { postId: id } });
    if (input.faqs.length) {
      await prisma.blogPostFaq.createMany({
        data: input.faqs.map((faq, index) => ({
          id: `${id}-faq-${index + 1}-${Date.now()}`,
          postId: id,
          question: faq.question,
          answer: faq.answer,
          sortOrder: faq.sortOrder ?? index,
        })),
      });
    }
  }

  if (input.internalLinks) {
    await prisma.blogPostInternalLink.deleteMany({ where: { postId: id } });
    if (input.internalLinks.length) {
      await prisma.blogPostInternalLink.createMany({
        data: input.internalLinks.map((link, index) => ({
          id: `${id}-link-${index + 1}-${Date.now()}`,
          postId: id,
          label: link.label,
          href: link.href,
          sortOrder: link.sortOrder ?? index,
          isAuto: link.isAuto ?? false,
        })),
      });
    }
  }

  const post = await getBlogPostById(id);
  if (post) {
    const audit = auditSerializedPost(post);
    await persistSeoAudit(id, audit);
  }
  return post;
}

export async function deleteBlogPost(id: string) {
  await prisma.blogPost.delete({ where: { id } });
  return true;
}

export async function importMarkdownPost(
  raw: string,
  defaults: { authorId: string; categoryId?: string; articleType?: string },
) {
  const parsed = parseMarkdownImport(raw);
  if (!parsed.title) throw new Error('Thiếu title trong frontmatter hoặc nội dung');

  const articleType =
    defaults.articleType ||
    String(parsed.frontmatter.articleType || parsed.frontmatter.article_type || '').trim() ||
    detectArticleType(`${parsed.title} ${parsed.primaryKeyword || ''}`, parsed.contentMarkdown) ||
    null;

  const suggestions = suggestCategoryAndTags({
    title: parsed.title,
    primaryKeyword: parsed.primaryKeyword,
    content: parsed.contentMarkdown,
  });

  let categoryId = defaults.categoryId;
  if (!categoryId && parsed.categorySlug) {
    const cat = await prisma.category.findFirst({
      where: { OR: [{ slug: parsed.categorySlug }, { legacyHubPath: `/${parsed.categorySlug}` }] },
    });
    categoryId = cat?.id;
  }
  if (!categoryId && articleType) {
    const mappedSlug = categorySlugForArticleType(articleType);
    if (mappedSlug) {
      const cat = await prisma.category.findUnique({ where: { slug: mappedSlug } });
      categoryId = cat?.id;
    }
  }
  if (!categoryId && suggestions.categories[0]) {
    const cat = await prisma.category.findUnique({ where: { slug: suggestions.categories[0].categorySlug } });
    categoryId = cat?.id;
  }
  if (!categoryId) {
    const fallback = await prisma.category.findFirst({ orderBy: { sortOrder: 'asc' } });
    categoryId = fallback?.id;
  }
  if (!categoryId) throw new Error('Chưa có chuyên mục — chạy npm run seed:cms-categories');

  const tagNames = parsed.tagNames.length
    ? parsed.tagNames
    : suggestions.tags.map(t => t.name);
  const tagIds = await syncTagsByNames(tagNames);

  return createBlogPost({
    title: parsed.title,
    slug: parsed.slug,
    excerpt: parsed.excerpt,
    content: parsed.contentMarkdown,
    contentMarkdown: parsed.contentMarkdown,
    contentHtml: parsed.contentHtml,
    metaTitle: parsed.metaTitle,
    metaDescription: parsed.metaDescription,
    coverImage: parsed.coverImage,
    status: (['draft', 'review', 'published', 'archived'].includes(parsed.status)
      ? parsed.status
      : 'draft') as PostStatus,
    categoryId,
    authorId: defaults.authorId,
    tagIds,
    faqs: parsed.faqs,
    sourceType: 'imported',
    primaryKeyword: parsed.primaryKeyword || null,
    targetIntent: parsed.targetIntent || null,
    articleType: articleType || null,
  });
}

/** Gán lại articleType + categoryId cho bài đã lưu sai chuyên mục */
export async function syncPostCategoriesFromArticleType() {
  const posts = await prisma.blogPost.findMany({ include: { category: true } });
  let updated = 0;
  for (const post of posts) {
    const detected = detectArticleType(post.title, post.content || '');
    if (!detected) continue;
    const slug = categorySlugForArticleType(detected);
    if (!slug) continue;
    const needsType = post.articleType !== detected;
    const needsCat = post.category?.slug !== slug;
    if (!needsType && !needsCat) continue;
    const cat = await prisma.category.findUnique({ where: { slug } });
    if (!cat) continue;
    await prisma.blogPost.update({
      where: { id: post.id },
      data: {
        ...(needsType ? { articleType: detected } : {}),
        ...(needsCat ? { categoryId: cat.id } : {}),
      },
    });
    updated += 1;
  }
  return { scanned: posts.length, updated };
}

export async function auditPostById(id: string) {
  const post = await getBlogPostById(id);
  if (!post) return null;
  const audit = auditSerializedPost(post);
  await persistSeoAudit(id, audit);
  return audit;
}

export async function duplicateCheckPostById(id: string) {
  const post = await getBlogPostById(id);
  if (!post) return null;
  const published = await prisma.blogPost.findMany({
    where: { status: 'published' },
    select: { id: true, slug: true, title: true, metaTitle: true, metaDescription: true, content: true },
  });
  return runDuplicateCheck(
    {
      id: post.id,
      slug: post.slug,
      title: post.title,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      contentMarkdown: post.contentMarkdown || post.content || '',
    },
    published.map(p => ({ ...p, content: p.content }))
  );
}

export async function publishPost(id: string, force = false) {
  const dup = await duplicateCheckPostById(id);
  const audit = await auditPostById(id);
  if (!force && dup && !dup.passed) {
    return {
      ok: false,
      duplicate: dup,
      audit,
      message: 'Nội dung trùng bài đã publish — chỉnh lại hoặc dùng Force publish.',
    };
  }
  const post = await updateBlogPost(id, { status: 'published', skipRevision: true });
  return { ok: true, post, duplicate: dup, audit };
}

export async function suggestForPost(input: {
  title: string;
  content: string;
  primaryKeyword?: string;
  categorySlug?: string;
  excludePostId?: string;
}) {
  const suggestions = suggestCategoryAndTags(input);
  const published = await listBlogPosts({ status: 'published', limit: 50 });
  const links = suggestInternalLinks({
    title: input.title,
    content: input.content,
    categorySlug: input.categorySlug,
    relatedPosts: published
      .filter(p => p.id !== input.excludePostId)
      .map(p => ({ title: p.title, slug: p.slug, categorySlug: p.category?.slug })),
  });
  return { ...suggestions, internalLinks: links };
}

export async function listCategoriesWithPublishedCount(publicOnly = false) {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: {
          posts: publicOnly ? { where: { status: 'published', isIndexable: true } } : true,
        },
      },
    },
  });
  return categories
    .map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      hubPath: c.hubPath,
      legacyHubPath: c.legacyHubPath,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      postCount: c._count.posts,
    }))
    .filter(c => (publicOnly ? c.postCount > 0 : true));
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

export async function createCategory(data: {
  name: string;
  slug: string;
  description?: string;
  hubPath?: string;
  sortOrder?: number;
}) {
  const id = `cat-${data.slug}`;
  return prisma.category.create({
    data: {
      id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      hubPath: data.hubPath || `/tin-tuc/chuyen-muc/${data.slug}`,
      sortOrder: data.sortOrder ?? 99,
      isActive: true,
    },
  });
}

export async function updateCategory(id: string, data: Partial<{ name: string; slug: string; description: string; hubPath: string; sortOrder: number; isActive: boolean }>) {
  return prisma.category.update({ where: { id }, data });
}

export async function listTags() {
  return prisma.tag.findMany({ orderBy: { name: 'asc' } });
}

export async function createTag(name: string) {
  const slug = slugifyTag(name);
  return prisma.tag.upsert({
    where: { slug },
    create: { id: `tag-${slug}`, name, slug },
    update: { name },
  });
}

export async function listAuthors() {
  return prisma.author.findMany({ orderBy: { name: 'asc' } });
}

export async function getPublishedBlogPostsForSitemap() {
  return prisma.blogPost.findMany({
    where: { status: 'published', isIndexable: true },
    select: { slug: true, updatedAt: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
  });
}

export async function listRevisions(postId: string) {
  return prisma.blogPostRevision.findMany({
    where: { postId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

export async function listSeoAudits(postId: string) {
  return prisma.blogPostSeoAudit.findMany({
    where: { postId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function createAiDraftRecord(input: Record<string, unknown>) {
  return prisma.blogPostAiDraft.create({
    data: {
      id: `aidraft-${Date.now()}`,
      status: 'pending',
      input: input as any,
    },
  });
}

export async function updateAiDraftRecord(
  id: string,
  data: {
    status?: string;
    outputMarkdown?: string;
    articleType?: string;
    errorMessage?: string;
    postId?: string;
    resultMeta?: Record<string, unknown>;
  }
) {
  const { resultMeta, ...rest } = data;
  const payload: Record<string, unknown> = { ...rest };
  if (resultMeta) {
    const current = await prisma.blogPostAiDraft.findUnique({ where: { id }, select: { input: true } });
    payload.input = { ...(current?.input as object), resultMeta };
  }
  return prisma.blogPostAiDraft.update({ where: { id }, data: payload as any });
}

export async function getAiDraftById(id: string) {
  return prisma.blogPostAiDraft.findUnique({
    where: { id },
    include: { post: { select: { id: true, slug: true, title: true, status: true, seoScore: true, wordCount: true } } },
  });
}

export async function listAiDrafts(limit = 30) {
  return prisma.blogPostAiDraft.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { post: { select: { id: true, slug: true, title: true, status: true } } },
  });
}

// Legacy helpers used by migrate script
export async function upsertCategory(data: {
  id: string;
  name: string;
  slug: string;
  description?: string;
  hubPath: string;
  legacyHubPath?: string;
  sortOrder?: number;
}) {
  return prisma.category.upsert({
    where: { slug: data.slug },
    create: { ...data, isActive: true, sortOrder: data.sortOrder ?? 99 },
    update: {
      name: data.name,
      description: data.description,
      hubPath: data.hubPath,
      legacyHubPath: data.legacyHubPath,
      sortOrder: data.sortOrder,
      isActive: true,
    },
  });
}

export async function upsertAuthor(data: {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  avatarUrl?: string;
}) {
  return prisma.author.upsert({
    where: { slug: data.slug },
    create: data,
    update: { name: data.name, bio: data.bio, avatarUrl: data.avatarUrl },
  });
}

export async function upsertTag(data: { id: string; name: string; slug: string }) {
  return prisma.tag.upsert({
    where: { slug: data.slug },
    create: data,
    update: { name: data.name },
  });
}
