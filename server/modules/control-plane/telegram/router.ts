/**
 * Telegram Router — Update/Callback → ACL → Command Engine / Copilot → Reply.
 */

import { executeControlCommand, formatCommandText } from '../command-engine';
import { createCopilotEngine, type CopilotEngine } from '../copilot';
import { getCopilotContext, rememberJobList, rememberMissionList } from '../copilot/contextStore';
import { checkTelegramAcl, canMutateViaTelegram } from './acl';
import { callbackDataToCommand, type InlineKeyboard } from '../inlineKeyboard';
import { normalizeTelegramInbound } from './normalizeUpdate';
import type { TelegramReplyPort } from './outbound';
import type { TelegramConsoleConfig } from './types';
import type { CommandResult } from '../command-engine/types';

const MUTATING_PREFIXES = [
  '/scan',
  '/publish',
  '/cancel',
  '/retry',
  '/pause',
  '/resume',
  '/mission',
  '/lead',
  '/approval',
  '/incident',
  '/agent restart',
  '/browser release',
  '/browser recover',
];

export type TelegramRouterDeps = {
  config: TelegramConsoleConfig;
  replyPort: TelegramReplyPort;
  runCommand?: (
    raw: string,
    options?: { companyId?: string | null },
  ) => Promise<{
    ok: boolean;
    command: string;
    text: string;
    replyMarkup?: InlineKeyboard;
    data?: Record<string, unknown>;
  }>;
  copilot?: CopilotEngine;
  /** Enable NL when true (default true) */
  enableCopilot?: boolean;
};

export type TelegramRouteResult = {
  handled: boolean;
  ok: boolean;
  reason?: string;
  command?: string;
  replyText?: string;
};

let sharedCopilot: CopilotEngine | null = null;

export function getTelegramCopilot(): CopilotEngine {
  if (!sharedCopilot) sharedCopilot = createCopilotEngine({ useLlm: false });
  return sharedCopilot;
}

export function _resetTelegramCopilotForTests(): void {
  sharedCopilot = null;
}

function rememberFromCommandResult(
  chatId: string,
  userId: string,
  companyId: string | null | undefined,
  commandText: string,
  data?: Record<string, unknown>,
): void {
  const ctx = getCopilotContext('telegram', chatId, userId, companyId);
  const jobs = data?.jobs as Array<{ id?: string; missionId?: string }> | undefined;
  if (Array.isArray(jobs) && jobs.length) {
    rememberJobList(
      ctx,
      jobs.map(j => String(j.id || '')).filter(Boolean),
      commandText,
    );
    const missions = jobs.map(j => String(j.missionId || '')).filter(Boolean);
    if (missions.length) rememberMissionList(ctx, missions);
  }
  const mission = data?.mission as { id?: string } | undefined;
  if (mission?.id) rememberMissionList(ctx, [mission.id]);
}

async function runAndReply(
  commandText: string,
  chatId: string,
  userId: string,
  deps: TelegramRouterDeps,
): Promise<TelegramRouteResult> {
  const run =
    deps.runCommand ??
    (async (raw: string, options?: { companyId?: string | null }) => {
      const result: CommandResult = await executeControlCommand(raw, {
        companyId: options?.companyId,
        client: 'telegram',
        triggeredBy: 'telegram-console',
      });
      return {
        ok: result.ok,
        command: result.command,
        text: formatCommandText(result),
        replyMarkup: result.replyMarkup,
        data: result.data,
      };
    });

  const result = await run(commandText, { companyId: deps.config.companyId });
  rememberFromCommandResult(
    chatId,
    userId,
    deps.config.companyId,
    commandText,
    result.data,
  );
  const replyText = result.text || (result.ok ? 'OK' : 'Command failed');
  await deps.replyPort.reply({
    botToken: deps.config.botToken,
    chatId,
    text: replyText,
    replyMarkup: result.replyMarkup,
  });
  return {
    handled: true,
    ok: result.ok,
    command: result.command,
    replyText,
  };
}

async function runCopilotAndReply(
  text: string,
  chatId: string,
  userId: string,
  isCommand: boolean,
  deps: TelegramRouterDeps,
): Promise<TelegramRouteResult> {
  const engine = deps.copilot ?? getTelegramCopilot();
  const reply = await engine.handleMessage({
    channel: 'telegram',
    chatId,
    userId,
    text,
    companyId: deps.config.companyId,
    isCommand,
  });
  await deps.replyPort.reply({
    botToken: deps.config.botToken,
    chatId,
    text: reply.text || '(empty)',
    replyMarkup: reply.replyMarkup,
  });
  return {
    handled: true,
    ok: reply.ok,
    command: reply.command || reply.intent,
    replyText: reply.text,
  };
}

export async function routeTelegramUpdate(
  rawUpdate: unknown,
  deps: TelegramRouterDeps,
): Promise<TelegramRouteResult> {
  const inbound = normalizeTelegramInbound(rawUpdate);
  if (!inbound) {
    return { handled: false, ok: true, reason: 'ignored_non_message' };
  }

  const acl = checkTelegramAcl(deps.config, {
    chatId: inbound.chatId,
    userId: inbound.userId,
  });
  if (!acl.ok) {
    const replyText =
      acl.reason === 'rate_limited'
        ? 'Rate limited. Try again in a minute.'
        : 'Unauthorized. This chat/user is not allowed to control the console.';
    if (inbound.kind === 'callback') {
      await deps.replyPort.answerCallback?.({
        botToken: deps.config.botToken,
        callbackQueryId: inbound.callbackQueryId,
        text: 'Unauthorized',
      });
    }
    await deps.replyPort.reply({
      botToken: deps.config.botToken,
      chatId: inbound.chatId,
      text: replyText,
    });
    return { handled: true, ok: false, reason: acl.reason, replyText };
  }

  let commandText = '';
  let viaCopilot = false;

  if (inbound.kind === 'callback') {
    const mapped = callbackDataToCommand(inbound.data);
    await deps.replyPort.answerCallback?.({
      botToken: deps.config.botToken,
      callbackQueryId: inbound.callbackQueryId,
      text: mapped ? '…' : 'Unknown',
    });
    if (!mapped) {
      return { handled: true, ok: false, reason: 'unknown_callback' };
    }
    commandText = mapped;
    // Approval / incident / AI employee go through Copilot
    if (
      mapped.startsWith('/approval') ||
      mapped.startsWith('/incident') ||
      /^(research|content plan|đề xuất mission|de xuat mission|lead nổi bật|lead noi bat|lập campaign|lap campaign|hôm nay ai|hom nay ai|thiếu bài|thieu bai|ai sales)/i.test(
        mapped,
      )
    ) {
      viaCopilot = true;
    }
  } else {
    if (!inbound.text) {
      return { handled: false, ok: true, reason: 'ignored_empty' };
    }
    if (!inbound.isCommand) {
      if (deps.enableCopilot === false) {
        return { handled: false, ok: true, reason: 'ignored_non_command' };
      }
      return runCopilotAndReply(
        inbound.text,
        inbound.chatId,
        inbound.userId,
        false,
        deps,
      );
    }
    commandText = inbound.text;
    if (
      commandText.toLowerCase().startsWith('/ask ') ||
      commandText.toLowerCase().startsWith('/approval') ||
      commandText.toLowerCase().startsWith('/incident')
    ) {
      viaCopilot = true;
      if (commandText.toLowerCase().startsWith('/ask ')) {
        commandText = commandText.slice(5).trim();
      }
    }
  }

  if (viaCopilot) {
    const lower = commandText.toLowerCase();
    const mutating =
      MUTATING_PREFIXES.some(p => lower.startsWith(p)) ||
      /retry|pause|dừng|cancel|skip/i.test(commandText);
    if (mutating && !canMutateViaTelegram(acl.role)) {
      const replyText = 'Forbidden: viewer role cannot mutate missions/publish.';
      await deps.replyPort.reply({
        botToken: deps.config.botToken,
        chatId: inbound.chatId,
        text: replyText,
      });
      return { handled: true, ok: false, reason: 'forbidden_role', replyText };
    }
    return runCopilotAndReply(
      commandText,
      inbound.chatId,
      inbound.userId,
      commandText.startsWith('/'),
      deps,
    );
  }

  const lower = commandText.toLowerCase();
  const mutating = MUTATING_PREFIXES.some(p => lower.startsWith(p));
  if (mutating && !canMutateViaTelegram(acl.role)) {
    const replyText = 'Forbidden: viewer role cannot mutate missions/publish.';
    await deps.replyPort.reply({
      botToken: deps.config.botToken,
      chatId: inbound.chatId,
      text: replyText,
    });
    return { handled: true, ok: false, reason: 'forbidden_role', replyText };
  }

  // Slash commands still go through Command Engine; Copilot context learns job lists.
  return runAndReply(commandText, inbound.chatId, inbound.userId, deps);
}
