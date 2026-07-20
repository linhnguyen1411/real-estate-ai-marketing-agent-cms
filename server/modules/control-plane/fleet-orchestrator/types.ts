/**
 * Intelligent Fleet Orchestrator — types (G2).
 * Soft placement over pull-based claim. No push / WebSocket / new ports.
 */

export const FLEET_POLICY_MODES = [
  'spread',
  'pack',
  'affinity',
  'energy_saving',
  'manual_pin',
  'maintenance',
  'drain',
] as const;

export type FleetPolicyMode = (typeof FLEET_POLICY_MODES)[number];

/** Extended capability tokens (free-form; not hard-limited to AgentCapability). */
export type CapabilityToken = string;

export type JobRequirements = {
  requiredCapabilities: CapabilityToken[];
  preferredCapabilities: CapabilityToken[];
  preferredBrowser: string | null;
  requiredBrowser: string | null;
  executionType: string;
  priority: number;
  estimatedDurationSec: number | null;
  expectedCpu: number | null;
  expectedRamMb: number | null;
  affinityAgentId: string | null;
  affinityHostname: string | null;
  affinitySourceId: string | null;
  pinMachineId: string | null;
};

export type BrowserCapabilityView = {
  profile: string;
  facebookAccount: string | null;
  loggedIn: boolean;
  timelinePublish: boolean;
  groupPublish: boolean;
  comment: boolean;
  reply: boolean;
  marketplace: boolean;
  healthy: boolean;
  busy: boolean;
};

export type PlacementScoreBreakdown = {
  capability: number;
  browser: number;
  load: number;
  affinity: number;
  priority: number;
  policy: number;
  total: number;
};

export type PlacementCandidateScore = {
  jobId: string;
  jobType: string;
  agentId: string;
  score: number;
  breakdown: PlacementScoreBreakdown;
  eligible: boolean;
  rejectReason: string | null;
  reasons: string[];
};

export type PlacementDecision = {
  id: string;
  at: string;
  agentId: string;
  jobId: string | null;
  jobType: string | null;
  chosen: boolean;
  score: number | null;
  breakdown: PlacementScoreBreakdown | null;
  reasons: string[];
  rejected: Array<{ jobId: string; reason: string; score?: number }>;
  policyMode: FleetPolicyMode;
};

export type JobReservation = {
  jobId: string;
  agentId: string;
  reservedAt: number;
  expiresAt: number;
  reason: string;
};

export type JobCooldown = {
  jobId: string;
  until: number;
  failures: number;
  reason: string;
};

export type MachinePolicyState = {
  machineId: string;
  agentId: string | null;
  hostname: string | null;
  mode: FleetPolicyMode | 'normal';
  pinnedMissionIds: string[];
  pinnedSourceIds: string[];
  pinnedBrowserProfiles: string[];
  updatedAt: string;
};

export type OrchestratorSnapshot = {
  generatedAt: string;
  policyDefault: FleetPolicyMode;
  machines: MachinePolicyState[];
  reservations: JobReservation[];
  cooldowns: JobCooldown[];
  recentDecisions: PlacementDecision[];
  stats: {
    assignments: number;
    rejections: number;
    reassigns: number;
    failovers: number;
    reservationsExpired: number;
  };
};
