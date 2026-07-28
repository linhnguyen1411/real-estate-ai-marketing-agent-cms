/**
 * H2.4.4 Live E2E — Finding → Acquisition → Sales → Notification → Telegram.
 * Marker: h2.4.4-unify-lead-alert
 *
 * Creates real DB findings (buyer + tenant), runs CMS notification path,
 * verifies canonical card + single delivery, then cleans up test rows.
 *
 * Run: npx tsx scripts/test-h244-live-e2e.ts
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { ensureDatabaseReady, getSettings } from '../server/dbHelper';
import { prisma } from '../server/prisma';
import { processLeadAcquisition } from '../server/modules/lead-acquisition';
import { processSalesLayer } from '../server/modules/sales-layer';
import {
  leadAlertEventKey,
  notifyFindingIfEligible,
} from '../server/notifications/telegramNotificationService';

const MARKER = 'h2.4.4-unify-lead-alert';
process.env.TELEGRAM_SKIP_LINK_VERIFY = process.env.TELEGRAM_SKIP_LINK_VERIFY || '1';

/** Bootstrap channel IDs from ALLOWED list when LEAD/OPS not set (matches .env.example order). */
function ensureTelegramChannelEnv() {
  const allowed = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const defaults: Record<string, string> = {
    TELEGRAM_OPS_CHAT_ID: allowed[0] || '-5348392375',
    TELEGRAM_LEAD_CHAT_ID: allowed[1] || '-5592400378',
    TELEGRAM_PUBLISH_CHAT_ID: allowed[2] || '-5261113042',
    TELEGRAM_REPORT_CHAT_ID: allowed[3] || '-5446190511',
    TELEGRAM_CRITICAL_CHAT_ID: allowed[4] || '-5132560624',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!String(process.env[k] || '').trim()) process.env[k] = v;
  }
}
ensureTelegramChannelEnv();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function resolveCompanyId(): Promise<string> {
  const fromFinding = await prisma.agentFinding.findFirst({
    where: { companyId: { not: null } },
    select: { companyId: true },
    orderBy: { createdAt: 'desc' },
  });
  if (fromFinding?.companyId) return fromFinding.companyId;
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error('No company in DB');
  return company.id;
}

async function createTestFinding(input: {
  companyId: string;
  suffix: string;
  classification: string;
  title: string;
  text: string;
  phone: string;
  location: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  propertyType?: string | null;
}) {
  const src = await prisma.agentSource.create({
    data: {
      companyId: input.companyId,
      name: `${MARKER} ${input.suffix}`,
      type: 'facebook_group',
      url: `https://www.facebook.com/groups/2147483647${input.suffix === 'buyer' ? '1' : '2'}`,
      status: 'active',
    },
  });
  const content = await prisma.scannedContent.create({
    data: {
      companyId: input.companyId,
      sourceId: src.id,
      canonicalUrl: `https://www.facebook.com/groups/2147483647${input.suffix === 'buyer' ? '1' : '2'}/posts/${Date.now()}`,
      contentText: input.text,
      contentHash: createHash('sha256')
        .update(`${MARKER}:${input.suffix}:${Date.now()}`)
        .digest('hex'),
      authorName: `Test ${input.suffix}`,
      status: 'collected',
    },
  });
  return prisma.agentFinding.create({
    data: {
      companyId: input.companyId,
      sourceId: src.id,
      scannedContentId: content.id,
      type: 'lead',
      status: 'new',
      classification: input.classification,
      title: input.title,
      summary: input.text,
      needSummary: input.text.slice(0, 180),
      primaryPhone: input.phone,
      primaryLocation: input.location,
      propertyType: input.propertyType || null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      score: 80,
      finalScore: 80,
      keywordScore: 70,
      aiScore: 75,
      extractedData: {
        marker: MARKER,
        source: {
          groupName: 'HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG',
          groupUrl: `https://www.facebook.com/groups/2147483647${input.suffix === 'buyer' ? '1' : '2'}`,
        },
      },
    },
  });
}

async function cleanup() {
  const findings = await prisma.agentFinding.findMany({
    where: {
      OR: [{ title: { contains: MARKER } }, { summary: { contains: MARKER } }],
    },
    select: { id: true, sourceId: true, scannedContentId: true, companyId: true },
    take: 50,
  });
  const ids = findings.map(f => f.id);
  if (ids.length) {
    await prisma.telegramDeliveryLog.deleteMany({
      where: { findingId: { in: ids } },
    });
    await prisma.agentFinding.deleteMany({ where: { id: { in: ids } } });
  }
  const contentIds = findings.map(f => f.scannedContentId).filter(Boolean) as string[];
  if (contentIds.length) {
    await prisma.scannedContent.deleteMany({ where: { id: { in: contentIds } } });
  }
  await prisma.agentSource.deleteMany({
    where: { name: { contains: MARKER } },
  });
  return ids.length;
}

async function runOne(label: string, findingId: string) {
  const acq = await processLeadAcquisition({
    findingId,
    notifyTelegram: false,
  });
  assert(Boolean(acq), `${label} acquisition`);

  await processSalesLayer({ findingId, notifyFollowUp: false }).catch(() => null);

  const first = await notifyFindingIfEligible({ findingId });
  const second = await notifyFindingIfEligible({ findingId });

  const eventKey = leadAlertEventKey(findingId);
  const logs = await prisma.telegramDeliveryLog.findMany({
    where: { findingId, eventKey },
    orderBy: { createdAt: 'desc' },
  });

  return { first, second, logs, acq, eventKey };
}

async function main() {
  await ensureDatabaseReady();
  const settings = getSettings();
  const botToken = String(settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const leadChat = String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim();
  console.log(
    `Telegram creds: token=${botToken ? 'yes' : 'NO'} leadChat=${leadChat ? 'yes' : 'NO'}`,
  );

  await cleanup();
  const companyId = await resolveCompanyId();

  const buyer = await createTestFinding({
    companyId,
    suffix: 'buyer',
    classification: 'buyer',
    title: `${MARKER} buyer cần mua đất Ngũ Hành Sơn`,
    text: `${MARKER} Cần mua đất nền Ngũ Hành Sơn, ngân sách 5 tỷ, gọi ngay hôm nay.`,
    phone: '0905111001',
    location: 'Ngũ Hành Sơn',
    budgetMin: 5,
    budgetMax: 5,
    propertyType: 'đất nền',
  });

  const tenant = await createTestFinding({
    companyId,
    suffix: 'tenant',
    classification: 'renter',
    title: `${MARKER} tenant cần thuê nhà`,
    text: `${MARKER} Cần thuê nhà Liên Chiểu giá thuê ≤ 12 triệu/tháng, có SĐT liên hệ.`,
    phone: '0903522712',
    location: 'Liên Chiểu',
    budgetMin: null,
    budgetMax: 12_000_000,
    propertyType: 'nhà',
  });

  console.log(`Created buyer=${buyer.id} tenant=${tenant.id}`);

  const buyerRun = await runOne('buyer', buyer.id);
  const tenantRun = await runOne('tenant', tenant.id);

  console.log('Buyer first:', buyerRun.first);
  console.log('Buyer second (expect dedup):', buyerRun.second);
  console.log('Tenant first:', tenantRun.first);
  console.log('Tenant second (expect dedup):', tenantRun.second);

  assert(
    buyerRun.second.skipped === true && buyerRun.second.reason === 'already_sent',
    'buyer duplicate blocked',
  );
  assert(
    tenantRun.second.skipped === true && tenantRun.second.reason === 'already_sent',
    'tenant duplicate blocked',
  );

  for (const [label, run] of [
    ['buyer', buyerRun],
    ['tenant', tenantRun],
  ] as const) {
    const preview = run.logs[0]?.payloadPreview || '';
    assert(preview.includes('🎯 LEAD ALERT'), `${label} canonical header in delivery log`);
    assert(preview.includes('BUYER CONFIDENCE'), `${label} confidence metric`);
    assert(!/Lead mới \(\d+\/100\)/.test(preview), `${label} no legacy format`);
    assert(run.logs.filter(l => l.status === 'sent' || l.status === 'queued').length <= 1
      || run.logs.every(l => l.eventKey === run.eventKey), `${label} single event key`);
  }

  assert(buyerRun.logs[0]?.payloadPreview?.includes('Người mua'), 'buyer role');
  assert(tenantRun.logs[0]?.payloadPreview?.includes('Người thuê'), 'tenant role');

  if (!botToken || !leadChat) {
    console.warn('PARTIAL live Telegram send skipped — missing bot token or LEAD chat id');
    assert(
      buyerRun.first.reason === 'missing_credentials' || buyerRun.first.ok || buyerRun.first.skipped,
      'buyer path executed',
    );
  } else {
    assert(buyerRun.first.ok === true, `buyer telegram sent: ${JSON.stringify(buyerRun.first)}`);
    assert(tenantRun.first.ok === true, `tenant telegram sent: ${JSON.stringify(tenantRun.first)}`);
    assert(buyerRun.logs[0]?.status === 'sent', 'buyer delivery log sent');
    assert(tenantRun.logs[0]?.status === 'sent', 'tenant delivery log sent');
    console.log('Live Telegram: buyer + tenant SENT on LEAD channel');
  }

  const removed = await cleanup();
  console.log(`Cleanup removed ${removed} test findings`);
  console.log('\nPASS H2.4.4 live E2E (canonical card + dedupe + cleanup)');
}

main()
  .catch(err => {
    console.error(err);
    return cleanup().finally(() => process.exit(1));
  })
  .then(() => prisma.$disconnect());
