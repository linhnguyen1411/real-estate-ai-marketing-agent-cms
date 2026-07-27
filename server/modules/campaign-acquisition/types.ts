/**
 * Campaign Acquisition Request — contract + lifecycle (ADR-007).
 * Planning owns campaign; this module owns the bridge contract.
 */

export type AcquisitionLifecycleStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_RESULTS'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED'
  | 'BLOCKED';

export type AcquisitionApprovalState =
  | 'planning_approved'
  | 'pending_planning'
  | 'blocked'
  | 'rejected';

export type CampaignAcquisitionResult = {
  sourcesScanned: number;
  postsSeen: number;
  candidates: number;
  qualified: number;
  hot: number;
  findingIds: string[];
  jobIds: string[];
  sourceIds: string[];
  errors: string[];
  coverage: string;
  nextAction: string | null;
  summarizedAt: string;
};

export type CampaignAcquisitionRequest = {
  id: string;
  campaignId: string;
  missionProposalId: string | null;
  goal: string;
  keywords: string[];
  sourceTypes: string[];
  targetProperty: string | null;
  location: string | null;
  budget: string | null;
  priority: string;
  requestedBy: string;
  approvalState: AcquisitionApprovalState;
  status: AcquisitionLifecycleStatus;
  idempotencyKey: string;
  attempt: number;
  jobIds: string[];
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastError: string | null;
  result: CampaignAcquisitionResult | null;
};

export type CampaignAcquisitionSnapshot = {
  request: CampaignAcquisitionRequest | null;
  status: AcquisitionLifecycleStatus | 'NOT_STARTED';
  sources: number;
  postsScanned: number;
  candidates: number;
  qualified: number;
  hot: number;
  lastRunAt: string | null;
  coverage: string | null;
  errors: string[];
  nextAction: string | null;
};
