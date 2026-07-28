/**
 * H2.4.5 — Lead Alert contract hardening (acceptance fixture + actions).
 * Run: npx tsx scripts/test-h245-lead-alert-contract.ts
 */
import assert from 'node:assert/strict';
import {
  buildLeadNeed,
  formatSalesActionCard,
  resolveSourceProvenance,
  salesActionCardKeyboard,
  toTelUri,
  stripInternalPollution,
} from '../server/modules/sales-layer/telegramSalesActionCard';
import { assertCardHasNoInternalLeakage } from '../server/modules/sales-layer/salesActionCardViewModel';
import { callbackDataToCommand } from '../server/modules/control-plane/inlineKeyboard';

const FIXTURE = {
  campaign: 'h2.4.4-unify-lead-alert buyer',
  groupName: 'HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG',
  permalink: 'https://www.facebook.com/groups/214748364712345/posts/1785201214344',
  phone: '0905111001',
  location: 'Ngũ Hành Sơn',
  propertyType: 'đất nền',
  pollutedNeed:
    'h2.4.4-unify-lead-alert Cần mua đất nền Ngũ Hành Sơn, ngân sách 5 tỷ, gọi ngay hôm nay.',
};

let n = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  n += 1;
  console.log(`✓ ${name}`);
}

// Need
{
  const need = buildLeadNeed({
    role: 'buyer',
    needSummary: FIXTURE.pollutedNeed,
    title: `${FIXTURE.campaign} buyer cần mua`,
    propertyType: FIXTURE.propertyType,
    location: FIXTURE.location,
  });
  ok('Need exact', need === 'Cần mua đất nền Ngũ Hành Sơn');
  ok('Need no campaign', !/h2\.4\.4|unify-lead-alert/i.test(need || ''));
}

// Source provenance
{
  const src = resolveSourceProvenance({
    extractedData: {
      source: {
        groupName: FIXTURE.groupName,
        platform: 'facebook',
      },
    },
    agentSourceName: FIXTURE.campaign,
    agentSourceType: 'facebook_group',
    canonicalUrl: FIXTURE.permalink,
  });
  ok('Source label', src.label === `Facebook · ${FIXTURE.groupName}`);
  ok('Source url', src.url === FIXTURE.permalink);
  ok('Source ignores campaign name', !/h2\.4\.4|unify/i.test(src.label || ''));
}

// Card
{
  const card = formatSalesActionCard({
    findingId: 'finding-h245-accept',
    role: 'buyer',
    confidencePct: 66,
    propertyType: FIXTURE.propertyType,
    location: FIXTURE.location,
    budgetMin: 5,
    budgetMax: 5,
    timeline: 'buying_today',
    phone: FIXTURE.phone,
    title: FIXTURE.pollutedNeed,
    needSummary: FIXTURE.pollutedNeed,
    agentSourceName: FIXTURE.campaign,
    agentSourceType: 'facebook_group',
    extractedData: {
      source: { groupName: FIXTURE.groupName, platform: 'facebook' },
    },
    sourceUrl: FIXTURE.permalink,
  });
  ok('Card header', card.includes('🎯 LEAD ALERT'));
  ok('Card need', card.includes('Cần mua đất nền Ngũ Hành Sơn'));
  ok('Card source', card.includes(`Facebook · ${FIXTURE.groupName}`));
  ok('Card confidence', card.includes('BUYER CONFIDENCE: 66%'));
  ok('Card warm', card.includes('🟡 WARM'));
  ok('Card no campaign', !/h2\.4\.4-unify-lead-alert/i.test(card));
  ok('Card no findingId token', !/findingId/i.test(card));
  const leaks = assertCardHasNoInternalLeakage(card);
  ok('Card leakage empty', leaks.length === 0);
}

// Call tel
{
  ok('tel uri', toTelUri(FIXTURE.phone) === 'tel:+84905111001');
  ok('tel strip pollution', stripInternalPollution(FIXTURE.pollutedNeed)?.includes('Cần mua') === true);
  const kb = salesActionCardKeyboard({
    findingId: 'finding-h245-accept',
    sourceUrl: FIXTURE.permalink,
    leadCenterUrl: 'https://bdsdanang.site/admin/agents/lead-center?findingId=finding-h245-accept',
    phone: FIXTURE.phone,
    hasPhone: true,
  });
  const flat = kb.inline_keyboard.flat();
  const call = flat.find(b => b.text.includes('Call'));
  ok(
    'Call is callback (Telegram rejects tel: URL buttons)',
    Boolean(call && 'callback_data' in call && call.callback_data?.startsWith('l:k:')),
  );
  ok('Call maps to /lead call', Boolean(call && 'callback_data' in call && callbackDataToCommand(call.callback_data!)?.startsWith('/lead call')));
  const src = flat.find(b => b.text.includes('Source'));
  ok('Source url exact', Boolean(src && 'url' in src && src.url === FIXTURE.permalink));
  const open = flat.find(b => b.text.includes('Open Lead'));
  ok('Open lead url', Boolean(open && 'url' in open && String(open.url).includes('finding-h245-accept')));
  const contact = flat.find(b => b.text.includes('Contact'));
  ok('Contact callback maps', Boolean(contact && 'callback_data' in contact && callbackDataToCommand(contact.callback_data!)?.startsWith('/lead contact')));
  const assign = flat.find(b => b.text.includes('Assign'));
  ok('Assign callback maps', Boolean(assign && 'callback_data' in assign && callbackDataToCommand(assign.callback_data!)?.startsWith('/lead assign')));
  const hist = flat.find(b => b.text.includes('History'));
  ok('History callback maps', Boolean(hist && 'callback_data' in hist && callbackDataToCommand(hist.callback_data!)?.startsWith('/lead history')));
  const ign = flat.find(b => b.text.includes('Ignore'));
  ok('Ignore callback maps', Boolean(ign && 'callback_data' in ign && callbackDataToCommand(ign.callback_data!)?.startsWith('/lead skip')));
}

// owner callback map
{
  const mapped = callbackDataToCommand('l:w:finding-h245-accept:user-abc');
  ok('Owner map', mapped === '/lead owner finding-h245-accept user-abc');
}

console.log(`\nPASS H2.4.5 lead alert contract (${n} checks)`);
