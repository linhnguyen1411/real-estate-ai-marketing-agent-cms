/**
 * Shared Command Engine types — Web / Telegram / CLI clients.
 */

import type { AuthUser } from '../../../../src/types';

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
