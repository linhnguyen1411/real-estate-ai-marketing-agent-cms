/**
 * Shared Command Engine types — Web / Telegram / CLI clients.
 */

import type { AuthUser } from '../../../../src/types';
import type { InlineKeyboard } from '../inlineKeyboard';

export type CommandClient = 'web' | 'telegram' | 'cli';

export type CommandContext = {
  user: AuthUser;
  companyId?: string | null;
  client: CommandClient;
  triggeredBy: string;
};

export type CommandResult = {
  ok: boolean;
  command: string;
  /** Structured payload for Web/CLI JSON */
  data?: Record<string, unknown>;
  /** Human-readable lines (Telegram / CLI text mode) */
  lines: string[];
  error?: string;
  /** Optional Telegram inline keyboard (ignored by CLI/web text) */
  replyMarkup?: InlineKeyboard;
};

export type CommandHandler = (
  args: string[],
  ctx: CommandContext,
) => Promise<CommandResult>;

export type CommandDefinition = {
  name: string;
  description: string;
  usage: string;
  handler: CommandHandler;
};
