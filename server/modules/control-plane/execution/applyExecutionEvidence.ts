/**
 * G1 — Apply execution evidence returned by stateless agents (Control Plane / CMS only).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma';
import type { ExecutionEvidence } from './jobPayloadContract';

export async function applyExecutionEvidence(
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const evidence = result.evidence as ExecutionEvidence | undefined;
  if (!evidence) return;

  if (Array.isArray(evidence.sourcePatches)) {
    for (const patch of evidence.sourcePatches) {
      if (!patch?.sourceId) continue;
      const data: Prisma.AgentSourceUpdateInput = {};
      if (patch.checkpoint !== undefined) data.checkpoint = patch.checkpoint as Prisma.InputJsonValue;
      if (patch.lastError !== undefined) data.lastError = patch.lastError;
      if (patch.nextScanAt) data.nextScanAt = new Date(patch.nextScanAt);
      if (patch.lastScannedAt) data.lastScannedAt = new Date(patch.lastScannedAt);
      if (Object.keys(data).length === 0) continue;
      await prisma.agentSource.update({ where: { id: patch.sourceId }, data }).catch(() => undefined);
    }
  }
}
