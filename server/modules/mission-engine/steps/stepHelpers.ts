import { prisma } from '../../../prisma';
import type { CompactStepOutput, WorkflowStepContext } from '../domain/workflowTypes';

export async function requireScannedContent(ctx: WorkflowStepContext) {
  if (!ctx.scannedContentId) {
    throw new Error('scannedContentId is required for this step');
  }
  const content = await prisma.scannedContent.findUnique({
    where: { id: ctx.scannedContentId },
    include: { source: true },
  });
  if (!content) {
    throw new Error(`ScannedContent not found: ${ctx.scannedContentId}`);
  }
  return content;
}

export function findOutputByStepType(
  ctx: WorkflowStepContext,
  stepType: string,
): CompactStepOutput | undefined {
  for (const step of ctx.pipelineSnapshot.steps) {
    if (step.type !== stepType) continue;
    const raw = ctx.previousStepOutputs[step.id];
    if (raw && typeof raw === 'object') return raw as CompactStepOutput;
  }
  return undefined;
}

export function getMissionRules(ctx: WorkflowStepContext): Record<string, unknown> {
  const raw = ctx.previousStepOutputs.missionRules;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function resolveFindingId(ctx: WorkflowStepContext): string | null {
  if (ctx.findingId) return ctx.findingId;
  for (const output of Object.values(ctx.previousStepOutputs)) {
    if (!output || typeof output !== 'object') continue;
    const o = output as CompactStepOutput;
    const id = o.resourceIds?.findingId;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

export function contentTitle(content: { authorName?: string | null; contentText: string }): string {
  const fromAuthor = (content.authorName || '').trim();
  if (fromAuthor) return fromAuthor.slice(0, 90);
  const firstLine = (content.contentText || '').split('\n')[0]?.trim() || '';
  return firstLine.slice(0, 90) || 'Untitled post';
}
