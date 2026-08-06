/**
 * Import legacy SEO posts from server/seed/allPosts.ts into DB as draft/archived.
 * Does NOT auto-publish. Run: npm run migrate:legacy-posts
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { SEO_POSTS } from '../server/seed/allPosts';
import { countWords } from '../server/blog/textUtils';
import { markdownToHtml } from '../server/blog/markdownPipeline';
import { seedDefaultCategories, upsertAuthor, upsertTag } from '../server/blogDb';
import { slugifyTag } from '../server/blog/textUtils';

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  'kien-thuc-dau-tu': 'kien-thuc-dau-tu',
  'tin-thi-truong': 'tin-thi-truong',
  'phan-tich': 'phan-tich-du-an',
  'review-khu-vuc': 'review-khu-vuc',
};

async function main() {
  const status = process.argv.includes('--archive') ? 'archived' : 'draft';
  await seedDefaultCategories();
  const author = await upsertAuthor({
    id: 'author-linh',
    name: 'Linh Nguyễn',
    slug: 'nguyen-phan-hoang-linh',
  });

  let imported = 0;
  for (const post of SEO_POSTS) {
    const categorySlug = LEGACY_CATEGORY_MAP[post.categorySlug] || post.categorySlug;
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) {
      console.warn(`Skip ${post.slug}: unknown category ${post.categorySlug}`);
      continue;
    }

    const id = `blog-${post.slug}`;
    const wordCount = countWords(post.content);
    const tagIds: string[] = [];
    for (const tagName of post.tags) {
      const slug = slugifyTag(tagName);
      await upsertTag({ id: `tag-${slug}`, name: tagName, slug });
      tagIds.push(`tag-${slug}`);
    }

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
        contentMarkdown: post.content,
        contentHtml: markdownToHtml(post.content),
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        coverImage: post.coverImage || null,
        status,
        categoryId: category.id,
        authorId: author.id,
        publishedAt: null,
        wordCount,
        readingTime: Math.max(1, Math.ceil(wordCount / 200)),
        sourceType: 'imported',
        isIndexable: false,
        faqs: {
          create: post.faqs.map((faq, i) => ({
            id: `${id}-faq-${i + 1}`,
            question: faq.question,
            answer: faq.answer,
            sortOrder: i,
          })),
        },
        tags: {
          create: tagIds.map(tagId => ({ tagId })),
        },
      },
    });
    imported += 1;
  }

  console.log(`✓ Migrated ${imported} legacy posts as ${status} (not published)`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
