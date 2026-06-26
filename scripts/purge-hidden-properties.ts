import 'dotenv/config';
import { prisma } from '../server/prisma';

type PropertyRow = {
  id: string;
  title?: string;
  location?: string;
  project_name?: string;
  sale_status?: string;
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const records = await prisma.cmsRecord.findMany({
    where: { collection: 'properties' },
    orderBy: { updatedAt: 'desc' },
  });

  const properties: PropertyRow[] = records.map(row => {
    const data = row.data as PropertyRow;
    return {
      ...data,
      id: row.id,
      sale_status: data.sale_status || row.saleStatus || 'available',
    };
  });

  const hidden = properties.filter(p => p.sale_status === 'hidden');
  const active = properties.filter(p => p.sale_status !== 'hidden');

  console.log('=== KHẢO SÁT BĐS PRODUCTION ===');
  console.log(`Tổng: ${properties.length} | Đã ẩn: ${hidden.length} | Còn lại (nếu xóa ẩn): ${active.length}`);
  console.log('');

  if (hidden.length) {
    console.log('--- BĐS đã ẩn (sẽ xóa) ---');
    for (const p of hidden) {
      console.log(`  ${p.id} | ${p.title || '(không tiêu đề)'} | ${p.location || ''}`);
    }
    console.log('');
  }

  if (!dryRun && hidden.length > 0) {
    const result = await prisma.cmsRecord.deleteMany({
      where: { collection: 'properties', id: { in: hidden.map(p => p.id) } },
    });
    console.log(`✓ Đã xóa ${result.count} BĐS đã ẩn khỏi database.`);
    console.log('');
  } else if (dryRun && hidden.length > 0) {
    console.log('(dry-run — chưa xóa, chạy không có --dry-run để xóa thật)');
    console.log('');
  }

  const remaining = dryRun ? active : (
    await prisma.cmsRecord.findMany({ where: { collection: 'properties' } })
  ).map(row => {
    const data = row.data as PropertyRow;
    return { ...data, id: row.id, sale_status: data.sale_status || row.saleStatus || 'available' };
  });

  const withoutProject = remaining.filter(p => !String(p.project_name || '').trim());

  console.log('=== SAU DỌN — BĐS CÒN LẠI ===');
  console.log(`Tổng: ${remaining.length}`);
  const byStatus = {
    available: remaining.filter(p => (p.sale_status || 'available') === 'available').length,
    sold: remaining.filter(p => p.sale_status === 'sold').length,
    hidden: remaining.filter(p => p.sale_status === 'hidden').length,
  };
  console.log(`  Đang bán: ${byStatus.available} | Đã bán: ${byStatus.sold} | Ẩn: ${byStatus.hidden}`);
  console.log('');

  if (withoutProject.length) {
    console.log(`--- Chưa gán dự án / phân khu (${withoutProject.length}) ---`);
    for (const p of withoutProject) {
      console.log(`  ${p.id} | ${p.sale_status || 'available'} | ${p.title || '?'} | ${p.location || ''}`);
    }
  } else {
    console.log('✓ Tất cả BĐS còn lại đều đã có project_name.');
  }

  const withProject = remaining.filter(p => String(p.project_name || '').trim());
  if (withProject.length) {
    console.log('');
    console.log(`--- Đã có dự án (${withProject.length}) ---`);
    for (const p of withProject) {
      console.log(`  ${p.project_name} | ${p.title || '?'}`);
    }
  }
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
