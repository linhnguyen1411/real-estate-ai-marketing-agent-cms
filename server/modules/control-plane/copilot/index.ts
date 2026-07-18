/**
 * Copilot Engine — channel-agnostic.
 * Telegram / Discord / Slack / Web Chat / Voice all call handleMessage.
 */

import { classifyIntent, type LlmClassifyFn } from './classifier';
import {
  getCopilotContext,
  touchCopilotContext,
} from './contextStore';
import { createControlPlanePort } from './controlPlanePort';
import {
  classifiedFromApproval,
  classifiedFromIncident,
  registerDefaultIntentHandlers,
} from './handlers';
import { createIntentRegistry, type IntentRegistry } from './intentRegistry';
import type { CopilotControlPlanePort } from './ports';
import type {
  ClassifiedIntent,
  CopilotMessageInput,
  CopilotReply,
} from './types';

export type CopilotEngine = {
  handleMessage(input: CopilotMessageInput): Promise<CopilotReply>;
  handleClassified(
    intent: ClassifiedIntent,
    input: CopilotMessageInput,
  ): Promise<CopilotReply>;
  /** Parse /approval and /incident slash into intents */
  trySpecialCommand(text: string): ClassifiedIntent | null;
};

export function createCopilotEngine(options?: {
  port?: CopilotControlPlanePort;
  portFactory?: (input: CopilotMessageInput) => CopilotControlPlanePort;
  registry?: IntentRegistry;
  useLlm?: boolean;
  llm?: LlmClassifyFn;
}): CopilotEngine {
  const registry = options?.registry ?? createIntentRegistry();
  if (!options?.registry) {
    registerDefaultIntentHandlers(registry);
  }

  const resolvePort = (input: CopilotMessageInput): CopilotControlPlanePort => {
    if (options?.port) return options.port;
    if (options?.portFactory) return options.portFactory(input);
    return createControlPlanePort({
      companyId: input.companyId,
      useLlmInsights: Boolean(options?.useLlm),
    });
  };

  const trySpecialCommand = (text: string): ClassifiedIntent | null => {
    const t = text.trim();
    const approval = t.match(/^\/approval\s+(approve|reject|edit|mission)\s+(\S+)/i);
    if (approval) {
      return classifiedFromApproval(approval[1].toLowerCase(), approval[2]);
    }
    const incident = t.match(/^\/incident\s+(ack|acknowledge|retry|mute|escalate)\s+(\S+)/i);
    if (incident) {
      return classifiedFromIncident(incident[1].toLowerCase(), incident[2]);
    }
    return null;
  };

  const handleClassified = async (
    intent: ClassifiedIntent,
    input: CopilotMessageInput,
  ): Promise<CopilotReply> => {
    const ctx = getCopilotContext(
      input.channel,
      input.chatId,
      input.userId,
      input.companyId,
    );
    ctx.lastIntent = intent.name;
    touchCopilotContext(ctx);
    const port = resolvePort(input);
    const handler = registry.resolve(intent);
    if (!handler) {
      return {
        ok: false,
        intent: intent.name,
        lines: [`No handler for intent ${intent.name}`],
        text: `No handler for intent ${intent.name}`,
      };
    }
    return handler.execute({
      intent,
      ctx,
      port,
      text: input.text,
    });
  };

  return {
    trySpecialCommand,
    handleClassified,
    async handleMessage(input) {
      const text = String(input.text || '').trim();
      if (!text) {
        return {
          ok: false,
          intent: 'unknown',
          lines: ['Tin nhắn trống.'],
          text: 'Tin nhắn trống.',
        };
      }

      const special = trySpecialCommand(text);
      if (special) return handleClassified(special, input);

      if (input.isCommand || text.startsWith('/')) {
        return handleClassified(
          {
            name: 'raw_command',
            confidence: 1,
            source: 'command',
            slots: { rawCommand: text },
          },
          input,
        );
      }

      const ctx = getCopilotContext(
        input.channel,
        input.chatId,
        input.userId,
        input.companyId,
      );
      const contextSummary = [
        ctx.lastIntent ? `lastIntent=${ctx.lastIntent}` : '',
        ctx.lastJobIds.length ? `jobs=${ctx.lastJobIds.slice(0, 5).join(',')}` : '',
        ctx.lastFindingIds.length
          ? `findings=${ctx.lastFindingIds.slice(0, 5).join(',')}`
          : '',
      ]
        .filter(Boolean)
        .join('; ');

      const intent = await classifyIntent({
        text,
        contextSummary,
        useLlm: Boolean(options?.useLlm),
        llm: options?.llm,
      });

      return handleClassified(intent, input);
    },
  };
}
