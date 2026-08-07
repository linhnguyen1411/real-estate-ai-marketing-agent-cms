import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.cmsRecord.findMany({
    where: { collection: 'properties' },
    take: 500,
  });
  const names: Record<string, number> = {};
  const samples: Array<{ id: string; title: string; project_name: unknown; keys: string[] }> = [];
  for (const r of rows) {
    const d = (r.data || {}) as Record<string, unknown>;
    const pn = String(d.project_name || d.projectSlug || d.project_slug || '').trim() || '(empty)';
    names[pn] = (names[pn] || 0) + 1;
    if (samples.length < 8) {
      samples.push({
        id: r.id,
        title: String(d.title || ''),
        project_name: d.project_name,
        keys: Object.keys(d).filter(k => /project|developer|sun/i.test(k)),
      });
    }
  }
  console.log(JSON.stringify({ count: rows.length, projectNames: names, samples }, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
