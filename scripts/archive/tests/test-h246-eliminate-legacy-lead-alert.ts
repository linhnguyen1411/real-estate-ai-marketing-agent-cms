/**
 * H2.4.6 — Eliminate legacy Telegram NEW_LEAD format.
 * Run: npx tsx scripts/test-h246-eliminate-legacy-lead-alert.ts
 */
import assert from 'node:assert/strict';
import {
  formatBatchedLeadSummary,
  formatLeadTelegramAlert,
  formatRoutedNotification,
} from '../server/notifications/telegramFormatter';
import {
  CANONICAL_LEAD_ALERT_MARKER,
  CHANNEL_LABELS,
  LEGACY_LEAD_ALERT_MARKERS,
} from '../server/notifications/notificationTypes';
import {
  isCanonicalLeadAlertText,
  notification,
  resetNotificationRouterForTests,
  setNotificationDeliverHookForTests,
} from '../server/notifications/notificationRouter';
import { formatSalesActionCard, formatSalesBuyerCard } from '../server/modules/sales-layer';

process.env.TELEGRAM_LEAD_CHAT_ID = process.env.TELEGRAM_LEAD_CHAT_ID || '-5592400378';

let delivered = 0;
const texts: string[] = [];

function setup() {
  resetNotificationRouterForTests();
  delivered = 0;
  texts.length = 0;
  setNotificationDeliverHookForTests(async input => {
    delivered += 1;
    texts.push(input.text);
    return { ok: true, messageId: String(delivered) };
  });
}

let n = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  n += 1;
  console.log(`✓ ${name}`);
}

async function main() {
  ok('CHANNEL_LABELS.LEAD not Lead Alerts', CHANNEL_LABELS.LEAD !== '🎯 Lead Alerts');
  ok('CHANNEL_LABELS.LEAD not used as card', !CHANNEL_LABELS.LEAD.includes('Lead Alerts'));

  {
    const empty = formatRoutedNotification('LEAD', 'lead_found', {
      findingId: 'x',
      score: 100,
      summary: 'Buyer 40%',
    });
    ok('routed empty without canonical', empty === '');

    const withScore = formatRoutedNotification('LEAD', 'lead_found', {
      findingId: 'x',
      score: 100,
    });
    ok('routed no Score fallback', !withScore.includes('Score:'));
    ok('routed no Lead Alerts header', !withScore.includes('Lead Alerts'));
  }

  {
    const card = formatSalesActionCard({
      findingId: 'f',
      role: 'buyer',
      confidencePct: 65,
      location: 'Ngũ Hành Sơn',
      propertyType: 'đất nền',
      budgetMin: 5,
      budgetMax: 5,
      timeline: 'buying_today',
      phone: '0905111001',
      needSummary: 'Cần mua đất nền Ngũ Hành Sơn',
      sourceLabel: 'Facebook · HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG',
    });
    ok('canonical marker', card.includes(CANONICAL_LEAD_ALERT_MARKER));
    ok('isCanonical', isCanonicalLeadAlertText(card));
    for (const m of LEGACY_LEAD_ALERT_MARKERS) {
      ok(`no legacy ${m}`, !card.includes(m));
    }
    const routed = formatRoutedNotification('LEAD', 'lead_found', {
      findingId: 'f',
      summary: card,
      score: 65,
    });
    ok('routed returns card only', routed === card);
    ok('routed no Score append', !routed.includes('Score:'));
  }

  {
    const legacy = formatLeadTelegramAlert(
      { id: 'l1', finalScore: 70, classification: 'buyer', needSummary: 'Cần mua' },
      null,
    );
    ok('legacy adapter canonical', isCanonicalLeadAlertText(legacy.text));
    ok('legacy adapter no Lead Alerts', !legacy.text.includes('Lead Alerts'));

    const buyerCard = formatSalesBuyerCard({
      profile: {
        version: 'h35_v1',
        findingId: 'l1',
        buyerKey: 'b',
        canonicalFindingId: 'l1',
        mergedFindingIds: ['l1'],
        journeyStage: 'contacted',
        pipelineStage: 'contacted',
        signals: [],
        timeline: [],
        stageHistory: [],
        owner: null,
        expectedCloseAt: null,
        probability: 0.4,
        expectedDealTy: 4.2,
        recommendation: {
          code: 'monitor',
          label: 'Monitor',
          reason: 'x',
          urgency: 'low',
        },
        followUp: { needsFollowUp: false, coolingHours: 0, reason: null, suggestion: null },
        updatedAt: new Date().toISOString(),
      },
      confidencePct: 40,
      campaignName: 'h2.4.4-unify-lead-alert buyer',
      title: 'Nhà đầu tư tại FPT City',
    });
    ok('formatSalesBuyerCard canonical', isCanonicalLeadAlertText(buyerCard));
    ok('no Expected Deal', !buyerCard.includes('Expected Deal'));
    ok('no AI Suggestion', !buyerCard.includes('AI Suggestion'));
    ok('no Journey label', !buyerCard.includes('\nJourney\n'));
    ok('no Campaign label', !buyerCard.includes('\nCampaign\n'));
  }

  {
    setup();
    const blocked = await notification.send({
      type: 'lead_found',
      payload: { findingId: 'bad', score: 100, summary: 'Score: 100/100' },
      immediate: true,
    });
    ok('router blocks Score card', blocked.skipped === true && delivered === 0);

    const card = formatSalesActionCard({
      findingId: 'good',
      role: 'tenant',
      confidencePct: 76,
      location: 'Liên Chiểu',
      phone: '0903522712',
    });
    const sent = await notification.send({
      type: 'lead_found',
      payload: { findingId: 'good', summary: card },
      text: card,
      immediate: true,
    });
    ok('router sends canonical', sent.ok === true && delivered === 1);
    ok('delivered text canonical', isCanonicalLeadAlertText(texts[0]));
  }

  {
    const digest = formatBatchedLeadSummary([
      { id: 'a', score: 80 },
      { id: 'b', score: 70 },
    ]);
    ok('digest header', digest.includes('Lead Digest'));
    ok('digest not Lead Alerts', !digest.includes('Lead Alerts'));
    ok('digest not Sales Action Card', !digest.includes(CANONICAL_LEAD_ALERT_MARKER));
  }

  console.log(`\nPASS H2.4.6 eliminate legacy (${n} checks)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
