/**
 * H2.4.5 Live E2E — acceptance fixture + real action handlers.
 * Marker: h2.4.5-lead-alert-contract
 *
 * Run: npx tsx scripts/test-h245-live-e2e.ts
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { ensureDatabaseReady, getSettings } from '../server/dbHelper';
import { prisma } from '../server/prisma';
import { processLeadAcquisition } from '../server/modules/lead-acquisition';
import { processSalesLayer, readSalesProfile } from '../server/modules/sales-layer';
import {
  leadAlertEventKey,
  notifyFindingIfEligible,
} from '../server/notifications/telegramNotificationService';
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
import { createCommandEngine } from '../server/modules/control-plane/command-engine';
import { callbackDataToCommand } from '../server/modules/control-plane/inlineKeyboard';
import { toTelUri } from '../server/modules/sales-layer';

const MARKER = 'h2.4.5-lead-alert-contract';
process.env.TELEGRAM_SKIP_LINK_VERIFY = process.env.TELEGRAM_SKIP_LINK_VERIFY || '1';
if (!process.env.PUBLIC_SITE_URL) {
  process.env.PUBLIC_SITE_URL = 'https://bdsdanang.site';
}

function ensureTelegramChannelEnv() {
  const allowed = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim()) {
    process.env.TELEGRAM_LEAD_CHAT_ID = allowed[1] || '-5592400378';
  }
  if (!String(process.env.TELEGRAM_OPS_CHAT_ID || '').trim()) {
    process.env.TELEGRAM_OPS_CHAT_ID = allowed[0] || '-5348392375';
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

async function main() {
  await ensureDatabaseReady();
  await cleanup();

  const settings = getSettings();
  const botToken = String(settings.telegram_bot_token || '').trim();
  const leadChat = String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim();
  console.log(`Telegram: token=${botToken ? 'yes' : 'NO'} lead=${leadChat || 'NO'}`);

  const companyId = await resolveCompanyId();
  const permalink =
    'https://www.facebook.com/groups/h244buyer/posts/1785201214344';
  const groupName = 'HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG';
  const campaignLabel = 'h2.4.4-unify-lead-alert buyer';

  const src = await prisma.agentSource.create({
    data: {
      companyId,
      name: `${MARKER} ${campaignLabel}`,
      type: 'facebook_group',
      url: 'https://www.facebook.com/groups/h244buyer',
      status: 'active',
    },
  });
  const content = await prisma.scannedContent.create({
    data: {
      companyId,
      sourceId: src.id,
      canonicalUrl: permalink,
      contentText: `${MARKER} Cần mua đất nền Ngũ Hành Sơn ngân sách 5 tỷ`,
      contentHash: createHash('sha256').update(`${MARKER}:${Date.now()}`).digest('hex'),
      authorName: 'Buyer Test',
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
      title: `${campaignLabel} Cần mua đất nền Ngũ Hành Sơn`,
      summary: `${MARKER} Cần mua đất nền Ngũ Hành Sơn, ngân sách 5 tỷ, gọi ngay hôm nay.`,
      needSummary: `${MARKER} Cần mua đất nền Ngũ Hành Sơn, ngân sách 5 tỷ, gọi ngay hôm nay.`,
      primaryPhone: '0905111001',
      primaryLocation: 'Ngũ Hành Sơn',
      propertyType: 'đất nền',
      budgetMin: 5,
      budgetMax: 5,
      score: 66,
      finalScore: 66,
      keywordScore: 60,
      aiScore: 66,
      extractedData: {
        marker: MARKER,
        source: {
          groupName,
          platform: 'facebook',
          groupUrl: 'https://www.facebook.com/groups/h244buyer',
        },
      },
    },
  });

  console.log('Finding', finding.id);

  await processLeadAcquisition({ findingId: finding.id, notifyTelegram: false });
  await processSalesLayer({ findingId: finding.id, notifyFollowUp: false });

  const send = await notifyFindingIfEligible({ findingId: finding.id });
  console.log('Telegram send', send);

  const log = await prisma.telegramDeliveryLog.findFirst({
    where: { findingId: finding.id, eventKey: leadAlertEventKey(finding.id) },
  });
  const preview = log?.payloadPreview || '';
  console.log('--- CARD PREVIEW ---\n' + preview + '\n-------------------');

  assert(preview.includes('🎯 LEAD ALERT'), 'canonical card');
  assert(preview.includes('Cần mua đất nền Ngũ Hành Sơn'), 'need clean');
  assert(preview.includes(`Facebook · ${groupName}`), 'source clean');
  assert(!/h2\.4\.4-unify-lead-alert/i.test(preview), 'no campaign in card');
  assert(!/findingId/i.test(preview), 'no findingId token');

  if (botToken && leadChat) {
    assert(send.ok === true, `telegram sent: ${JSON.stringify(send)}`);
    assert(log?.status === 'sent', 'delivery sent');
  }

  // Action handlers (real DB ops — simulate Telegram callbacks)
  const engine = createCommandEngine();
  const actor = 'h245-e2e-tester';

  // Call — Telegram rejects tel: on inline URL buttons; callback returns tel in body
  const call = await opsLeadCall(finding.id, actor);
  assert(toTelUri('0905111001') === 'tel:+84905111001', 'tel uri');
  assert(call.telUri === 'tel:+84905111001', 'call returns telUri');
  assert(call.lines.join('\n').includes('0905111001'), 'call phone');
  assert(call.lines.join('\n').includes('tel:+84905111001'), 'call tel in confirmation');
  assert(!/unknown/i.test(call.lines.join('\n')), 'call not unknown');

  // Contact
  const contact = await opsLeadContact(finding.id, actor);
  assert(contact.lines.some(l => /Đã ghi nhận: Contact/i.test(l)), 'contact confirm');
  const afterContact = await prisma.agentFinding.findUnique({ where: { id: finding.id } });
  const salesAfterContact = readSalesProfile(afterContact?.extractedData);
  assert(
    salesAfterContact?.timeline.some(t => t.kind === 'contact'),
    'contact persisted',
  );

  // Open
  const open = await opsLeadOpen(finding.id, actor);
  assert(Boolean(open.url && open.url.includes(finding.id)), 'open lead url');
  assert(!open.lines.some(l => /findingId ·/i.test(l)), 'open no raw id line');

  // Source
  const source = await opsLeadSource(finding.id, actor);
  assert(source.url === permalink, 'source permalink');

  // Assign picker + owner
  const assign = await opsLeadAssign(finding.id, actor);
  assert(Boolean(assign.replyMarkup?.inline_keyboard?.length), 'assign picker');
  const pickBtn = assign.replyMarkup!.inline_keyboard.flat()[0];
  const mapped = pickBtn && 'callback_data' in pickBtn
    ? callbackDataToCommand(pickBtn.callback_data!)
    : null;
  assert(Boolean(mapped && mapped.startsWith('/lead owner')), 'owner callback maps');
  const ownerCmd = await engine.execute(mapped || `/lead owner ${finding.id} self`, {
    triggeredBy: actor,
    client: 'telegram',
  });
  assert(ownerCmd.ok, `owner cmd: ${ownerCmd.lines.join(' ')}`);
  assert(!/unknown/i.test(ownerCmd.lines.join('\n')), 'owner not unknown');

  const afterAssign = await prisma.agentFinding.findUnique({ where: { id: finding.id } });
  const salesAssigned = readSalesProfile(afterAssign?.extractedData);
  assert(Boolean(salesAssigned?.owner), 'owner persisted');

  // History
  const history = await opsLeadHistory(finding.id);
  assert(history.lines[0]?.includes('HISTORY') || history.lines.some(l => /History|Journey|Pipeline/i.test(l)), 'history');
  assert(!history.lines.some(l => /^Buyer cms/i.test(l)), 'history no raw buyer id header');

  // Ignore idempotent
  const ign1 = await opsLeadSkip(finding.id, actor);
  const ign2 = await opsLeadSkip(finding.id, actor);
  assert(ign1.status === 'dismissed', 'ignore');
  assert(ign2.idempotent === true, 'ignore idempotent');
  const dismissed = await prisma.agentFinding.findUnique({ where: { id: finding.id } });
  assert(dismissed?.status === 'dismissed', 'dismissed state');

  // Callback maps never null for card actions
  for (const data of [
    `l:t:${finding.id}`,
    `l:a:${finding.id}`,
    `l:h:${finding.id}`,
    `l:s:${finding.id}`,
    `l:n:${finding.id}`,
    `l:u:${finding.id}`,
    `l:k:${finding.id}`,
  ]) {
    const m = callbackDataToCommand(data);
    assert(Boolean(m), `map ${data}`);
    assert(!/unknown/i.test(m || ''), `map text ${data}`);
  }

  console.log(
    JSON.stringify(
      {
        findingId: finding.id,
        messageId: send.messageId || null,
        deliveryId: log?.id || null,
        deliveryStatus: log?.status || null,
        owner: salesAssigned?.owner || null,
        tel: toTelUri('0905111001'),
        permalink,
      },
      null,
      2,
    ),
  );

  const removed = await cleanup();
  console.log(`Cleanup removed ${removed} findings`);
  console.log('\nPASS H2.4.5 live E2E');
}

main()
  .catch(async err => {
    console.error(err);
    await cleanup().catch(() => null);
    process.exit(1);
  })
  .then(() => prisma.$disconnect());
