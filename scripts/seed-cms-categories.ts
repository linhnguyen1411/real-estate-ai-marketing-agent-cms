import 'dotenv/config';
import { seedDefaultCategories, upsertAuthor } from '../server/blogDb';

async function main() {
  await seedDefaultCategories();
  await upsertAuthor({
    id: 'author-linh',
    name: 'Linh Nguyễn',
    slug: 'nguyen-phan-hoang-linh',
    bio: 'Tư vấn BĐS Đà Nẵng — Estoria',
  });
  console.log('✓ CMS categories + default author seeded');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
