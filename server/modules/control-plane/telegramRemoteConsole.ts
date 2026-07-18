/**
 * Telegram Client — renders Command Engine results only.
 * No business logic.
 */

import {
  executeControlCommand,
  formatCommandText,
} from './command-engine';

export type TelegramCommandResult = {
  ok: boolean;
  command: string;
  text: string;
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
  };
}
