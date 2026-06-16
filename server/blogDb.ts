import { prisma } from './prisma';

export interface BlogPostInput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  coverImage?: string | null;
  status?: 'draft' | 'published';
  categoryId: string;
  authorId: string;
  publishedAt?: string | Date | null;
  tagIds?: string[];
  faqs?: { question: string; answer: string; sortOrder?: number }[];
}

function serializePost(post: any) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    coverImage: post.coverImage,
    status: post.status,
    categoryId: post.categoryId,
    authorId: post.authorId,
    publishedAt: post.publishedAt?.toISOString() || null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    category: post.category
      ? {
          id: post.category.id,
          name: post.category.name,
          slug: post.category.slug,
          hubPath: post.category.hubPath,
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
  };
}

const postInclude = {
  category: true,
  author: true,
  tags: { include: { tag: true } },
  faqs: { orderBy: { sortOrder: 'asc' as const } },
};

export async function listBlogPosts(filters?: {
  status?: string;
  categorySlug?: string;
  limit?: number;
}) {
  const where: any = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.categorySlug) {
    where.category = { slug: filters.categorySlug };
  }

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
      ...(publicOnly ? { status: 'published' } : {}),
    },
    include: postInclude,
  });
  return post ? serializePost(post) : null;
}

export async function getBlogPostById(id: string) {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    include: postInclude,
  });
  return post ? serializePost(post) : null;
}

export async function createBlogPost(input: BlogPostInput) {
  const id = `blog-${input.slug}`;
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
      content: input.content,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      coverImage: input.coverImage || null,
      status: input.status || 'draft',
      categoryId: input.categoryId,
      authorId: input.authorId,
      publishedAt,
      tags: input.tagIds?.length
        ? {
            create: input.tagIds.map(tagId => ({ tagId })),
          }
        : undefined,
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
    },
  });

  return getBlogPostById(id);
}

export async function updateBlogPost(id: string, input: Partial<BlogPostInput>) {
  const current = await prisma.blogPost.findUnique({ where: { id } });
  if (!current) return null;

  const nextStatus = input.status ?? current.status;
  let publishedAt = current.publishedAt;
  if (nextStatus === 'published' && !publishedAt) {
    publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();
  }
  if (nextStatus === 'draft') {
    publishedAt = null;
  }
  if (input.publishedAt && nextStatus === 'published') {
    publishedAt = new Date(input.publishedAt);
  }

  await prisma.blogPost.update({
    where: { id },
    data: {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt,
      content: input.content,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      coverImage: input.coverImage,
      status: input.status,
      categoryId: input.categoryId,
      authorId: input.authorId,
      publishedAt,
    },
  });

  if (input.tagIds) {
    await prisma.blogPostTag.deleteMany({ where: { postId: id } });
    if (input.tagIds.length) {
      await prisma.blogPostTag.createMany({
        data: input.tagIds.map(tagId => ({ postId: id, tagId })),
      });
    }
  }

  if (input.faqs) {
    await prisma.blogPostFaq.deleteMany({ where: { postId: id } });
    if (input.faqs.length) {
      await prisma.blogPostFaq.createMany({
        data: input.faqs.map((faq, index) => ({
          id: `${id}-faq-${index + 1}`,
          postId: id,
          question: faq.question,
          answer: faq.answer,
          sortOrder: faq.sortOrder ?? index,
        })),
      });
    }
  }

  return getBlogPostById(id);
}

export async function deleteBlogPost(id: string) {
  await prisma.blogPost.delete({ where: { id } });
  return true;
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
}

export async function listTags() {
  return prisma.tag.findMany({ orderBy: { name: 'asc' } });
}

export async function listAuthors() {
  return prisma.author.findMany({ orderBy: { name: 'asc' } });
}

export async function getPublishedBlogPostsForSitemap() {
  return prisma.blogPost.findMany({
    where: { status: 'published' },
    select: { slug: true, updatedAt: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
  });
}

export async function upsertCategory(data: {
  id: string;
  name: string;
  slug: string;
  description?: string;
  hubPath: string;
}) {
  return prisma.category.upsert({
    where: { slug: data.slug },
    create: data,
    update: {
      name: data.name,
      description: data.description,
      hubPath: data.hubPath,
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
    update: {
      name: data.name,
      bio: data.bio,
      avatarUrl: data.avatarUrl,
    },
  });
}

export async function upsertTag(data: { id: string; name: string; slug: string }) {
  return prisma.tag.upsert({
    where: { slug: data.slug },
    create: data,
    update: { name: data.name },
  });
}
