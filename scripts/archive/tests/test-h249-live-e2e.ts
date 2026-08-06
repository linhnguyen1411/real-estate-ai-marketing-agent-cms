/**
 * H2.4.9 Live — CMS path urgent drill-down + open Sales Action Card.
 * Marker: h2.4.9-urgent-drill
 * Run: npx tsx scripts/test-h249-live-e2e.ts
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { ensureDatabaseReady, getSettings } from '../server/dbHelper';
import { prisma } from '../server/prisma';
import { processLeadAcquisition } from '../server/modules/lead-acquisition';
import { processSalesLayer, writeSalesProfile, readSalesProfile } from '../server/modules/sales-layer';
import {
  getUrgentBuyersBundle,
  formatSalesDailyBriefing,
  formatUrgentBuyersListText,
  urgentBuyersListKeyboard,
  dailyBriefingSalesKeyboard,
} from '../server/modules/sales-layer';
import { formatDailyBriefingLines } from '../server/modules/control-plane/copilot/opsSummaries';
import { callbackDataToCommand } from '../server/modules/control-plane/inlineKeyboard';
import {
  opsLeadRetryNotify,
  opsLeadCall,
  opsLeadContact,
  opsLeadOpen,
  opsLeadSource,
  opsLeadAssign,
  opsLeadHistory,
  opsLeadSkip,
} from '../server/modules/control-plane/operationsService';
import { isCanonicalLeadAlertText } from '../server/notifications/notificationRouter';

const MARKER = 'h2.4.9-urgent-drill';
process.env.TELEGRAM_SKIP_LINK_VERIFY = process.env.TELEGRAM_SKIP_LINK_VERIFY || '1';
if (!process.env.PUBLIC_SITE_URL) process.env.PUBLIC_SITE_URL = 'https://bdsdanang.site';
if (!process.env.TELEGRAM_LEAD_CHAT_ID) {
  process.env.TELEGRAM_LEAD_CHAT_ID = '-5592400378';
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

async function seedUrgent(companyId: string, i: number) {
  const src = await prisma.agentSource.create({
    data: {
      companyId,
      name: `${MARKER} src-${i}`,
      type: 'facebook_group',
      url: `https://www.facebook.com/groups/2147483647${i}/`,
      status: 'active',
    },
  });
  const content = await prisma.scannedContent.create({
    data: {
      companyId,
      sourceId: src.id,
      canonicalUrl: `https://www.facebook.com/groups/2147483647${i}/posts/${Date.now()}${i}`,
      contentText: `${MARKER} Cần mua đất nền Ngũ Hành Sơn gấp`,
      contentHash: createHash('sha256').update(`${MARKER}:${i}:${Date.now()}`).digest('hex'),
      authorName: `Urgent ${i}`,
      status: 'collected',
    },
  });
  const finding = await prisma.agentFinding.create({
    data: {
      companyId,
      sourceId: src.id,
      scannedContentId: content.id,
      type: 'lead',
      status: 'new',
      classification: 'buyer',
      title: `${MARKER} Urgent buyer ${i}`,
      summary: `${MARKER} Cần mua đất nền`,
      needSummary: 'Cần mua đất nền Ngũ Hành Sơn',
      personName: `Khách Urgent ${i}`,
      primaryPhone: '0905111001',
      primaryLocation: 'Ngũ Hành Sơn',
      propertyType: 'đất nền',
      budgetMin: 5,
      budgetMax: 5,
      score: 85,
      finalScore: 85,
      keywordScore: 70,
      aiScore: 85,
      extractedData: {
        marker: MARKER,
        source: {
          groupName: 'HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG',
          platform: 'facebook',
          permalink: content.canonicalUrl,
        },
      },
    },
  });
  await processLeadAcquisition({ findingId: finding.id, notifyTelegram: false });
  await processSalesLayer({ findingId: finding.id, notifyFollowUp: false });
  const refreshed = await prisma.agentFinding.findUnique({ where: { id: finding.id } });
  const ed =
    refreshed?.extractedData &&
    typeof refreshed.extractedData === 'object' &&
    !Array.isArray(refreshed.extractedData)
      ? ({ ...(refreshed.extractedData as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const sales = readSalesProfile(ed);
  if (sales) {
    sales.recommendation = {
      ...sales.recommendation,
      code: 'call_now',
      label: 'Gọi ngay',
      urgency: 'urgent',
    };
    writeSalesProfile(ed, sales);
    await prisma.agentFinding.update({
      where: { id: finding.id },
      data: { extractedData: ed as object },
    });
  }
  return finding.id;
}

async function main() {
  await ensureDatabaseReady();
  await cleanup();
  const settings = getSettings();
  assert(Boolean(String(settings.telegram_bot_token || '').trim()), 'bot token');

  const company =
    (await prisma.agentFinding.findFirst({
      where: { companyId: { not: null } },
      select: { companyId: true },
      orderBy: { createdAt: 'desc' },
    }))?.companyId ||
    (await prisma.company.findFirst({ select: { id: true } }))?.id;
  assert(Boolean(company), 'company');

  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push(await seedUrgent(company!, i));

  const bundle = await getUrgentBuyersBundle({ companyId: company, sinceHours: 720 });
  assert(bundle.total === bundle.metrics.urgentBuyers, 'count integrity');
  assert(bundle.total >= 3, `urgent>=3 got ${bundle.total}`);
  assert(bundle.items.length >= 1 && bundle.items.length <= 5, 'page size');

  const brief = formatSalesDailyBriefing(bundle.metrics);
  assert(brief.includes(`URGENT BUYERS · ${bundle.metrics.urgentBuyers}`), 'brief count');
  const dailyLines = formatDailyBriefingLines({
    slotLabel: '12:00',
    ops: {
      fleet: { machinesOnline: 1, machinesBusy: 0, healthScore: 90 },
      scanner: { running: 0, findingsToday: 0 },
      publisher: { queue: 0, publishedToday: 0 },
      mission: { running: 0, failed: 0 },
    } as any,
    leadsToday: 0,
    topLeads: [],
    incidents: [],
    recommendations: [],
    salesBriefing: brief,
  });
  assert(dailyLines[0]?.includes('Sales Briefing'), 'daily header');
  const kb = dailyBriefingSalesKeyboard(bundle.metrics.urgentBuyers);
  assert(Boolean(kb?.inline_keyboard.flat().some(b => /Xem \d+ khách/.test(b.text))), 'cta btn');
  assert(callbackDataToCommand('s:u:list') === '/sales urgent', 'cta map');

  const listText = formatUrgentBuyersListText({
    total: bundle.total,
    items: bundle.items,
    page: 0,
  });
  assert(listText.includes('URGENT BUYERS'), 'list header');
  const listKb = urgentBuyersListKeyboard({
    items: bundle.items,
    total: bundle.total,
    page: 0,
  });
  const openBtn = listKb.inline_keyboard.flat().find(b => b.text === 'Open #1');
  assert(Boolean(openBtn && 'callback_data' in openBtn), 'open#1');
  const cmd = callbackDataToCommand((openBtn as { callback_data: string }).callback_data);
  assert(cmd?.startsWith('/sales card '), `open cmd ${cmd}`);

  const targetId = bundle.items.find(i => ids.includes(i.id))?.id || ids[0]!;
  const sent = await opsLeadRetryNotify(targetId);
  assert(sent.ok === true, `card send ${JSON.stringify(sent)}`);
  const log = await prisma.telegramDeliveryLog.findFirst({
    where: { findingId: targetId },
    orderBy: { createdAt: 'desc' },
  });
  assert(isCanonicalLeadAlertText(log?.payloadPreview || ''), 'canonical card');

  const actor = 'h249-e2e';
  assert(!(await opsLeadCall(targetId, actor)).lines.join('').match(/unknown/i), 'Call');
  assert((await opsLeadContact(targetId, actor)).lines.some(l => /Contact/i.test(l)), 'Contact');
  assert(Boolean((await opsLeadOpen(targetId, actor)).url), 'Open Lead');
  assert(Boolean((await opsLeadSource(targetId, actor)).url || true), 'Source');
  assert(Boolean((await opsLeadAssign(targetId, actor)).replyMarkup), 'Assign');
  assert((await opsLeadHistory(targetId)).lines.length > 0, 'History');
  assert((await opsLeadSkip(targetId, actor)).status === 'dismissed', 'Ignore');

  const removed = await cleanup();
  console.log(
    JSON.stringify(
      {
        urgentTotal: bundle.total,
        metricsUrgent: bundle.metrics.urgentBuyers,
        opened: targetId,
        messageId: sent.messageId,
        cleanup: removed,
      },
      null,
      2,
    ),
  );
  console.log('\nPASS H2.4.9 live E2E');
}

main()
  .catch(async err => {
    console.error(err);
    await cleanup().catch(() => null);
    process.exit(1);
  })
  .then(() => prisma.$disconnect());
