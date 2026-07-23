/**
 * Control Plane Telemetry public API.
 */

export type {
  ExecutionAgentRuntimeSnapshot,
  BrowserProfileTelemetry,
  JobTelemetrySummary,
  HostTelemetry,
  ProcessTelemetry,
  TelemetryRemoteCommand,
} from './types';
export { TELEMETRY_SCHEMA_VERSION } from './types';
export { normalizeRuntimeSnapshot } from './normalize';
export {
  ingestAgentHeartbeat,
  getLastAgentSnapshot,
  listAgentSnapshots,
  enqueueRemoteCommand,
  drainRemoteCommands,
  peekRemoteCommands,
  resetTelemetryCollectorForTests,
} from './collector';
export {
  requestRemoteControl,
  normalizeRemoteAction,
  type RemoteControlAction,
} from './remoteControl';
export { formatAgentTelemetryLines, formatBrowserTelemetryLines } from './formatTelegram';
