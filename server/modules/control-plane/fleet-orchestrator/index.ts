/**
 * Intelligent Fleet Orchestrator public API (G2).
 */

export type * from './types';
export {
  extractJobRequirements,
  agentHasCapabilities,
  normalizeAgentCapabilities,
  deriveBrowserCapabilities,
  matchBrowserRequirements,
  jobTypePriorityBoost,
} from './capabilityMatcher';
export {
  scoreJobForAgent,
  requirementsSummary,
  type PlacementJobInput,
} from './placementEngine';
export {
  planClaimForAgent,
  listPlacementDecisions,
  getPlannerStats,
  resetPlannerForTests,
} from './assignmentPlanner';
export {
  reserveJob,
  releaseReservation,
  getReservation,
  isReservedForOther,
  isJobInCooldown,
  recordJobFailureCooldown,
  listReservations,
  listCooldowns,
  RESERVATION_TTL_MS,
  resetReservationStoreForTests,
} from './reservationStore';
export {
  getDefaultFleetPolicy,
  setDefaultFleetPolicy,
  upsertMachinePolicy,
  getMachinePolicy,
  listMachinePolicies,
  isMachineDraining,
  isMachineInMaintenance,
  pinToMachine,
  resetFleetPoliciesForTests,
} from './policies';
export {
  selectJobForClaim,
  onClaimSuccess,
  onClaimRejection,
  onJobFailedForCooldown,
  onAgentOfflineFailover,
  getOrchestratorSnapshot,
  setFleetPolicyMode,
  setAgentDrain,
  setAgentMaintenance,
  resetOrchestratorForTests,
  resolveClaimingAgent,
} from './orchestrator';
export {
  formatOrchestratorOverviewLines,
  formatPlacementDecisionLines,
  formatOrchestratorReportLines,
} from './formatTelegram';
