#!/usr/bin/env node
/**
 * H0.3.6 — Notification Router tests (no live Telegram).
 * Run: npx tsx scripts/test-notification-router.ts
 */
import assert from 'node:assert/strict';
import {
  notification,
  resetNotificationRouterForTests,
  setNotificationDeliverHookForTests,
  loadChannelChatIds,
  resolveChannelForEvent,
} from '../server/notifications/notificationRouter';
import {
  formatBatchedLeadSummary,
  formatRoutedNotification,
  formatLeadTelegramAlert,
} from '../server/notifications/telegramFormatter';
import { runtimeEventToNotificationType } from '../server/notifications/notificationTypes';

process.env.TELEGRAM_OPS_CHAT_ID = '-5348392375';
process.env.TELEGRAM_LEAD_CHAT_ID = '-5592400378';
process.env.TELEGRAM_PUBLISH_CHAT_ID = '-5261113042';
process.env.TELEGRAM_REPORT_CHAT_ID = '-5446190511';
process.env.TELEGRAM_CRITICAL_CHAT_ID = '-5132560624';

let delivered = 0;
const deliveredTexts: string[] = [];

function setupMock() {
  resetNotificationRouterForTests();
  delivered = 0;
  deliveredTexts.length = 0;
  setNotificationDeliverHookForTests(async () => {
    delivered += 1;
    return { ok: true, messageId: String(delivered) };
  });
}

async function main() {
  setupMock();

  // Routing
  assert.equal(resolveChannelForEvent('lead_found'), 'LEAD');
  assert.equal(resolveChannelForEvent('publish_success'), 'PUBLISH');
  assert.equal(resolveChannelForEvent('daily_08'), 'REPORT');
  assert.equal(resolveChannelForEvent('browser_crash'), 'CRITICAL');
  assert.equal(resolveChannelForEvent('mission_started'), 'OPS');
  const chats = loadChannelChatIds();
  assert.equal(chats.LEAD, '-5592400378');
  assert.equal(chats.PUBLISH, '-5261113042');
  console.log('PASS Routing');

  // Lead — must use canonical card text (H2.4.6 fail-closed)
  setupMock();
  const lead = formatLeadTelegramAlert(
    { id: 'f1', finalScore: 88, classification: 'buyer', needSummary: 'Cần đất' },
    null,
    { includePhone: false, includeLink: false },
  );
  assert.match(lead.text, /🎯 LEAD ALERT/);
  assert.match(lead.text, /BUYER CONFIDENCE: 88%/);
  assert.match(lead.text, /Người mua/);
  assert.doesNotMatch(lead.text, /Lead Alerts|Lead mới \(\d+\/100\)|Expected Deal|AI Suggestion|Score:/);
  await notification.send({
    type: 'lead_found',
    payload: { findingId: 'f1', score: 88, summary: lead.text },
    text: lead.text,
    immediate: true,
  });
  assert.equal(delivered, 1);

  // Legacy / incomplete LEAD payload must NOT send
  setupMock();
  const blocked = await notification.send({
    type: 'lead_found',
    payload: { findingId: 'f-legacy', score: 100, summary: 'Buyer 40%' },
    immediate: true,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.skipped, true);
  assert.equal(blocked.reason, 'missing_canonical_lead_card');
  assert.equal(delivered, 0);
  console.log('PASS Lead');

  // Publish
  setupMock();
  await notification.send({
    type: 'publish_failed',
    payload: {
      publishJobId: 'pj1',
      summary: 'browser_publish_button_not_found',
      recommendation: 'Retry sau khi sửa DOM',
    },
    immediate: true,
  });
  assert.equal(delivered, 1);
  assert.match(
    formatRoutedNotification('PUBLISH', 'publish_failed', {
      publishJobId: 'pj1',
      summary: 'fail',
    }),
    /📢 Publishing/,
  );
  console.log('PASS Publish');

  // Ops
  setupMock();
  await notification.send({
    type: 'agent_online',
    payload: { agentId: 'worker-1', detail: 'registered' },
    immediate: true,
  });
  assert.equal(delivered, 1);
  console.log('PASS Ops');

  // Critical
  setupMock();
  await notification.send({
    type: 'execution_agent_offline',
    payload: { agentId: 'worker-1', summary: 'heartbeat lost' },
    immediate: true,
  });
  assert.equal(delivered, 1);
  console.log('PASS Critical');

  // Reports
  setupMock();
  await notification.send({
    type: 'daily_08',
    payload: { summary: 'Tổng quan sáng: 3 mission, 1 publish' },
    immediate: true,
    skipDedup: true,
  });
  assert.equal(delivered, 1);
  console.log('PASS Reports');

  // Dedup 60s
  setupMock();
  await notification.send({
    type: 'publish_success',
    payload: { publishJobId: 'pj-dedup' },
    dedupeKey: 'pj-dedup',
    immediate: true,
  });
  const dup = await notification.send({
    type: 'publish_success',
    payload: { publishJobId: 'pj-dedup' },
    dedupeKey: 'pj-dedup',
    immediate: true,
  });
  assert.equal(delivered, 1);
  assert.equal(dup.skipped, true);
  assert.equal(dup.reason, 'dedup_60s');
  console.log('PASS Dedup');

  // Rate limit (simulate 31 sends)
  setupMock();
  for (let i = 0; i < 31; i += 1) {
    await notification.send({
      type: 'health',
      payload: { entityId: `h${i}` },
      dedupeKey: `health:${i}`,
      immediate: true,
    });
  }
  assert.ok(delivered <= 30);
  console.log('PASS Rate Limit');

  // Batch digest (multi) — separate from single NEW_LEAD
  setupMock();
  const batchText = formatBatchedLeadSummary([
    { id: 'f1', score: 80, summary: 'A' },
    { id: 'f2', score: 75, summary: 'B' },
  ]);
  assert.match(batchText, /Lead Digest/);
  assert.match(batchText, /2 Lead mới/);
  assert.doesNotMatch(batchText, /Lead Alerts|Expected Deal|AI Suggestion/);
  // Single lead without canonical card → blocked
  const bare = await notification.send({
    type: 'lead_found',
    payload: { findingId: 'f1' },
    immediate: true,
  });
  assert.equal(bare.skipped, true);
  assert.equal(delivered, 0);
  console.log('PASS Batch');

  // Runtime event mapping
  assert.equal(
    runtimeEventToNotificationType({ type: 'JOB_COMPLETED', payload: { jobType: 'publish_social' } }),
    'publish_success',
  );
  assert.equal(
    runtimeEventToNotificationType({ type: 'AGENT_OFFLINE', payload: {} }),
    'execution_agent_offline',
  );
  console.log('PASS Runtime map');

  console.log('\nVERDICT: TELEGRAM NOTIFICATION ROUTER COMPLETE');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
