/**
 * Telegram Control Plane tests (no live Bot API spam).
 * Run: npx tsx scripts/test-telegram-control-plane.ts
 */
import assert from 'node:assert/strict';
import {
  checkTelegramAcl,
  resetTelegramAclRateLimitForTests,
  normalizeTelegramUpdate,
  routeTelegramUpdate,
  createTelegramReplyPort,
  createTelegramEventNotifier,
  _resetTelegramControlPlaneForTests,
} from '../server/modules/control-plane/telegram';
import type { TelegramConsoleConfig } from '../server/modules/control-plane/telegram';
import {
  createCommandEngine,
  executeControlCommand,
  formatCommandText,
} from '../server/modules/control-plane/command-engine';
import { ControlPlane } from '../server/modules/control-plane';

function baseConfig(over: Partial<TelegramConsoleConfig> = {}): TelegramConsoleConfig {
  return {
    enabled: true,
    botToken: '123:ABC',
    primaryChatId: '100',
    allowedUserIds: ['42'],
    allowedChatIds: ['100'],
    adminUserIds: ['1'],
    mode: 'polling',
    webhookSecret: 'sec',
    companyId: null,
    pollIntervalMs: 2000,
    eventNotifyIntervalMs: 10_000,
    rateLimitPerMinute: 20,
    ...over,
  };
}

function makeUpdate(text: string, chatId = '100', userId = '42', updateId = 1) {
  return {
    update_id: updateId,
    message: {
      message_id: 9,
      text,
      chat: { id: Number(chatId) },
      from: { id: Number(userId), username: 'tester' },
    },
  };
}

async function main() {
  _resetTelegramControlPlaneForTests();
  resetTelegramAclRateLimitForTests();

  // ── Update normalize ─────────────────────────────────────
  const norm = normalizeTelegramUpdate(makeUpdate('/health@MyBot'));
  assert.ok(norm);
  assert.equal(norm!.text, '/health');
  assert.equal(norm!.isCommand, true);
  assert.equal(normalizeTelegramUpdate({ update_id: 1 }), null);
  console.log('PASS Telegram Update');

  // ── ACL ──────────────────────────────────────────────────
  resetTelegramAclRateLimitForTests();
  assert.equal(checkTelegramAcl(baseConfig(), { chatId: '100', userId: '42' }).ok, true);
  assert.equal(
    checkTelegramAcl(baseConfig(), { chatId: '999', userId: '42' }).reason,
    'chat_not_allowed',
  );
  assert.equal(
    checkTelegramAcl(baseConfig(), { chatId: '100', userId: '99' }).reason,
    'user_not_allowed',
  );
  assert.equal(
    checkTelegramAcl(baseConfig({ allowedUserIds: [], allowedChatIds: [] }), {
      chatId: '1',
      userId: '1',
    }).reason,
    'acl_not_configured',
  );
  const limited = baseConfig({ rateLimitPerMinute: 1 });
  resetTelegramAclRateLimitForTests();
  assert.equal(checkTelegramAcl(limited, { chatId: '100', userId: '42' }).ok, true);
  assert.equal(
    checkTelegramAcl(limited, { chatId: '100', userId: '42' }).reason,
    'rate_limited',
  );
  console.log('PASS ACL');

  // ── Command Engine (shared) ──────────────────────────────
  const engine = createCommandEngine();
  const help = await engine.execute('/help', { client: 'telegram' });
  assert.equal(help.ok, true);
  const health = await executeControlCommand('/health', { client: 'telegram' });
  assert.ok(typeof formatCommandText(health) === 'string');
  const runtime = await executeControlCommand('/runtime', { client: 'telegram' });
  assert.equal(runtime.ok, true);
  const agents = await executeControlCommand('/agents', { client: 'telegram' });
  assert.equal(agents.ok, true);
  const missions = await executeControlCommand('/missions', { client: 'telegram' });
  assert.equal(missions.ok, true);
  const report = await executeControlCommand('/report today', { client: 'telegram' });
  assert.equal(report.ok, true);
  console.log('PASS Command');

  // ── Reply path (mocked port) ─────────────────────────────
  const replies: string[] = [];
  const replyPort = {
    async reply(input: { text: string }) {
      replies.push(input.text);
      return { ok: true, messageId: '1' };
    },
  };
  // Ensure createTelegramReplyPort shape exists
  assert.equal(typeof createTelegramReplyPort().reply, 'function');

  const routed = await routeTelegramUpdate(makeUpdate('/help'), {
    config: baseConfig(),
    replyPort: replyPort as ReturnType<typeof createTelegramReplyPort>,
    runCommand: async () => ({ ok: true, command: 'help', text: 'Control Plane Console\n/help' }),
  });
  assert.equal(routed.handled, true);
  assert.equal(routed.ok, true);
  assert.match(replies[0] || '', /Control Plane|help/i);

  const denied = await routeTelegramUpdate(makeUpdate('/health', '100', '99'), {
    config: baseConfig(),
    replyPort: replyPort as ReturnType<typeof createTelegramReplyPort>,
    runCommand: async () => ({ ok: true, command: 'health', text: 'should-not-run' }),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'user_not_allowed');
  console.log('PASS Reply');

  // ── Mission commands exist (pause/resume/cancel/retry) ───
  const pauseUsage = await executeControlCommand('/pause', { client: 'telegram' });
  assert.equal(pauseUsage.ok, false);
  assert.match(formatCommandText(pauseUsage), /Usage/i);
  const resumeUsage = await executeControlCommand('/resume', { client: 'telegram' });
  assert.equal(resumeUsage.ok, false);
  console.log('PASS Mission');

  // ── Runtime via Control Plane façade ─────────────────────
  const desc = ControlPlane.describe();
  assert.equal(desc.layers.commandEngine, true);
  assert.ok(String(desc.console?.telegramFlow || '').includes('Telegram'));
  console.log('PASS Runtime');

  // ── Agent surface (no browser control in telegram module) ─
  assert.ok(desc.nonGoals.includes('new scheduler'));
  assert.ok(desc.executionAgent?.transport?.includes('/api/agent/runtime'));
  console.log('PASS Agent');

  // ── Publish queue command ────────────────────────────────
  const queue = await executeControlCommand('/publish queue', { client: 'telegram' });
  assert.equal(queue.ok, true);
  assert.match(formatCommandText(queue), /Publish queue/i);
  console.log('PASS Publish Queue');

  // ── Local Scheduler (documented reclaim — smoke describe) ─
  assert.ok(desc.reuses.includes('Execution Agent') || desc.executionAgent);
  console.log('PASS Local Scheduler');

  // ── Event notifier formats without sending ───────────────
  let pushed = 0;
  const notifier = createTelegramEventNotifier({
    config: baseConfig(),
    replyPort: {
      async reply() {
        pushed += 1;
        return { ok: true };
      },
    },
    listEvents: async () => [
      {
        id: 'e1',
        type: 'MISSION_STARTED',
        agentId: null,
        entityType: 'mission_run',
        entityId: 'mr_1',
        payload: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'e2',
        type: 'AGENT_OFFLINE',
        agentId: 'agent-1',
        entityType: 'agent',
        entityId: 'agent-1',
        payload: {},
        createdAt: new Date().toISOString(),
      },
    ],
  });
  const n = await notifier.tickOnce();
  assert.ok(n >= 1);
  assert.equal(pushed, 1);
  notifier.stop();
  console.log('PASS Event Notify');

  console.log('\nTELEGRAM CONTROL PLANE TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
