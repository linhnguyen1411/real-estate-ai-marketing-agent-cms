/**
 * H2.4.6 Live E2E — prove legacy NEW_LEAD path is gone.
 * Marker: h2.4.6-eliminate-legacy
 * Run: npx tsx scripts/test-h246-live-e2e.ts
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
import { isCanonicalLeadAlertText } from '../server/notifications/notificationRouter';
import {
  opsLeadAssign,
  opsLeadAssignOwner,
  opsLeadCall,
  opsLeadContact,
  opsLeadHistory,
  opsLeadOpen,
  opsLeadSkip,
  opsLeadSource,
} from '../server/modules/control-plane/operationsService';

const MARKER = 'h2.4.6-eliminate-legacy';
process.env.TELEGRAM_SKIP_LINK_VERIFY = process.env.TELEGRAM_SKIP_LINK_VERIFY || '1';
if (!process.env.PUBLIC_SITE_URL) process.env.PUBLIC_SITE_URL = 'https://bdsdanang.site';

function ensureTelegramChannelEnv() {
  const allowed = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim()) {
    process.env.TELEGRAM_LEAD_CHAT_ID = allowed[1] || '-5592400378';
  }
}
ensureTelegramChannelEnv();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertNoLegacy(text: string) {
  assert(isCanonicalLeadAlertText(text), 'canonical card');
  assert(!text.includes('🎯 Lead Alerts'), 'no Lead Alerts');
  assert(!text.includes('Expected Deal'), 'no Expected Deal');
  assert(!text.includes('AI Suggestion'), 'no AI Suggestion');
  assert(!/\nJourney\n/.test(text), 'no Journey block');
  assert(!text.includes('Score:'), 'no Score:');
  assert(!/h2\.4\.4-unify-lead-alert/i.test(text), 'no campaign marker');
}

async function cleanup() {
  const findings = await prisma.agentFinding.findMany({
    where: {
      OR: [{ title: { contains: MARKER } }, { summary: { contains: MARKER } }],
    },
    select: { id: true, scannedContentId: true },
    take: 50,
  });
  const ids = findings.map(f => f.id);
  if (ids.length) {
    await prisma.telegramDeliveryLog.deleteMany({ where: { findingId: { in: ids } } });
    await prisma.agentFinding.deleteMany({ where: { id: { in: ids } } });
  }
  const contentIds = findings.map(f => f.scannedContentId).filter(Boolean) as string[];
  if (contentIds.length) {
    await prisma.scannedContent.deleteMany({ where: { id: { in: contentIds } } });
  }
  await prisma.agentSource.deleteMany({ where: { name: { contains: MARKER } } });
  return ids.length;
}

async function createFinding(input: {
  companyId: string;
  suffix: string;
  classification: string;
  title: string;
  text: string;
  phone: string;
  location: string;
  propertyType: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
}) {
  const src = await prisma.agentSource.create({
    data: {
      companyId: input.companyId,
      name: `${MARKER} ${input.suffix}`,
      type: 'facebook_group',
      url: `https://www.facebook.com/groups/h246${input.suffix}`,
      status: 'active',
    },
  });
  const content = await prisma.scannedContent.create({
    data: {
      companyId: input.companyId,
      sourceId: src.id,
      canonicalUrl: `https://www.facebook.com/groups/h246${input.suffix}/posts/${Date.now()}`,
      contentText: input.text,
      contentHash: createHash('sha256')
        .update(`${MARKER}:${input.suffix}:${Date.now()}`)
        .digest('hex'),
      authorName: `H246 ${input.suffix}`,
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
      needSummary: input.text,
      primaryPhone: input.phone,
      primaryLocation: input.location,
      propertyType: input.propertyType,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      score: 70,
      finalScore: 70,
      keywordScore: 60,
      aiScore: 70,
      extractedData: {
        marker: MARKER,
        source: {
          groupName: 'HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG',
          platform: 'facebook',
        },
      },
    },
  });
}

async function main() {
  await ensureDatabaseReady();
  await cleanup();
  const settings = getSettings();
  const botToken = String(settings.telegram_bot_token || '').trim();
  const leadChat = String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim();
  console.log(`Telegram token=${botToken ? 'yes' : 'NO'} lead=${leadChat || 'NO'}`);

  const company =
    (await prisma.agentFinding.findFirst({
      where: { companyId: { not: null } },
      select: { companyId: true },
      orderBy: { createdAt: 'desc' },
    }))?.companyId ||
    (await prisma.company.findFirst({ select: { id: true } }))?.id;
  if (!company) throw new Error('No company');

  const personas = [
    {
      suffix: 'buyer',
      classification: 'buyer',
      title: `${MARKER} Cần mua đất nền Ngũ Hành Sơn`,
      text: `${MARKER} Cần mua đất nền Ngũ Hành Sơn ngân sách 5 tỷ`,
      phone: '0905111001',
      location: 'Ngũ Hành Sơn',
      propertyType: 'đất nền',
      budgetMin: 5,
      budgetMax: 5,
      roleNeedle: 'Người mua',
    },
    {
      suffix: 'tenant',
      classification: 'renter',
      title: `${MARKER} Cần thuê nhà Liên Chiểu`,
      text: `${MARKER} Cần thuê nhà Liên Chiểu giá ≤ 12 triệu/tháng`,
      phone: '0903522712',
      location: 'Liên Chiểu',
      propertyType: 'nhà',
      budgetMin: null,
      budgetMax: 12_000_000,
      roleNeedle: 'Người thuê',
    },
    {
      suffix: 'investor',
      classification: 'investor',
      title: `${MARKER} Nhà đầu tư FPT`,
      text: `${MARKER} Đầu tư căn hộ FPT City dòng tiền`,
      phone: '0905111999',
      location: 'FPT City',
      propertyType: 'căn hộ',
      budgetMin: 3,
      budgetMax: 4,
      roleNeedle: 'Nhà đầu tư',
    },
  ] as const;

  const results: Array<{ id: string; msg: string | null; preview: string }> = [];

  for (const p of personas) {
    const finding = await createFinding({ companyId: company, ...p });
    await processLeadAcquisition({ findingId: finding.id, notifyTelegram: false });
    await processSalesLayer({ findingId: finding.id, notifyFollowUp: false }).catch(() => null);

    const first = await notifyFindingIfEligible({ findingId: finding.id });
    const second = await notifyFindingIfEligible({ findingId: finding.id });
    assert(second.skipped === true && second.reason === 'already_sent', `${p.suffix} dedupe`);

    const log = await prisma.telegramDeliveryLog.findFirst({
      where: { findingId: finding.id, eventKey: leadAlertEventKey(finding.id) },
    });
    const preview = log?.payloadPreview || '';
    assertNoLegacy(preview);
    assert(preview.includes(p.roleNeedle), `${p.suffix} role`);
    assert(preview.includes('📌 Need'), `${p.suffix} need`);
    assert(preview.includes('📂 Source'), `${p.suffix} source`);
    assert(preview.includes('🎯 BUYER CONFIDENCE'), `${p.suffix} confidence`);
    assert(preview.includes('💡 NEXT ACTION'), `${p.suffix} next`);

    if (botToken && leadChat) {
      assert(first.ok === true, `${p.suffix} sent: ${JSON.stringify(first)}`);
      assert(log?.status === 'sent', `${p.suffix} delivery`);
    }

    results.push({ id: finding.id, msg: first.messageId || null, preview });
    console.log(`PASS ${p.suffix} finding=${finding.id} msg=${first.messageId || 'n/a'}`);
  }

  // Actions on buyer finding
  const buyerId = results[0]!.id;
  const actor = 'h246-e2e';
  const call = await opsLeadCall(buyerId, actor);
  assert(!/unknown/i.test(call.lines.join('\n')), 'call');
  const contact = await opsLeadContact(buyerId, actor);
  assert(contact.lines.some(l => /Contact/i.test(l)), 'contact');
  const open = await opsLeadOpen(buyerId, actor);
  assert(Boolean(open.url), 'open');
  const source = await opsLeadSource(buyerId, actor);
  assert(Boolean(source.url || source.lines.length), 'source');
  const assign = await opsLeadAssign(buyerId, actor);
  assert(Boolean(assign.replyMarkup), 'assign picker');
  await opsLeadAssignOwner(buyerId, 'self', actor);
  const history = await opsLeadHistory(buyerId);
  assert(history.lines.length > 0, 'history');
  const ign = await opsLeadSkip(buyerId, actor);
  assert(ign.status === 'dismissed', 'ignore');
  console.log('PASS actions Call/Contact/Open/Source/Assign/History/Ignore');

  console.log(JSON.stringify({ results: results.map(r => ({ id: r.id, msg: r.msg })) }, null, 2));
  const removed = await cleanup();
  console.log(`Cleanup ${removed}`);
  console.log('\nPASS H2.4.6 live E2E');
}

main()
  .catch(async err => {
    console.error(err);
    await cleanup().catch(() => null);
    process.exit(1);
  })
  .then(() => prisma.$disconnect());
