/**
 * Control Plane façade — single entry for clients (Web / Telegram / CLI / Reports).
 * Reuses Mission Engine, Execution Pool, Browser Pool, Runtime API — no rewrite.
 */

import type { AuthUser } from '../../../src/types';
import { buildAutomationRuntimeSnapshot } from '../../agent/runtimeObservability';
import { listRegisteredAgents, getAgentById } from './agentRegistry';
import { selectAgent } from './agentSelector';
import { emitRuntimeEvent, listRuntimeEvents } from './runtimeEventBus';
import { buildControlPlaneReport } from './reportEngine';
import { handleTelegramControlCommand } from './telegramRemoteConsole';
import {
  executeControlCommand,
  formatCommandText,
  getCommandRegistry,
} from './command-engine';
import type { ControlPlaneReportKind, RuntimeEventType } from './types';
import { RUNTIME_EVENT_TYPES } from './types';
import type { CommandClient } from './command-engine/types';

export { registerRuntimeAgentRoutes } from './runtimeAgentRoutes';
export {
  executeControlCommand,
  formatCommandText,
  createCommandEngine,
  getCommandRegistry,
} from './command-engine';
export {
  registerTelegramControlPlaneRoutes,
  startTelegramControlPlane,
  stopTelegramControlPlane,
  getTelegramConsoleStatus,
  approvalKeyboard,
  incidentKeyboard,
  callbackDataToCommand,
  routeTelegramUpdate,
  _resetTelegramCopilotForTests,
  _resetTelegramControlPlaneForTests,
  resetTelegramAclRateLimitForTests,
} from './telegram';
export * from './operationsService';
export {
  createCopilotEngine,
  type CopilotEngine,
} from './copilot';
export {
  createSummaryScheduler,
  resolveSummarySlot,
} from './copilot/summaryScheduler';
export { classifyByRules } from './copilot/ruleClassifier';
export { buildRuleInsights } from './copilot/insightEngine';
export {
  resetCopilotContextForTests,
  rememberJobList,
  getCopilotContext,
} from './copilot/contextStore';
export {
  ingestAgentHeartbeat,
  getLastAgentSnapshot,
  listAgentSnapshots,
  requestRemoteControl,
  normalizeRuntimeSnapshot,
  resetTelemetryCollectorForTests,
  formatAgentTelemetryLines,
  TELEMETRY_SCHEMA_VERSION,
} from './telemetry';

export const ControlPlane = {
  name: 'ControlPlane',

  /** Runtime API — sole read surface for dashboards / bots / CLI. */
  async getRuntime(user: AuthUser) {
    const snapshot = await buildAutomationRuntimeSnapshot(user);
    const agents = await listRegisteredAgents({
      companyId: user.role === 'owner' ? undefined : user.company_id ?? '__none__',
    });
    const events = await listRuntimeEvents({
      companyId: user.role === 'owner' ? undefined : user.company_id ?? null,
      limit: 30,
    });
    return {
      ...snapshot,
      agents,
      events,
      controlPlane: {
        version: 2,
        eventTypes: RUNTIME_EVENT_TYPES,
        clients: ['web_dashboard', 'telegram_bot', 'cli', 'report_engine', 'execution_agent'],
        commands: getCommandRegistry().list().map(c => c.name),
      },
    };
  },

  listAgents: listRegisteredAgents,
  getAgent: getAgentById,
  selectAgent,

  emitEvent: emitRuntimeEvent,
  listEvents: listRuntimeEvents,

  async report(user: AuthUser, kind: ControlPlaneReportKind, options?: { date?: string }) {
    return buildControlPlaneReport(user, kind, options);
  },

  /** Shared Command Engine — Web / Telegram / CLI */
  async command(
    text: string,
    options?: {
      user?: AuthUser;
      companyId?: string | null;
      client?: CommandClient;
      triggeredBy?: string;
    },
  ) {
    return executeControlCommand(text, options);
  },

  /** Telegram is a thin client over Command Engine */
  async telegramCommand(text: string, options?: { companyId?: string | null }) {
    return handleTelegramControlCommand(text, options);
  },

  describe() {
    return {
      name: 'ControlPlane',
      role: 'control plane console + runtime observability',
      layers: {
        runtimeApi: true,
        runtimeEvents: true,
        agentRegistry: true,
        reportEngine: true,
        commandEngine: true,
        clients: ['web', 'telegram', 'cli'],
      },
      reuses: [
        'Mission Engine',
        'Execution Pool',
        'Browser Pool',
        'Runtime API',
        'Runtime Monitor',
        'Execution Agent',
      ],
      nonGoals: [
        'new worker',
        'new queue',
        'new scheduler',
        'scanner/publisher/mission rewrite',
      ],
      executionAgent: {
        process: 'server/automation-agent',
        script: 'npm run automation-agent',
        transport: 'Runtime API (/api/agent/runtime/*)',
      },
      console: {
        commandEngine: 'server/modules/control-plane/command-engine',
        cli: 'npm run automation-cli',
        telegram: 'server/modules/control-plane/telegram (thin client)',
        copilot: 'server/modules/control-plane/copilot (channel-agnostic)',
        telegramFlow:
          'Telegram → UpdateReceiver → ACL → Copilot/Command Engine → Control Plane → Mission/Runtime → Execution Agent',
      },
      eventTypes: RUNTIME_EVENT_TYPES as readonly RuntimeEventType[],
    };
  },
};

export type ControlPlaneFacade = typeof ControlPlane;
