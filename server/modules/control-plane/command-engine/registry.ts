/**
 * Command Registry — Registry + Adapter, no switch-case dispatch.
 */

import type { CommandDefinition, CommandHandler } from './types';

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  register(def: CommandDefinition): this {
    this.commands.set(def.name.toLowerCase(), def);
    return this;
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name.toLowerCase());
  }

  has(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  list(): CommandDefinition[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Alias support e.g. start → help */
  alias(from: string, to: string): this {
    const target = this.get(to);
    if (!target) throw new Error(`Cannot alias ${from} → missing ${to}`);
    this.commands.set(from.toLowerCase(), {
      ...target,
      name: from.toLowerCase(),
    });
    return this;
  }
}

export function createCommandRegistry(): CommandRegistry {
  return new CommandRegistry();
}

export type { CommandHandler };
