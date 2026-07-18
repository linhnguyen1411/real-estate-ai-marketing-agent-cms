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
import type { ControlPlaneReportKind, RuntimeEventType } from './types';
import { RUNTIME_EVENT_TYPES } from './types';

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
        version: 1,
        eventTypes: RUNTIME_EVENT_TYPES,
        clients: ['web_dashboard', 'telegram_bot', 'cli', 'report_engine'],
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

  async telegramCommand(text: string, options?: { companyId?: string | null }) {
    return handleTelegramControlCommand(text, options);
  },

  describe() {
    return {
      name: 'ControlPlane',
      role: 'orchestration observability + remote console',
      reuses: [
        'Mission Engine',
        'Execution Pool',
        'Browser Pool',
        'Runtime API',
        'Runtime Monitor',
      ],
      nonGoals: [
        'new worker',
        'new queue',
        'new scheduler',
        'new browser runtime',
        'scanner/publisher rewrite',
      ],
      eventTypes: RUNTIME_EVENT_TYPES as readonly RuntimeEventType[],
    };
  },
};

export type ControlPlaneFacade = typeof ControlPlane;
