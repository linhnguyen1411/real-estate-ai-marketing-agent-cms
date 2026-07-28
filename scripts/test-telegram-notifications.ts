#!/usr/bin/env node
/**
 * Telegram formatter + notification helper tests (no send / no DB).
 */
import assert from 'assert';
import { formatFindingTelegramMessage } from '../server/notifications/telegramFormatter';
import {
  isInQuietHours,
  maskTelegramToken,
  maskSettingsSecrets,
} from '../server/notifications/telegramNotificationService';
import { resolveLeadIntelligence } from '../src/utils/resolveLeadIntelligence';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

{
  const finding = {
    id: 'f-tg-1',
    title: 'Khách mua đất FPT',
    summary: 'Cần mua đất gần FPT',
    finalScore: 82,
    classification: 'buyer',
    primaryPhone: '0905111222',
    primaryLocation: 'Ngũ Hành Sơn',
    needSummary: 'Mua đất 100m2',
  };
  const resolved = resolveLeadIntelligence({
    ...finding,
    actorRole: 'demand_side',
    extractedData: {},
  });
  const msg = formatFindingTelegramMessage(finding, resolved, {
    includePhone: true,
    includeBudget: true,
    includeLocation: true,
    includeLink: false,
  });

  ok('canonical lead alert header', msg.includes('🎯 LEAD ALERT'));
  ok('buyer confidence metric', /BUYER CONFIDENCE:\s*\d+%/.test(msg));
  ok('message has role line', msg.includes('👤'));
  ok('message includes phone when enabled', msg.includes('0905111222'));
  ok('message includes need/summary', msg.includes('Mua đất') || msg.includes('Khách mua'));
  ok('no legacy Lead mới score line', !/Lead mới \(\d+\/100\)/.test(msg));
}

{
  const noon = new Date('2026-07-13T12:00:00');
  ok('quiet hours daytime window', isInQuietHours('22:00', '07:00', noon) === false);
  const night = new Date('2026-07-13T23:30:00');
  ok('quiet hours overnight active', isInQuietHours('22:00', '07:00', night) === true);
  const morning = new Date('2026-07-13T06:00:00');
  ok('quiet hours morning still quiet', isInQuietHours('22:00', '07:00', morning) === true);
  ok('invalid quiet hours → false', isInQuietHours(undefined, undefined) === false);
}

{
  ok('mask short token', maskTelegramToken('abcd') === '****');
  ok('mask long token shape', maskTelegramToken('1234567890abcdef').includes('…'));
  const masked = maskSettingsSecrets({
    telegram_bot_token: '1234567890:ABCDEF',
    agent_sync_secret: 'sync-secret-value',
  } as never);
  ok('maskSettingsSecrets masks bot token', Boolean(masked.telegram_bot_token?.includes('…')));
}

console.log(`\n${passed} assertions passed`);
