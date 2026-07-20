/**
 * G1 — Collect execution evidence on worker; CMS applies on complete.
 */

import type { ExecutionEvidence } from '../../modules/control-plane/execution/jobPayloadContract';

export class ExecutionEvidenceSink {
  private readonly evidence: ExecutionEvidence = {};

  patchSource(input: {
    sourceId: string;
    checkpoint?: unknown;
    lastError?: string | null;
    nextScanAt?: Date | string | null;
    lastScannedAt?: Date | string | null;
  }): void {
    if (!this.evidence.sourcePatches) this.evidence.sourcePatches = [];
    this.evidence.sourcePatches.push({
      sourceId: input.sourceId,
      ...(input.checkpoint !== undefined ? { checkpoint: input.checkpoint } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.nextScanAt
        ? { nextScanAt: new Date(input.nextScanAt).toISOString() }
        : {}),
      ...(input.lastScannedAt
        ? { lastScannedAt: new Date(input.lastScannedAt).toISOString() }
        : {}),
    });
  }

  setPublishResult(result: Record<string, unknown>): void {
    this.evidence.publishResult = result;
  }

  setMetrics(metrics: Record<string, unknown>): void {
    this.evidence.metrics = metrics;
  }

  toJSON(): ExecutionEvidence {
    return { ...this.evidence };
  }
}
