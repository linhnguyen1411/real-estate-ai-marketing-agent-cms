/**
 * Fleet Manager public API.
 */

export type {
  FleetAgent,
  FleetActivity,
  FleetState,
  FleetBrowserRow,
  FleetJobOwnership,
} from './types';

export {
  listFleetAgents,
  getFleetAgent,
  enrichFleetAgent,
  fleetAgentFromSession,
  listFleetBrowsers,
} from './registry';

export { aggregateFleetState, getFleetState } from './state';

export {
  scoreFleetAgents,
  scheduleFleetAgent,
  suggestTargetAgentId,
  type FleetScheduleRequest,
  type FleetScheduleScore,
} from './scheduler';

export {
  formatFleetDashboardLines,
  formatFleetAgentBrief,
  formatFleetAgentDetailLines,
  formatFleetBrowserLines,
  formatFleetJobOwnershipLines,
} from './formatTelegram';
