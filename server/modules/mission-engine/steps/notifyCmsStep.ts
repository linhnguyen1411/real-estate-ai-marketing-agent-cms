import { prisma } from '../../../prisma';
import {
  createAgentNotification,
  notifyFindingHighScore,
} from '../../../agent/agentNotificationService';
import type { WorkflowStepHandler } from './stepContract';
import { findOutputByStepType, requireScannedContent, resolveFindingId } from './stepHelpers';

export const notifyCmsStep: WorkflowStepHandler = {
  type: 'notify_cms',
  async execute(ctx) {
    const mode = String(ctx.step.config?.mode || 'finding');
    const minimumScore =
      typeof ctx.step.config?.minimumScore === 'number'
        ? ctx.step.config.minimumScore
        : 70;

    const findingId = resolveFindingId(ctx);
    if (findingId) {
      const finding = await prisma.agentFinding.findUnique({
        where: { id: findingId },
        select: {
          id: true,
          companyId: true,
          finalScore: true,
          score: true,
          title: true,
          sourceId: true,
          scannedContent: { select: { canonicalUrl: true } },
        },
      });
      if (!finding) {
        return {
          status: 'skipped',
          output: { notified: false, reason: 'finding_not_found' },
        };
      }

      const score = finding.finalScore ?? finding.score ?? 0;
      if (score < minimumScore) {
        return {
          status: 'skipped',
          output: { notified: false, reason: 'below_minimum_score', score },
        };
      }

      const result = await notifyFindingHighScore({
        companyId: finding.companyId,
        findingId: finding.id,
        score,
        title: finding.title,
        canonicalUrl: finding.scannedContent?.canonicalUrl,
        sourceId: finding.sourceId,
      });

      return {
        status: 'completed',
        output: { notified: result.created, notificationId: result.id },
        producedResources: result.id ? { notificationIds: [result.id] } : undefined,
        metrics: result.created ? { cmsNotifications: 1 } : undefined,
      };
    }

    if (mode === 'summary') {
      const content = await requireScannedContent(ctx);
      const summaryOut = findOutputByStepType(ctx, 'summarize');
      const summary =
        typeof summaryOut?.summary === 'string'
          ? summaryOut.summary
          : content.contentText.slice(0, 200);

      const result = await createAgentNotification({
        companyId: ctx.companyId,
        type: 'scan_summary',
        eventKey: `workflow-summary:${ctx.missionRunId}:${ctx.scannedContentId}:${ctx.step.id}`,
        title: `Workflow summary — ${content.source.name}`,
        message: summary,
        severity: 'info',
        data: {
          missionRunId: ctx.missionRunId,
          scannedContentId: ctx.scannedContentId,
          sourceId: content.sourceId,
        },
        link: { kind: 'source', sourceId: content.sourceId },
      });

      return {
        status: 'completed',
        output: { notified: result.created, mode: 'summary' },
        producedResources: result.id ? { notificationIds: [result.id] } : undefined,
      };
    }

    return {
      status: 'skipped',
      output: { notified: false, reason: 'no_finding_id' },
      warnings: ['notify_cms skipped — no findingId and not in summary mode'],
    };
  },
};
