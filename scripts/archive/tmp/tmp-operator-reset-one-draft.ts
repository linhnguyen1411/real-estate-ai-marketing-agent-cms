/**
 * Cancel all social drafts/jobs, then create one ready draft for the operator.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  // Cancel active publish agent jobs
  const agents = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    select: { id: true },
  });
  for (const a of agents) {
    await p.agentJob.update({
      where: { id: a.id },
      data: {
        status: 'cancelled',
        errorMessage: 'operator_reset',
        finishedAt: new Date(),
      },
    });
  }

  const openJobs = await p.socialPublishJob.findMany({
    where: {
      status: { in: ['queued', 'claimed', 'preparing', 'publishing', 'failed'] },
    },
    select: { id: true },
  });
  if (openJobs.length) {
    const ids = openJobs.map(j => j.id);
    await p.socialPublishAttempt.deleteMany({ where: { jobId: { in: ids } } });
    await p.socialPublishJob.deleteMany({ where: { id: { in: ids } } });
  }

  const cancelledDrafts = await p.socialPostDraft.updateMany({
    where: {
      status: { in: ['draft', 'approved', 'scheduled', 'failed', 'cancelled'] },
    },
    data: { status: 'cancelled' },
  });

  // Also cancel anything still not published/archived
  await p.socialPostDraft.updateMany({
    where: { status: { notIn: ['published', 'cancelled'] } },
    data: { status: 'cancelled' },
  });

  const body = `Cơ hội hiếm có cho các nhà đầu tư lớn hoặc doanh nghiệp muốn tìm mặt bằng rộng, vị trí đắc địa tại trục đường huyết mạch Mai Đăng Chơn!

Diện tích khủng: 650m² (Mặt tiền rộng rãi, cực thoáng).

Vị trí vàng: Nằm trên trục đường chính kết nối giao thương nhộn nhịp, dân cư đông đúc, tiện ích bao quanh.

Phù hợp đa dạng loại hình:

Xây dựng tòa nhà văn phòng, showroom, trung tâm ngoại ngữ.

Kinh doanh nhà hàng, quán cà phê sân vườn view rộng.

Xây căn hộ dịch vụ cho thuê (dòng tiền ổn định).

Kho bãi, xưởng trung chuyển hàng hóa.

Pháp lý: Sổ đỏ chính chủ, thủ tục sang tên nhanh chóng.

Giá đầu tư cực kỳ hợp lý cho một lô đất mặt tiền diện tích lớn tại khu vực đang phát triển mạnh mẽ này.

📞 Liên hệ ngay: 0905 777 594 để biết thêm thông tin chi tiết và xem đất thực tế!

#BanDatDaNang #MatTienMaiDangChon #DatNenDaNang #BatDongSanDaNang #DatKinhDoanh`;

  const draft = await p.socialPostDraft.create({
    data: {
      companyId: 'comp-da-nang',
      status: 'draft',
      title: 'Mai Đăng Chơn 650m²',
      body,
      createdBy: 'operator',
    },
  });

  const channels = await p.socialChannel.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        cancelledDrafts: cancelledDrafts.count,
        deletedJobs: openJobs.length,
        cancelledAgents: agents.length,
        draft: {
          id: draft.id,
          status: draft.status,
          title: draft.title,
          preview: draft.body.slice(0, 80),
        },
        channels,
        hint: 'Mở CMS → Social Publishing → Drafts; Approve + Schedule khi sẵn sàng',
      },
      null,
      2,
    ),
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
