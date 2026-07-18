/**
 * Ports for Execution Agent / WorkerLoop — DI, no global singleton.
 * Control-plane ops go through these; business handlers stay separate adapters.
 */

import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from './browserManager';

export type ClaimOptions = {
  capabilities?: string[];
};

export interface JobQueuePort {
  claimNext(workerId: string, options?: ClaimOptions): Promise<AgentJob | null>;
  complete(jobId: string, result: Record<string, unknown>): Promise<void>;
  release(jobId: string, errorMessage: string): Promise<void>;
  requeue(jobId: string, reason: string): Promise<void>;
}

export type JobHandler = (
  job: AgentJob,
  browser: BrowserManager,
) => Promise<Record<string, unknown>>;

/** Registry + Adapter — no switch-case dispatch. */
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(type: string, handler: JobHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  async execute(job: AgentJob, browser: BrowserManager): Promise<Record<string, unknown>> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      throw new Error(`Job type "${job.type}" chưa được đăng ký trên Execution Agent.`);
    }
    return handler(job, browser);
  }

  listTypes(): string[] {
    return [...this.handlers.keys()];
  }
}

export interface AgentHeartbeatPort {
  register(metadata: Record<string, unknown>): Promise<{ sessionId: string }>;
  pulse(input: {
    metadata?: Record<string, unknown>;
    currentUrl?: string | null;
    status?: string;
  }): Promise<void>;
  markOffline(lastError?: string): Promise<void>;
}

/** Map job type → required capability (agent only claims matching jobs). */
export function capabilityForJobType(jobType: string): string | null {
  switch (jobType) {
    case 'scan_source':
    case 'source_scan':
    case 'visit_url':
      return 'scan';
    case 'publish_social':
      return 'publish';
    case 'send_message':
    case 'messaging':
      return 'messaging';
    case 'post_comment':
    case 'comment':
      return 'comment';
    case 'health_check':
      return null; // any agent
    default:
      return 'scan';
  }
}

export function jobTypeAllowedByCapabilities(
  jobType: string,
  capabilities: string[] | undefined,
): boolean {
  if (!capabilities || capabilities.length === 0) return true;
  const need = capabilityForJobType(jobType);
  if (!need) return true;
  return capabilities.includes(need) || capabilities.includes('browser');
}
