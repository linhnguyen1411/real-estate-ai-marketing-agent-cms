/**
 * Control Plane Console tests — Command Engine, Telegram client, CLI, Report.
 * Run: npx tsx scripts/test-control-plane-console.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createCommandEngine,
  executeControlCommand,
  formatCommandText,
  getCommandRegistry,
  parseCommandLine,
} from '../server/modules/control-plane/command-engine';
import { handleTelegramControlCommand } from '../server/modules/control-plane/telegramRemoteConsole';
import { ControlPlane } from '../server/modules/control-plane';
import { subscribeRuntimeEvents } from '../server/modules/control-plane/command-engine/eventSubscription';

async function testCommandEngineRegistry() {
  const engine = createCommandEngine();
  const names = engine.registry.list().map(c => c.name);
  for (const required of [
    'health',
    'runtime',
    'agents',
    'missions',
    'browser',
    'campaigns',
    'report',
    'scan',
    'publish',
    'cancel',
    'retry',
    'help',
  ]) {
    assert.ok(names.includes(required), `missing command ${required}`);
  }
  const unknown = await engine.execute('/nope');
  assert.equal(unknown.ok, false);
  assert.match(unknown.lines.join(' '), /Unknown/);

  const parsed = parseCommandLine('/report today');
  assert.equal(parsed.name, 'report');
  assert.deepEqual(parsed.args, ['today']);
  console.log('✓ Command Engine');
}

async function testTelegramClient() {
  const help = await handleTelegramControlCommand('/help');
  assert.equal(help.ok, true);
  assert.match(help.text, /health/);
  assert.match(help.text, /missions/);

  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip Telegram live (DB unavailable)');
    return;
  }

  const health = await handleTelegramControlCommand('/health');
  assert.equal(health.ok, true);
  assert.match(health.text, /Health/);

  const agents = await ControlPlane.telegramCommand('/agents');
  assert.equal(agents.ok, true);

  const runtime = await ControlPlane.telegramCommand('/runtime');
  assert.equal(runtime.ok, true);
  console.log('✓ Telegram');
}

async function testCli() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      'scripts/automation-cli.ts',
      'help',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Control Plane Console|health/i);

  const runtime = await executeControlCommand('runtime', { client: 'cli' });
  assert.equal(typeof runtime.ok, 'boolean');
  assert.ok(formatCommandText(runtime).length > 0);
  console.log('✓ CLI');
}

async function testRuntimeAndReport() {
  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip Runtime/Report live (DB unavailable)');
    return;
  }

  const user = {
    id: 'test',
    name: 'test',
    email: 't@local',
    role: 'owner' as const,
  };
  const snap = await ControlPlane.getRuntime(user);
  assert.ok(Array.isArray(snap.controlPlane?.commands));
  assert.ok(snap.controlPlane.commands.includes('health'));

  const events = await subscribeRuntimeEvents({ limit: 5 });
  assert.ok(Array.isArray(events));

  for (const kind of [
    'daily',
    'weekly',
    'runtime_health',
    'scanner',
    'publish',
    'campaign',
    'agent',
    'browser',
  ] as const) {
    const report = await ControlPlane.report(user, kind);
    assert.equal(report.kind, kind);
    assert.equal(report.dataSource, 'runtime_api');
  }

  const cmd = await ControlPlane.command('/browser', { client: 'web', user });
  assert.equal(cmd.command, 'browser');
  console.log('✓ Runtime + Report');
}

async function testWiring() {
  const root = process.cwd();
  for (const f of [
    'server/modules/control-plane/command-engine/index.ts',
    'server/modules/control-plane/command-engine/defaultCommands.ts',
    'scripts/automation-cli.ts',
    'docs/architecture/CONTROL-PLANE-CONSOLE.md',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
  const desc = ControlPlane.describe();
  assert.ok(desc.layers?.commandEngine);
  assert.ok(desc.console?.cli);
  // Telegram file must not contain business switch for health
  const tg = fs.readFileSync(
    path.join(root, 'server/modules/control-plane/telegramRemoteConsole.ts'),
    'utf8',
  );
  assert.ok(!tg.includes('case \'health\''));
  assert.match(tg, /executeControlCommand/);
  console.log('✓ wiring (Telegram thin client)');
}

async function main() {
  console.log('Control Plane Console tests');
  void getCommandRegistry;
  await testCommandEngineRegistry();
  await testWiring();
  await testTelegramClient();
  await testCli();
  await testRuntimeAndReport();
  console.log('\nCONTROL PLANE CONSOLE TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
