import 'dotenv/config';
import { prisma } from '../server/prisma';
import { SEO_POSTS } from '../server/seed/allPosts';
import { countWords, slugifyTag } from '../server/seed/contentBuilder';
import { upsertAuthor, upsertCategory, upsertTag } from '../server/blogDb';

const CATEGORIES = [
  {
    id: 'cat-kien-thuc-dau-tu',
    name: 'Kiến thức đầu tư',
    slug: 'kien-thuc-dau-tu',
    hubPath: '/kien-thuc-dau-tu',
    description: 'Hướng dẫn đầu tư BĐS Đà Nẵng từ cơ bản đến nâng cao.',
  },
  {
    id: 'cat-tin-thi-truong',
    name: 'Tin thị trường',
    slug: 'tin-thi-truong',
    hubPath: '/tin-thi-truong',
    description: 'Cập nhật giá, giao dịch và chính sách mới.',
  },
  {
    id: 'cat-phan-tich',
    name: 'Phân tích',
    slug: 'phan-tich',
    hubPath: '/phan-tich',
    description: 'Báo cáo phân tích theo khu vực và phân khúc.',
  },
  {
    id: 'cat-review-khu-vuc',
    name: 'Review khu vực',
    slug: 'review-khu-vuc',
    hubPath: '/review-khu-vuc',
    description: 'Đánh giá tiềm năng từng khu vực Đà Nẵng.',
  },
];

async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  const isLocalDb = /:543[24]\b/.test(dbUrl) || dbUrl.includes('localhost:5432') || dbUrl.includes('localhost:5434');

  if (!process.env.ALLOW_SEO_SEED && !isLocalDb) {
    console.error(
      'seed:seo-posts chỉ cho DB local (port 5434).\n' +
        'Production: tạo bài thật qua Admin → Nội dung SEO.\n' +
        'Lỡ seed demo trên prod: npm run seed:remove-demo'
    );
    process.exit(1);
  }

  console.log('Seeding SEO blog content (local/dev)...');

  await upsertAuthor({
    id: 'author-linh',
    name: 'Linh Nguyễn',
    slug: 'nguyen-phan-hoang-linh',
    bio: 'Tư vấn bất động sản Nam Đà Nẵng, hỗ trợ nhà đầu tư Hà Nội và phía Bắc.',
  });

  for (const category of CATEGORIES) {
    await upsertCategory(category);
  }

  const tagMap = new Map<string, string>();
  for (const post of SEO_POSTS) {
    for (const tagName of post.tags) {
      const slug = slugifyTag(tagName);
      if (!tagMap.has(slug)) {
        const id = `tag-${slug}`;
        await upsertTag({ id, name: tagName.replace(/-/g, ' '), slug });
        tagMap.set(slug, id);
      }
    }
  }

  const categoryMap = new Map(CATEGORIES.map(category => [category.slug, category.id]));
  const publishedAt = new Date('2026-05-01T08:00:00.000Z');

  let created = 0;
  for (const post of SEO_POSTS) {
    const words = countWords(post.content);
    if (words < 900) {
      console.warn(`WARN: ${post.slug} only has ${words} words (target 900+)`);
    }

    const categoryId = categoryMap.get(post.categorySlug);
    if (!categoryId) {
      throw new Error(`Missing category: ${post.categorySlug}`);
    }

    const id = `blog-${post.slug}`;
    const tagIds = post.tags.map(tag => tagMap.get(slugifyTag(tag))!).filter(Boolean);

    await prisma.blogPostFaq.deleteMany({ where: { postId: id } });
    await prisma.blogPostTag.deleteMany({ where: { postId: id } });
    await prisma.blogPost.deleteMany({ where: { id } });

    await prisma.blogPost.create({
      data: {
        id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        coverImage: post.coverImage || null,
        status: 'published',
        categoryId,
        authorId: 'author-linh',
        publishedAt,
        tags: {
          create: tagIds.map(tagId => ({ tagId })),
        },
        faqs: {
          create: post.faqs.map((faq, index) => ({
            id: `${id}-faq-${index + 1}`,
            question: faq.question,
            answer: faq.answer,
            sortOrder: index,
          })),
        },
      },
    });

    created += 1;
    console.log(`✓ ${post.slug} (${words} words)`);
  }

  const total = await prisma.blogPost.count({ where: { status: 'published' } });
  console.log(`\nDone. Created/updated ${created} posts. Published total: ${total}`);
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
