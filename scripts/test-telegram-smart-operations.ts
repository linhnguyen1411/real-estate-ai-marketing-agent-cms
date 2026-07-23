/**
 * Telegram Smart Operations + Link Normalization tests.
 * Run: npx tsx scripts/test-telegram-smart-operations.ts
 */
import assert from 'node:assert/strict';
import {
  createCommandEngine,
  formatCommandText,
} from '../server/modules/control-plane/command-engine';
import {
  agentJobKeyboard,
  callbackDataToCommand,
  leadAlertKeyboard,
  createTelegramEventNotifier,
  formatSmartNotification,
  mapRuntimeEventToSmartKind,
  SMART_NOTIFICATION_KINDS,
  resetTelegramAclRateLimitForTests,
  _resetTelegramControlPlaneForTests,
} from '../server/modules/control-plane/telegram';
import type { TelegramConsoleConfig } from '../server/modules/control-plane/telegram';
import { consoleSystemUser } from '../server/modules/control-plane/command-engine/defaultCommands';
import {
  normalizeSocialLinks,
  verifySocialLinks,
  isEphemeralUrl,
  toMobileFriendlyFacebookUrl,
  isMobileFriendlyUrl,
} from '../server/modules/link-normalization';
import { formatLeadTelegramAlert } from '../server/notifications/telegramFormatter';
import { enrichPublishEvidenceLinks } from '../server/modules/social-publishing/runtime/publishEvidenceService';

function cfg(): TelegramConsoleConfig {
  return {
    enabled: true,
    botToken: '1:tok',
    primaryChatId: '100',
    allowedUserIds: ['42'],
    allowedChatIds: ['100'],
    adminUserIds: ['1'],
    mode: 'polling',
    webhookSecret: '',
    companyId: null,
    pollIntervalMs: 2000,
    eventNotifyIntervalMs: 10_000,
    rateLimitPerMinute: 30,
  };
}

async function main() {
  _resetTelegramControlPlaneForTests();
  resetTelegramAclRateLimitForTests();
  const engine = createCommandEngine();
  const user = consoleSystemUser(null, 'telegram');

  // --- Notification catalog ---
  assert.ok(SMART_NOTIFICATION_KINDS.includes('LEAD_FOUND'));
  assert.ok(SMART_NOTIFICATION_KINDS.includes('PUBLISH_SUCCESS'));
  assert.ok(SMART_NOTIFICATION_KINDS.includes('QUEUE_BLOCKED'));
  assert.equal(
    mapRuntimeEventToSmartKind({
      type: 'MISSION_FAILED',
      payload: {},
    }),
    'MISSION_FAILED',
  );
  assert.equal(
    mapRuntimeEventToSmartKind({
      type: 'JOB_COMPLETED',
      payload: { jobType: 'publish_social' },
    }),
    'PUBLISH_SUCCESS',
  );
  assert.equal(
    mapRuntimeEventToSmartKind({
      type: 'JOB_FAILED',
      payload: { queueBlocked: true },
    }),
    'QUEUE_BLOCKED',
  );
  assert.equal(
    mapRuntimeEventToSmartKind({
      type: 'BROWSER_LEASED',
      payload: { crashed: true, error: 'crash' },
    }),
    'BROWSER_CRASH',
  );
  assert.match(formatSmartNotification('AGENT_OFFLINE', { agentId: 'a1' }), /Agent Offline/);
  console.log('PASS Notification');

  // --- Lead Alert ---
  const alert = formatLeadTelegramAlert(
    {
      id: 'f1',
      finalScore: 75,
      classification: 'buyer',
      primaryLocation: 'Hòa Xuân',
      propertyType: 'nhà phố',
      needSummary: 'Cần mua nhà phố',
    },
    {
      findingId: 'f1',
      finalScore: 75,
      classification: 'buyer',
      primaryPhone: null,
      property: { propertyTypes: ['nhà phố'] },
      location: { primary: 'Hòa Xuân', district: null, city: null },
      demand: { needSummary: 'Cần mua nhà phố', buyerBudgetMin: null, buyerBudgetMax: null },
      source: {
        groupName: 'MUA BÁN BDS ĐÀ NẴNG',
        sourceName: 'MUA BÁN BDS ĐÀ NẴNG',
        canonicalUrl:
          'https://www.facebook.com/groups/123456789/posts/987654321/?fbclid=abc',
      },
    } as never,
    { includePhone: false, includeBudget: false, includeLink: false },
  );
  assert.match(alert.text, /Lead mới \(75\/100\)/);
  assert.match(alert.text, /👤 Người mua/);
  assert.match(alert.text, /📍 Hòa Xuân/);
  assert.match(alert.text, /🏷 Nhà phố/);
  assert.match(alert.text, /📂 Group:/);
  assert.match(alert.text, /MUA BÁN BDS ĐÀ NẴNG/);
  assert.ok(alert.postUrl || alert.canonicalUrl);
  console.log('PASS Lead Alert');

  // --- Inline Keyboard ---
  const leadKb = leadAlertKeyboard({
    findingId: 'f1',
    postUrl: 'https://www.facebook.com/groups/1/posts/2',
    groupUrl: 'https://www.facebook.com/groups/1',
  });
  const flat = leadKb.inline_keyboard.flat();
  assert.ok(flat.some(b => 'url' in b && b.text === 'Mở bài viết'));
  assert.ok(flat.some(b => 'url' in b && b.text === 'Mở Group'));
  assert.ok(flat.some(b => 'callback_data' in b && b.text === 'Retry'));
  assert.ok(flat.some(b => 'callback_data' in b && b.text === 'Bỏ qua'));
  assert.ok(flat.some(b => 'callback_data' in b && b.text === 'Tạo Mission'));
  assert.equal(callbackDataToCommand('l:s:f1'), '/lead skip f1');
  assert.equal(callbackDataToCommand('l:m:f1'), '/lead mission f1');
  const jobKb = agentJobKeyboard('job1');
  assert.ok(jobKb.inline_keyboard.flat().some(b => b.text === 'Pause'));
  assert.ok(jobKb.inline_keyboard.flat().some(b => b.text === 'Resume'));
  assert.equal(callbackDataToCommand('j:p:job1'), '/mission pause job1');
  console.log('PASS Inline Keyboard');

  // --- Link Normalization + Verification ---
  assert.equal(isEphemeralUrl('about:blank'), true);
  assert.equal(isEphemeralUrl('blob:https://x'), true);
  const norm = normalizeSocialLinks({
    postUrl:
      'https://lm.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Fgroups%2F111%2Fposts%2F222%2F%3Ffbclid%3Dxx',
  });
  assert.ok(norm.postUrl);
  assert.ok(!norm.postUrl.includes('fbclid'));
  assert.ok(!norm.postUrl.includes('lm.facebook.com'));
  assert.equal(norm.groupId, '111');
  assert.equal(norm.postId, '222');
  assert.ok(isMobileFriendlyUrl(norm.postUrl));

  const verifiedOk = await verifySocialLinks(norm, {
    fetchImpl: async url => ({ ok: true, status: 200, url }),
  });
  assert.equal(verifiedOk.verified, true);
  assert.ok(verifiedOk.openUrl);

  const verifiedFail = await verifySocialLinks(
    normalizeSocialLinks({
      postUrl: 'https://www.facebook.com/groups/1/posts/2',
      groupUrl: 'https://www.facebook.com/groups/1',
    }),
    {
      fetchImpl: async () => ({ ok: false, status: 404, url: '' }),
    },
  );
  assert.equal(verifiedFail.verified, false);
  assert.equal(verifiedFail.openUrl, null);

  // Fallback: post fails, group ok
  const fallback = await verifySocialLinks(
    normalizeSocialLinks({
      postUrl: 'https://www.facebook.com/groups/1/posts/missing',
      groupUrl: 'https://www.facebook.com/groups/1',
    }),
    {
      fetchImpl: async url => {
        if (url.includes('missing')) return { ok: false, status: 404, url };
        return { ok: true, status: 200, url };
      },
    },
  );
  assert.equal(fallback.verified, true);
  assert.ok(fallback.openUrl?.includes('/groups/1'));
  assert.ok(toMobileFriendlyFacebookUrl('https://m.facebook.com/groups/9'));
  console.log('PASS Link Verification');
  console.log('PASS Mobile Link');

  // --- Report ---
  for (const scope of ['today', 'publish', 'scan', 'failed', 'agent', 'browser']) {
    const r = await engine.execute(`/report ${scope}`, { client: 'telegram', user });
    assert.equal(r.ok, true, `report ${scope}`);
  }
  assert.match(formatCommandText(await engine.execute('/report failed', { client: 'telegram', user })), /failed/i);
  console.log('PASS Report');

  // --- Mission surface still ok ---
  const missionUsage = await engine.execute('/mission', { client: 'telegram' });
  assert.equal(missionUsage.ok, false);
  assert.match(formatCommandText(missionUsage), /Usage/i);
  const leadUsage = await engine.execute('/lead', { client: 'telegram' });
  assert.equal(leadUsage.ok, false);
  console.log('PASS Mission');

  // --- Publishing evidence metadata ---
  const evidence = enrichPublishEvidenceLinks({
    publishJobId: 'pj1',
    missionRunId: 'mr1',
    durationMs: 10,
    publishedUrl: 'https://www.facebook.com/groups/55/posts/66/?utm_source=x',
    capturedAt: new Date().toISOString(),
  });
  assert.equal(evidence.postId, '66');
  assert.equal(evidence.groupId, '55');
  assert.ok(evidence.postUrl);
  assert.ok(evidence.canonicalUrl);
  assert.equal(evidence.mobileVerified, true);
  console.log('PASS Publishing');

  // --- Alerts still rate-limited ---
  let pushes = 0;
  const { setNotificationDeliverHookForTests, resetNotificationRouterForTests } = await import(
    '../server/notifications/notificationRouter'
  );
  process.env.TELEGRAM_OPS_CHAT_ID = '-5348392375';
  process.env.TELEGRAM_CRITICAL_CHAT_ID = '-5132560624';
  resetNotificationRouterForTests();
  setNotificationDeliverHookForTests(async () => {
    pushes += 1;
    return { ok: true };
  });
  const notifier = createTelegramEventNotifier({
    config: cfg(),
    alertCooldownMs: 60_000,
    listEvents: async () => {
      const ts = new Date().toISOString();
      return [
        {
          id: '1',
          type: 'AGENT_OFFLINE',
          agentId: 'a1',
          entityType: 'agent',
          entityId: 'a1',
          payload: {},
          createdAt: ts,
        },
        {
          id: '2',
          type: 'AGENT_OFFLINE',
          agentId: 'a1',
          entityType: 'agent',
          entityId: 'a1',
          payload: {},
          createdAt: ts,
        },
      ];
    },
  });
  assert.ok((await notifier.tickOnce()) >= 1);
  assert.equal(pushes, 1);
  assert.equal(await notifier.tickOnce(), 0);
  notifier.stop();

  console.log('\nTELEGRAM SMART OPERATIONS TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
