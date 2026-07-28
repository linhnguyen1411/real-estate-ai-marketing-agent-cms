/**
 * H2.4.7 Live E2E — CMS producer path with prodv100 config vs real content provenance.
 * Marker: h2.4.7-source-prov
 * Run: npx tsx scripts/test-h247-live-e2e.ts
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
  opsLeadOpen,
  opsLeadSource,
} from '../server/modules/control-plane/operationsService';

const MARKER = 'h2.4.7-source-prov';
const REAL_GROUP = 'HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG';
const REAL_PERMALINK =
  'https://www.facebook.com/groups/987654321098765/posts/1785209976043';
const CONFIG_NAME = 'prodv100';
const BAD_CANONICAL = 'https://www.facebook.com/groups/prodv100/posts/1785209976043';

process.env.TELEGRAM_SKIP_LINK_VERIFY = process.env.TELEGRAM_SKIP_LINK_VERIFY || '1';
if (!process.env.PUBLIC_SITE_URL) process.env.PUBLIC_SITE_URL = 'https://bdsdanang.site';

function ensureTelegramChannelEnv() {
  if (!String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim()) {
    throw new Error('TELEGRAM_LEAD_CHAT_ID required — no ALLOWED fallback');
  }
}
ensureTelegramChannelEnv();

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
  await prisma.agentSource.deleteMany({
    where: {
      OR: [{ name: { contains: MARKER } }, { name: CONFIG_NAME }, { url: { contains: 'prodv100' } }],
    },
  });
  return ids.length;
}

async function createFinding(input: {
  companyId: string;
  suffix: string;
  classification: string;
  sourceId?: string;
}) {
  let sourceId = input.sourceId;
  if (!sourceId) {
    const src = await prisma.agentSource.create({
      data: {
        companyId: input.companyId,
        name: CONFIG_NAME, // internal config — must NOT appear on card
        type: 'facebook_group',
        url: `https://www.facebook.com/groups/prodv100-${input.suffix}-${Date.now()}`,
        status: 'active',
      },
    });
    sourceId = src.id;
  }
  // Intentionally poison scannedContent.canonicalUrl with fabricated config URL;
  // real permalink lives only in extractedData.content provenance.
  const content = await prisma.scannedContent.create({
    data: {
      companyId: input.companyId,
      sourceId,
      canonicalUrl: BAD_CANONICAL,
      contentText: `${MARKER} Cần mua đất nền Ngũ Hành Sơn`,
      contentHash: createHash('sha256')
        .update(`${MARKER}:${input.suffix}:${Date.now()}`)
        .digest('hex'),
      authorName: `H247 ${input.suffix}`,
      status: 'collected',
    },
  });
  return prisma.agentFinding.create({
    data: {
      companyId: input.companyId,
      sourceId,
      scannedContentId: content.id,
      type: 'lead',
      status: 'new',
      classification: input.classification,
      title: `${MARKER} ${input.suffix} Cần mua đất nền`,
      summary: `${MARKER} Cần mua đất nền Ngũ Hành Sơn ngân sách 5 tỷ`,
      needSummary: 'Cần mua đất nền Ngũ Hành Sơn',
      primaryPhone: '0905111001',
      primaryLocation: 'Ngũ Hành Sơn',
      propertyType: 'đất nền',
      budgetMin: 5,
      budgetMax: 5,
      score: 70,
      finalScore: 70,
      keywordScore: 60,
      aiScore: 70,
      extractedData: {
        marker: MARKER,
        source: {
          groupName: REAL_GROUP,
          platform: 'facebook',
          permalink: REAL_PERMALINK,
          sourceName: CONFIG_NAME,
        },
      },
    },
  });
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

  const personas = [
    { suffix: 'buyer', classification: 'buyer' },
    { suffix: 'tenant', classification: 'renter' },
    { suffix: 'investor', classification: 'investor' },
  ] as const;

  const results: Array<{ id: string; msg: string | null }> = [];

  for (const p of personas) {
    const finding = await createFinding({ companyId: company!, ...p });
    await processLeadAcquisition({ findingId: finding.id, notifyTelegram: false });
    await processSalesLayer({ findingId: finding.id, notifyFollowUp: false }).catch(() => null);

    const first = await notifyFindingIfEligible({ findingId: finding.id });
    const second = await notifyFindingIfEligible({ findingId: finding.id });
    assert(first.ok === true, `${p.suffix} sent ${JSON.stringify(first)}`);
    assert(second.skipped === true && second.reason === 'already_sent', `${p.suffix} dedupe`);

    const log = await prisma.telegramDeliveryLog.findFirst({
      where: { findingId: finding.id, eventKey: leadAlertEventKey(finding.id) },
    });
    const preview = String(log?.payloadPreview || '');
    assert(isCanonicalLeadAlertText(preview), `${p.suffix} canonical`);
    assert(preview.includes(`Facebook · ${REAL_GROUP}`), `${p.suffix} source label`);
    assert(!/prodv100/i.test(preview), `${p.suffix} no prodv100 in card`);
    assert(!preview.includes(BAD_CANONICAL), `${p.suffix} no bad url in card`);

    // DB provenance: scannedContent still has bad canonical (config poison),
    // but extractedData + telegram must use real permalink.
    const row = await prisma.agentFinding.findUnique({
      where: { id: finding.id },
      include: {
        scannedContent: { select: { canonicalUrl: true } },
        source: { select: { name: true } },
      },
    });
    assert(row?.source?.name === CONFIG_NAME, `${p.suffix} AgentSource config`);
    assert(row?.scannedContent?.canonicalUrl === BAD_CANONICAL, `${p.suffix} poisoned canonical`);
    const ed = row?.extractedData as { source?: { permalink?: string; groupName?: string } };
    assert(ed?.source?.permalink === REAL_PERMALINK, `${p.suffix} ed permalink`);
    assert(ed?.source?.groupName === REAL_GROUP, `${p.suffix} ed group`);

    const source = await opsLeadSource(finding.id, 'h247-e2e');
    assert(source.url === REAL_PERMALINK, `${p.suffix} ops source url`);
    assert(!/prodv100/i.test(source.lines.join('\n')), `${p.suffix} ops no prodv100`);

    const open = await opsLeadOpen(finding.id, 'h247-e2e');
    assert(Boolean(open.url), `${p.suffix} open lead`);

    results.push({ id: finding.id, msg: first.messageId || null });
    console.log(`PASS ${p.suffix} msg=${first.messageId}`);
  }

  const removed = await cleanup();
  const leftover = await prisma.agentFinding.count({
    where: { OR: [{ title: { contains: MARKER } }, { summary: { contains: MARKER } }] },
  });
  assert(leftover === 0, 'cleanup');
  console.log(JSON.stringify({ results, cleanup: removed }, null, 2));
  console.log('\nPASS H2.4.7 live E2E');
}

main()
  .catch(async err => {
    console.error(err);
    await cleanup().catch(() => null);
    process.exit(1);
  })
  .then(() => prisma.$disconnect());
