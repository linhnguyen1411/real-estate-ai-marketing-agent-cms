import 'dotenv/config';
import { seedDefaultCategories, syncPostCategoriesFromArticleType } from '../server/blogDb';
import { prisma } from '../server/prisma';

async function main() {
  await seedDefaultCategories();
  const result = await syncPostCategoriesFromArticleType();
  console.log(`Đã quét ${result.scanned} bài — cập nhật ${result.updated} chuyên mục theo articleType.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
