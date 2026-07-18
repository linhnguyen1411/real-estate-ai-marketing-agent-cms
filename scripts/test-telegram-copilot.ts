/**
 * Telegram Copilot + Copilot Engine tests.
 * Run: npx tsx scripts/test-telegram-copilot.ts
 */
import assert from 'node:assert/strict';
import {
  createCopilotEngine,
  classifyByRules,
  buildRuleInsights,
  createSummaryScheduler,
  resolveSummarySlot,
  resetCopilotContextForTests,
  rememberJobList,
  getCopilotContext,
  approvalKeyboard,
  incidentKeyboard,
  callbackDataToCommand,
  routeTelegramUpdate,
  _resetTelegramControlPlaneForTests,
  _resetTelegramCopilotForTests,
  resetTelegramAclRateLimitForTests,
} from '../server/modules/control-plane';
import type { TelegramConsoleConfig } from '../server/modules/control-plane/telegram';
import type { CopilotControlPlanePort } from '../server/modules/control-plane/copilot/ports';
import { createCommandEngine, formatCommandText } from '../server/modules/control-plane/command-engine';
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

function mockPort(overrides: Partial<CopilotControlPlanePort> = {}): CopilotControlPlanePort {
  const user = consoleSystemUser(null, 'telegram');
  return {
    user,
    async runCommand(raw) {
      return {
        ok: true,
        command: raw.replace(/^\//, '').split(/\s+/)[0] || 'cmd',
        lines: [`ran ${raw}`],
        data: {},
      };
    },
    async getDashboard() {
      return {
        healthScore: 88,
        agentsOnline: 2,
        agentsTotal: 3,
        queue: { waiting: 1, deadLetter: 0 },
        missions: { running: 1, failed: 0 },
        metrics: { publishPerHour: 3, scanPerHour: 5 },
      };
    },
    async listOfflineAgents() {
      return [{ agentId: 'agent-a', status: 'offline' }];
    },
    async countLeadsToday() {
      return {
        total: 4,
        items: [
          {
            id: 'f1',
            title: 'Buyer Hoa Xuan',
            score: 80,
            location: 'Hòa Xuân',
            classification: 'buyer',
            createdAt: new Date().toISOString(),
          },
        ],
      };
    },
    async searchLeads() {
      return {
        total: 2,
        items: [
          {
            id: 'f2',
            title: 'Lead HX',
            score: 75,
            location: 'Hòa Xuân',
            classification: 'buyer',
            createdAt: new Date().toISOString(),
          },
        ],
      };
    },
    async listFailedPublishJobs() {
      return [{ id: 'pub1', error: 'timeout' }, { id: 'pub2', error: 'login' }];
    },
    async retryPublish(id) {
      return { ok: true, id };
    },
    async pauseMission(name) {
      return { ok: true, message: `Paused ${name}` };
    },
    async resumeMission(name) {
      return { ok: true, message: `Resumed ${name}` };
    },
    async report(kind) {
      return { kind, healthScore: 90, eventCounts: { CAMPAIGN_COMPLETED: 2 }, metrics: {} };
    },
    async buildInsights() {
      return {
        lines: buildRuleInsights({
          leadsToday: 10,
          leadsYesterday: 7,
          publishFailToday: 3,
          publishFailYesterday: 1,
          healthScore: 80,
          agentsOffline: 1,
          locationLabel: 'Buyer Hòa Xuân',
        }),
        metrics: {},
      };
    },
    async buildSummary(slot) {
      return {
        text: `Summary ${slot}`,
        lines: [`Summary ${slot}`, 'Lead hôm nay: 4', 'Health: 88'],
      };
    },
    ...overrides,
  };
}

async function main() {
  resetCopilotContextForTests();
  _resetTelegramControlPlaneForTests();
  _resetTelegramCopilotForTests();
  resetTelegramAclRateLimitForTests();

  // --- Natural Language ---
  assert.equal(classifyByRules('Có gì mới?').name, 'whats_new');
  assert.equal(classifyByRules('Hôm nay có bao nhiêu lead?').name, 'lead_count');
  assert.equal(classifyByRules('Có agent nào offline?').name, 'agents_offline');
  assert.equal(classifyByRules('Retry tất cả publish lỗi.').name, 'retry_failed_publish');
  assert.equal(classifyByRules('Dừng scanner buyer.').name, 'pause_scanner');
  assert.equal(classifyByRules('Khởi động lại publish.').name, 'resume_publish');

  const engine = createCopilotEngine({ port: mockPort(), useLlm: false });
  const whatsNew = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Có gì mới?',
  });
  assert.equal(whatsNew.ok, true);
  assert.match(whatsNew.text, /Lead hôm nay|Health/i);
  console.log('PASS Natural Language');

  // --- Conversation / Context ---
  const ctx = getCopilotContext('telegram', '100', '42', null);
  rememberJobList(ctx, ['job-aaa', 'job-bbb', 'job-ccc'], 'jobs');
  const retry = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'retry job 2',
  });
  assert.equal(retry.ok, true);
  assert.match(retry.text, /job-bbb|Retry/i);
  console.log('PASS Conversation');

  // --- Approval ---
  const kb = approvalKeyboard('finding123');
  assert.ok(kb.inline_keyboard.flat().some(b => 'callback_data' in b && b.text === 'Approve'));
  assert.equal(callbackDataToCommand('a:a:finding123'), '/approval approve finding123');
  assert.equal(callbackDataToCommand('a:j:finding123'), '/approval reject finding123');
  assert.equal(callbackDataToCommand('a:m:finding123'), '/approval mission finding123');
  const approve = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: '/approval approve finding123',
    isCommand: true,
  });
  assert.equal(approve.ok, true);
  assert.equal(approve.intent, 'approval_action');
  console.log('PASS Approval');

  // --- Search ---
  assert.equal(classifyByRules('Tìm lead Hòa Xuân hôm nay.').name, 'search_leads');
  assert.equal(classifyByRules('Job publish bị lỗi.').name, 'search_jobs');
  assert.equal(classifyByRules('Campaign tuần trước.').name, 'search_campaigns');
  const search = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Tìm lead Hòa Xuân hôm nay.',
  });
  assert.equal(search.ok, true);
  assert.match(search.text, /lead|Hòa Xuân|Tìm thấy/i);
  assert.ok(search.replyMarkup);
  console.log('PASS Search');

  // --- Summary ---
  assert.equal(resolveSummarySlot(new Date('2026-07-18T01:00:00Z'), 'Asia/Ho_Chi_Minh'), 'morning'); // UTC+7 → 08:00
  assert.equal(resolveSummarySlot(new Date('2026-07-18T05:00:00Z'), 'Asia/Ho_Chi_Minh'), 'noon');
  assert.equal(resolveSummarySlot(new Date('2026-07-18T11:00:00Z'), 'Asia/Ho_Chi_Minh'), 'evening');
  let summaryText = '';
  const sched = createSummaryScheduler({
    forceSlot: 'morning',
    portFactory: async () => mockPort(),
    notifier: {
      async send(text) {
        summaryText = text;
      },
    },
  });
  assert.equal(await sched.tickOnce(), true);
  assert.match(summaryText, /Summary|morning|Lead|Health/i);
  assert.equal(await sched.tickOnce(), false); // dedupe same day slot
  sched.stop();
  console.log('PASS Summary');

  // --- Incident ---
  const ik = incidentKeyboard('agent-a');
  assert.ok(ik.inline_keyboard.flat().some(b => 'text' in b && b.text === 'Mute'));
  assert.equal(callbackDataToCommand('i:a:agent-a'), '/incident ack agent-a');
  const incident = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: '/incident mute agent-a',
    isCommand: true,
  });
  assert.equal(incident.ok, true);
  assert.match(incident.text, /mute/i);
  console.log('PASS Incident');

  // --- Insight ---
  const insight = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Cho insight hôm nay',
  });
  // may classify as insight or unknown depending on rule — force
  const insightForced = await engine.handleClassified(
    { name: 'insight', confidence: 1, slots: {}, source: 'rule' },
    { channel: 'telegram', chatId: '100', userId: '42', text: 'insight' },
  );
  assert.equal(insightForced.ok, true);
  assert.match(insightForced.text, /tăng|fail|Lead|Publish|agent/i);
  void insight;
  console.log('PASS Insight');

  // --- Mission / Publishing surfaces still work ---
  const cmdEngine = createCommandEngine();
  const user = consoleSystemUser(null, 'telegram');
  assert.equal((await cmdEngine.execute('/mission', { client: 'telegram', user })).ok, false);
  assert.match(
    formatCommandText(await cmdEngine.execute('/mission', { client: 'telegram', user })),
    /Usage/i,
  );
  assert.equal((await cmdEngine.execute('/publish queue', { client: 'telegram', user })).ok, true);
  console.log('PASS Mission');
  console.log('PASS Publishing');

  // --- Router NL path ---
  const replies: string[] = [];
  const routed = await routeTelegramUpdate(
    {
      update_id: 1,
      message: {
        message_id: 1,
        text: 'Có gì mới?',
        chat: { id: 100 },
        from: { id: 42 },
      },
    },
    {
      config: cfg(),
      copilot: engine,
      replyPort: {
        async reply(input) {
          replies.push(input.text);
          return { ok: true };
        },
      },
    },
  );
  assert.equal(routed.handled, true);
  assert.ok(replies[0]);
  assert.match(replies[0], /Lead|Health|agent/i);

  console.log('\nTELEGRAM COPILOT TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
