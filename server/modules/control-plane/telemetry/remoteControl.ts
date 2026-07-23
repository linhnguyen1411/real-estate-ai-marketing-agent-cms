/**
 * Remote control — Control Plane Event Bus + heartbeat command delivery.
 * No SSH. No direct browser access from Telegram.
 */

import { emitRuntimeEvent } from '../runtimeEventBus';
import { enqueueRemoteCommand } from './collector';
import type { TelemetryRemoteCommand } from './types';

export type RemoteControlAction =
  | 'retry_job'
  | 'pause_job'
  | 'resume_job'
  | 'cancel_job'
  | 'release_browser'
  | 'force_release_browser'
  | 'takeover_browser'
  | 'restart_browser'
  | 'recover_browser'
  | 'refresh_runtime'
  | 'restart_agent';

const ACTION_ALIASES: Record<string, RemoteControlAction> = {
  retry: 'retry_job',
  pause: 'pause_job',
  resume: 'resume_job',
  cancel: 'cancel_job',
  release: 'release_browser',
  browser_release: 'release_browser',
  release_browser: 'release_browser',
  force_release: 'force_release_browser',
  force_release_browser: 'force_release_browser',
  takeover: 'takeover_browser',
  takeover_browser: 'takeover_browser',
  recover: 'recover_browser',
  browser_recover: 'recover_browser',
  recover_browser: 'recover_browser',
  restart_browser: 'restart_browser',
  refresh: 'refresh_runtime',
  restart: 'restart_agent',
};

export function normalizeRemoteAction(raw: string): RemoteControlAction | null {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if ((Object.values(ACTION_ALIASES) as string[]).includes(key)) {
    return key as RemoteControlAction;
  }
  return ACTION_ALIASES[key] || null;
}

export async function requestRemoteControl(input: {
  agentId: string;
  action: string;
  companyId?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ command: TelemetryRemoteCommand; eventEmitted: true }> {
  const action = normalizeRemoteAction(input.action);
  if (!action) throw new Error(`Unknown remote action: ${input.action}`);

  const command = enqueueRemoteCommand({
    agentId: input.agentId,
    action,
    payload: {
      ...(input.payload || {}),
      entityId: input.entityId ?? null,
    },
  });

  await emitRuntimeEvent({
    type: 'OPS_REQUEST',
    companyId: input.companyId ?? null,
    agentId: input.agentId,
    entityType: action.startsWith('browser') || action.includes('browser') ? 'browser' : 'agent',
    entityId: input.entityId || input.agentId,
    payload: {
      action,
      commandId: command.id,
      requestedAt: command.requestedAt,
      ...(input.payload || {}),
    },
  });

  return { command, eventEmitted: true };
}
