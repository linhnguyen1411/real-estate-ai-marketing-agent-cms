/**
 * Xóa bài viết demo từ seed (id prefix blog-).
 * Dùng trên production khi lỡ chạy seed:seo-posts — KHÔNG xóa bài tạo từ CMS (id khác).
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { SEO_POSTS } from '../server/seed/allPosts';

async function main() {
  const seedIds = SEO_POSTS.map(post => `blog-${post.slug}`);
  const existing = await prisma.blogPost.findMany({
    where: { id: { in: seedIds } },
    select: { id: true, slug: true, title: true },
  });

  if (existing.length === 0) {
    console.log('Không có bài seed demo trên DB.');
    return;
  }

  console.log(`Xóa ${existing.length} bài seed demo...`);
  for (const post of existing) {
    await prisma.blogPostFaq.deleteMany({ where: { postId: post.id } });
    await prisma.blogPostTag.deleteMany({ where: { postId: post.id } });
    await prisma.blogPost.delete({ where: { id: post.id } });
    console.log(`  - ${post.slug}`);
  }

  const published = await prisma.blogPost.count({ where: { status: 'published' } });
  console.log(`\nXong. Bài published còn lại: ${published}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
