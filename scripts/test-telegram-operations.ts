/**
 * Telegram Operations Center tests.
 * Run: npx tsx scripts/test-telegram-operations.ts
 */
import assert from 'node:assert/strict';
import {
  createCommandEngine,
  formatCommandText,
} from '../server/modules/control-plane/command-engine';
import {
  callbackDataToCommand,
  missionActionKeyboard,
  routeTelegramUpdate,
  createTelegramEventNotifier,
  resetTelegramAclRateLimitForTests,
  _resetTelegramControlPlaneForTests,
} from '../server/modules/control-plane/telegram';
import type { TelegramConsoleConfig } from '../server/modules/control-plane/telegram';
import { opsGetDashboard } from '../server/modules/control-plane/operationsService';
import { consoleSystemUser } from '../server/modules/control-plane/command-engine/defaultCommands';

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

  // Dashboard
  const dash = await engine.execute('/dashboard', { client: 'telegram', user });
  assert.equal(dash.ok, true);
  assert.match(formatCommandText(dash), /Dashboard|Health/i);
  const opsDash = await opsGetDashboard(user);
  assert.ok(typeof opsDash.healthScore === 'number');
  console.log('PASS Dashboard');

  // Jobs
  for (const f of ['', 'running', 'pending', 'failed', 'completed']) {
    const r = await engine.execute(f ? `/jobs ${f}` : '/jobs', { client: 'telegram', user });
    assert.equal(r.ok, true, `jobs ${f || 'all'}`);
  }
  console.log('PASS Jobs');

  // Mission commands surface
  const missionUsage = await engine.execute('/mission', { client: 'telegram' });
  assert.equal(missionUsage.ok, false);
  assert.match(formatCommandText(missionUsage), /Usage/i);
  const pauseUsage = await engine.execute('/mission pause', { client: 'telegram' });
  assert.equal(pauseUsage.ok, false);
  console.log('PASS Mission');

  // Retry surface (Control Plane — no throw on missing id usage)
  const retryPub = await engine.execute('/retry publish', { client: 'telegram' });
  assert.equal(retryPub.ok, false);
  const retryCamp = await engine.execute('/retry campaign', { client: 'telegram' });
  assert.equal(retryCamp.ok, false);
  console.log('PASS Retry');

  // Inline keyboard
  const kb = missionActionKeyboard('mission_abc');
  assert.ok(kb.inline_keyboard.length >= 3);
  assert.equal(callbackDataToCommand('m:r:mission_abc'), '/mission retry mission_abc');
  assert.equal(callbackDataToCommand('m:c:mission_abc'), '/mission cancel mission_abc');
  assert.equal(callbackDataToCommand('p:r:job123'), '/publish retry job123');
  const replies: Array<{ text: string; markup?: unknown }> = [];
  const routed = await routeTelegramUpdate(
    {
      update_id: 9,
      callback_query: {
        id: 'cq1',
        data: 'm:f:mission_abc',
        from: { id: 42 },
        message: { chat: { id: 100 }, message_id: 1 },
      },
    },
    {
      config: cfg(),
      replyPort: {
        async reply(input) {
          replies.push({ text: input.text, markup: input.replyMarkup });
          return { ok: true };
        },
        async answerCallback() {},
      },
      runCommand: async raw => ({
        ok: true,
        command: 'mission',
        text: `handled ${raw}`,
        replyMarkup: missionActionKeyboard('mission_abc'),
      }),
    },
  );
  assert.equal(routed.handled, true);
  assert.equal(routed.ok, true);
  assert.match(replies[0]?.text || '', /handled \/mission mission_abc/);
  assert.ok(replies[0]?.markup);
  console.log('PASS Inline Keyboard');

  // Alerts rate limit
  let pushes = 0;
  const { setNotificationDeliverHookForTests, resetNotificationRouterForTests } = await import(
    '../server/notifications/notificationRouter'
  );
  process.env.TELEGRAM_OPS_CHAT_ID = '-5348392375';
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
        {
          id: '3',
          type: 'MISSION_FAILED',
          agentId: null,
          entityType: 'mission_run',
          entityId: 'mr1',
          payload: {},
          createdAt: ts,
        },
      ];
    },
  });
  const n1 = await notifier.tickOnce();
  assert.ok(n1 >= 1);
  assert.equal(pushes, 1);
  // Same keys within cooldown → no second push lines counted as new send if empty after filter
  const n2 = await notifier.tickOnce();
  assert.equal(n2, 0);
  notifier.stop();
  console.log('PASS Alerts');

  // Runtime / browser / agent / publish / report
  assert.equal((await engine.execute('/runtime', { client: 'telegram', user })).ok, true);
  assert.equal((await engine.execute('/browser', { client: 'telegram', user })).ok, true);
  assert.equal((await engine.execute('/publish queue', { client: 'telegram', user })).ok, true);
  assert.equal((await engine.execute('/report agents', { client: 'telegram', user })).ok, true);
  assert.equal((await engine.execute('/report browser', { client: 'telegram', user })).ok, true);
  console.log('PASS Runtime');

  console.log('\nTELEGRAM OPERATIONS TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
