/**
 * Telegram Client — renders Command Engine results only.
 * No business logic.
 */

import {
  executeControlCommand,
  formatCommandText,
} from './command-engine';
import type { CommandResult } from './command-engine/types';

export type TelegramCommandResult = {
  ok: boolean;
  command: string;
  text: string;
  replyMarkup?: CommandResult['replyMarkup'];
};

export async function handleTelegramControlCommand(
  raw: string,
  options?: { companyId?: string | null },
): Promise<TelegramCommandResult> {
  const result = await executeControlCommand(raw, {
    companyId: options?.companyId,
    client: 'telegram',
    triggeredBy: 'telegram-console',
  });
  return {
    ok: result.ok,
    command: result.command,
    text: formatCommandText(result),
    replyMarkup: result.replyMarkup,
  };
}
