/**
 * Command Engine — shared by Web, Telegram, CLI.
 */

import type { AuthUser } from '../../../../src/types';
import { createCommandRegistry } from './registry';
import { parseCommandLine } from './parse';
import { registerDefaultCommands, consoleSystemUser } from './defaultCommands';
import { registerOperationsCommands } from './operationsCommands';
import type { CommandClient, CommandContext, CommandResult } from './types';

export { parseCommandLine } from './parse';
export { createCommandRegistry, CommandRegistry } from './registry';
export type { CommandClient, CommandContext, CommandResult, CommandDefinition } from './types';

let sharedRegistry: ReturnType<typeof createCommandRegistry> | null = null;

export function getCommandRegistry() {
  if (!sharedRegistry) {
    sharedRegistry = createCommandRegistry();
    registerDefaultCommands(sharedRegistry);
    registerOperationsCommands(sharedRegistry);
  }
  return sharedRegistry;
}

async function runCommand(
  registry: ReturnType<typeof createCommandRegistry>,
  input: string,
  options?: {
    user?: AuthUser;
    companyId?: string | null;
    client?: CommandClient;
    triggeredBy?: string;
  },
): Promise<CommandResult> {
  const client = options?.client ?? 'cli';
  const companyId = options?.companyId ?? options?.user?.company_id ?? null;
  const ctx: CommandContext = {
    user: options?.user ?? consoleSystemUser(companyId, client),
    companyId,
    client,
    triggeredBy: options?.triggeredBy ?? `${client}-console`,
  };
  const parsed = parseCommandLine(input);
  if (!parsed.name) {
    return {
      ok: false,
      command: 'unknown',
      lines: ['Empty command. Try /help'],
      error: 'empty',
    };
  }
  const def = registry.get(parsed.name);
  if (!def) {
    return {
      ok: false,
      command: parsed.name,
      lines: [`Unknown command: ${parsed.name}. Try /help`],
      error: 'unknown_command',
    };
  }
  try {
    return await def.handler(parsed.args, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      command: parsed.name,
      lines: [message],
      error: message,
    };
  }
}

/** Prefer DI: create a fresh engine registry (tests). */
export function createCommandEngine() {
  const registry = createCommandRegistry();
  registerDefaultCommands(registry);
  registerOperationsCommands(registry);
  return {
    registry,
    async execute(
      input: string,
      options?: {
        user?: AuthUser;
        companyId?: string | null;
        client?: CommandClient;
        triggeredBy?: string;
      },
    ): Promise<CommandResult> {
      return runCommand(registry, input, options);
    },
  };
}

/** Execute a console command (shared entry for all clients). */
export async function executeControlCommand(
  input: string,
  options?: {
    user?: AuthUser;
    companyId?: string | null;
    client?: CommandClient;
    triggeredBy?: string;
  },
): Promise<CommandResult> {
  return runCommand(getCommandRegistry(), input, options);
}

/** Format CommandResult as plain text (Telegram / CLI). */
export function formatCommandText(result: CommandResult): string {
  return result.lines.join('\n');
}
