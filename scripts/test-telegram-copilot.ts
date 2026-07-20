/**
 * AI Operations Copilot + Telegram Copilot tests (F4).
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
  opsActionKeyboard,
  machineActionKeyboard,
  browserActionKeyboard,
  callbackDataToCommand,
  routeTelegramUpdate,
  detectOperationalIncidents,
  explainScannerIdle,
  recommendForIncident,
  formatFleetAwarenessLines,
  formatScannerSummaryLines,
  formatPublisherSummaryLines,
  formatMissionSummaryLines,
  formatIncidentCenterLines,
  _resetTelegramControlPlaneForTests,
  _resetTelegramCopilotForTests,
  resetTelegramAclRateLimitForTests,
} from '../server/modules/control-plane';
import type { TelegramConsoleConfig } from '../server/modules/control-plane/telegram';
import type { CopilotControlPlanePort } from '../server/modules/control-plane/copilot/ports';
import type { OperationsMetricsSnapshot } from '../server/modules/control-plane/operations/types';
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

function sampleOps(overrides: Partial<OperationsMetricsSnapshot> = {}): OperationsMetricsSnapshot {
  const base: OperationsMetricsSnapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    refreshReason: 'telegram',
    companyId: null,
    fleet: {
      machinesOnline: 2,
      machinesOffline: 0,
      machinesBusy: 1,
      machinesIdle: 1,
      cpuAvg: 0.2,
      ramUsedPctAvg: 40,
      browserBusy: 1,
      browserIdle: 1,
      healthScore: 88,
    },
    scanner: {
      sources: 11,
      assigned: 2,
      running: 1,
      completed: 4,
      findingsToday: 7,
      postsScanned: 120,
    },
    publisher: {
      draft: 3,
      queue: 2,
      publishing: 1,
      publishedToday: 5,
      retry: 1,
    },
    mission: { running: 1, waiting: 0, completed: 2, failed: 0 },
    workload: {
      totalScanSources: 11,
      assignedSources: 2,
      completedSources: 4,
      runningMissions: 1,
      runningPublishJobs: 1,
      runningCampaigns: 0,
      waitingJobs: 3,
      retryJobs: 1,
      failedJobs: 1,
    },
    machines: [
      {
        agentId: 'worker-linh',
        hostname: 'LINH-PC',
        machineId: 'LINH-PC',
        displayName: 'LINH-PC',
        status: 'online',
        activity: 'scanning',
        assigned: 1,
        running: 1,
        completed: 4,
        waiting: 0,
        cpuLoad1m: 18,
        memFreeMb: 8000,
        memTotalMb: 16000,
        rssMb: 512,
        heapUsedMb: 200,
        chromeCount: 1,
        browserBusy: 1,
        browserIdle: 0,
        executionSlots: 1,
        missionName: 'Buyer Scan',
        currentStep: 'scan_source',
        heartbeatAgeMs: 5000,
      },
      {
        agentId: 'worker-mini',
        hostname: 'MINI-PC',
        machineId: 'MINI-PC',
        displayName: 'MINI-PC',
        status: 'online',
        activity: 'publishing',
        assigned: 1,
        running: 1,
        completed: 2,
        waiting: 0,
        cpuLoad1m: 22,
        memFreeMb: 4000,
        memTotalMb: 8000,
        rssMb: 400,
        heapUsedMb: 180,
        chromeCount: 1,
        browserBusy: 1,
        browserIdle: 0,
        executionSlots: 1,
        missionName: 'Facebook Timeline',
        currentStep: 'publish',
        heartbeatAgeMs: 4000,
      },
    ],
    fleetState: null,
    agents: [],
  };
  return { ...base, ...overrides, fleet: { ...base.fleet, ...(overrides.fleet || {}) } };
}

function mockPort(overrides: Partial<CopilotControlPlanePort> = {}): CopilotControlPlanePort {
  const user = consoleSystemUser(null, 'telegram');
  const ops = sampleOps();
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
    async getOpsMetrics() {
      return ops;
    },
    async listOfflineAgents() {
      return [];
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
      return [
        { id: 'pub1', error: 'timeout' },
        { id: 'pub2', error: 'SOURCE_REMOVED: source deleted' },
      ];
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
        text: `Summary ${slot}\nLead hôm nay: 4\nHealth: 88`,
        lines: [`Summary ${slot}`, 'Lead hôm nay: 4', 'Health: 88'],
      };
    },
    async detectIncidents() {
      return detectOperationalIncidents(ops, {
        lastErrors: [{ entityId: 'pub2', message: 'SOURCE_REMOVED: source deleted' }],
      });
    },
    async listBrowsers() {
      return [
        {
          agentId: 'worker-linh',
          profile: 'agent-cdp-profile',
          facebookAccount: 'ops@example.com',
          busy: true,
          currentUrl: 'https://www.facebook.com/',
          lockedBy: 'scan_source',
          state: 'busy',
        },
      ];
    },
    async findMachine(query) {
      const q = query.toLowerCase();
      return ops.machines.find(m => m.hostname.toLowerCase().includes(q)) || null;
    },
    async explainScanner() {
      return explainScannerIdle(ops);
    },
    ...overrides,
  };
}

async function main() {
  resetCopilotContextForTests();
  _resetTelegramControlPlaneForTests();
  _resetTelegramCopilotForTests();
  resetTelegramAclRateLimitForTests();

  // --- Conversation classification ---
  assert.equal(classifyByRules('Có gì mới?').name, 'whats_new');
  assert.equal(classifyByRules('Máy nào đang bận?').name, 'fleet_summary');
  assert.equal(classifyByRules('Có lỗi không?').name, 'incident_summary');
  assert.equal(classifyByRules('Scanner sao rồi?').name, 'scanner_summary');
  assert.equal(classifyByRules('Publisher thế nào?').name, 'publisher_summary');
  assert.equal(classifyByRules('Tại sao Scanner không chạy?').name, 'runtime_explain');
  assert.equal(classifyByRules('Nên làm gì tiếp?').name, 'ops_recommendation');
  console.log('PASS Conversation');

  const engine = createCopilotEngine({ port: mockPort(), useLlm: false });

  // --- Fleet ---
  const fleet = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Máy nào đang bận?',
  });
  assert.equal(fleet.ok, true);
  assert.match(fleet.text, /Fleet|LINH-PC|Scanner|Publisher/i);
  assert.ok(fleet.replyMarkup);
  assert.ok(formatFleetAwarenessLines(sampleOps()).some(l => /LINH-PC/.test(l)));
  console.log('PASS Fleet');

  // --- Scanner ---
  const scanner = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Scanner sao rồi?',
  });
  assert.equal(scanner.ok, true);
  assert.match(scanner.text, /Scanner Summary|Sources|Findings|ETA/i);
  assert.ok(formatScannerSummaryLines(sampleOps()).join('\n').includes('Sources'));
  console.log('PASS Scanner');

  // --- Publisher ---
  const publisher = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Publisher thế nào?',
  });
  assert.equal(publisher.ok, true);
  assert.match(publisher.text, /Publisher Summary|Queue|Publishing/i);
  assert.ok(formatPublisherSummaryLines(sampleOps()).join('\n').includes('Queue'));
  console.log('PASS Publisher');

  // --- Mission ---
  const mission = await engine.handleClassified(
    { name: 'mission_summary', confidence: 1, slots: {}, source: 'rule' },
    { channel: 'telegram', chatId: '100', userId: '42', text: 'Mission' },
  );
  assert.equal(mission.ok, true);
  assert.match(mission.text, /Mission Summary|Running/i);
  assert.ok(formatMissionSummaryLines(sampleOps()).join('\n').includes('Running'));
  console.log('PASS Mission');

  // --- Incident + Recommendation ---
  const signals = detectOperationalIncidents(sampleOps(), {
    lastErrors: [{ entityId: 'j1', message: 'SOURCE_REMOVED: source deleted' }],
  });
  assert.ok(signals.incidents.some(i => i.kind === 'source_removed'));
  const rec = recommendForIncident(
    signals.incidents.find(i => i.kind === 'source_removed')!,
  );
  assert.match(rec.summary, /Không nên Retry|retry/i);
  assert.match(rec.actionLabel, /Remove Source/i);
  const incident = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Có lỗi không?',
  });
  assert.equal(incident.ok, true);
  assert.match(incident.text, /Incident|Source Removed|⚠|❌/i);
  assert.ok(formatIncidentCenterLines(signals.incidents).join('\n').includes('Source Removed'));
  console.log('PASS Incident');
  console.log('PASS Recommendation');

  // --- Inline Actions ---
  const okb = opsActionKeyboard('worker-linh');
  assert.ok(okb.inline_keyboard.flat().some(b => 'text' in b && b.text === 'Release Browser'));
  assert.equal(callbackDataToCommand('o:b:worker-linh'), '/browser release');
  assert.equal(callbackDataToCommand('k:a:worker-linh'), '/agent restart worker-linh');
  assert.ok(machineActionKeyboard('worker-linh').inline_keyboard.length >= 2);
  assert.ok(browserActionKeyboard('worker-linh').inline_keyboard.flat().some(b => 'text' in b && b.text === 'Recover'));
  assert.equal(callbackDataToCommand('b:e:worker-linh'), '/browser release');
  const whatsNew = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Có gì mới?',
  });
  assert.ok(whatsNew.replyMarkup);
  console.log('PASS Inline Actions');

  // --- Daily Briefing ---
  assert.equal(resolveSummarySlot(new Date('2026-07-18T01:00:00Z'), 'Asia/Ho_Chi_Minh'), 'morning');
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
  assert.match(summaryText, /Summary|Lead|Health/i);
  assert.equal(await sched.tickOnce(), false);
  sched.stop();
  console.log('PASS Daily Briefing');

  // --- Runtime explain ---
  const explain = await engine.handleMessage({
    channel: 'telegram',
    chatId: '100',
    userId: '42',
    text: 'Tại sao Scanner không chạy?',
  });
  assert.equal(explain.ok, true);
  assert.match(explain.text, /Scanner|chạy|source|slot|Browser/i);

  // --- Telegram thin client ---
  const replies: string[] = [];
  const routed = await routeTelegramUpdate(
    {
      update_id: 1,
      message: {
        message_id: 1,
        text: 'Máy nào đang bận?',
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
  assert.match(replies[0], /Fleet|LINH-PC/i);
  console.log('PASS Telegram');

  // Legacy surfaces still ok
  assert.equal(classifyByRules('Hôm nay có bao nhiêu lead?').name, 'lead_count');
  const kb = approvalKeyboard('finding123');
  assert.ok(kb.inline_keyboard.flat().some(b => 'callback_data' in b && b.text === 'Approve'));
  const ik = incidentKeyboard('agent-a');
  assert.ok(ik.inline_keyboard.flat().some(b => 'text' in b && b.text === 'Mute'));
  const cmdEngine = createCommandEngine();
  const user = consoleSystemUser(null, 'telegram');
  assert.equal((await cmdEngine.execute('/publish queue', { client: 'telegram', user })).ok, true);
  void formatCommandText;
  rememberJobList(getCopilotContext('telegram', '100', '42', null), ['job-a'], 't');

  console.log('PASS Lint');
  console.log('\nAI OPERATIONS COPILOT TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
