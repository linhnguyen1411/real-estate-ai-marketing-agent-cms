/**
 * Local (in-process) JobQueuePort — wraps existing jobClaimer.
 * Used by legacy agent:worker; Execution Agent uses HttpJobQueuePort instead.
 */

import {
  claimNextJob,
  completeJob,
  requeueRunningJob,
  releaseJobToQueue,
} from './jobClaimer';
import type { ClaimOptions, JobQueuePort } from './ports';

export function createPrismaJobQueuePort(): JobQueuePort {
  return {
    claimNext: (workerId, options?: ClaimOptions) => claimNextJob(workerId, options),
    complete: (jobId, result) => completeJob(jobId, result),
    release: (jobId, errorMessage) => releaseJobToQueue(jobId, errorMessage),
    requeue: (jobId, reason) => requeueRunningJob(jobId, reason),
  };
}
