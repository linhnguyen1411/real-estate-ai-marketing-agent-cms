/**
 * Campaign Acquisition Bridge (ADR-007)
 * Planning requests buyers; bridge fulfills via public enqueueSourceScan + Lead/Sales reuse.
 * Does not modify Scanner Runtime / Fleet / Queue / Browser / Publisher cores.
 */

export type {
  AcquisitionLifecycleStatus,
  AcquisitionApprovalState,
  CampaignAcquisitionRequest,
  CampaignAcquisitionResult,
  CampaignAcquisitionSnapshot,
} from './types';

export { buildAcquisitionIdempotencyKey } from './idempotency';

export {
  ensureAcquisitionRequest,
  queueAcquisitionScans,
  summarizeAcquisitionResults,
  startAcquisitionAfterCampaignApproval,
  getCampaignAcquisitionSnapshot,
  toAcquisitionSnapshot,
} from './bridgeService';
