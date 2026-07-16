/**
 * Mission → Social Publishing bridge.
 *
 * Wire later from mission engine content-generation steps, e.g.:
 *   import { createMissionSocialDraft } from '../modules/social-publishing/missionIntegration';
 *   await createMissionSocialDraft({ companyId, body, title, missionId, stepId });
 *
 * NEVER auto-approves — drafts land in `pending_review` for human approval.
 */
import { createAiGeneratedDraft } from './draftService';
import type { MediaInput } from './mediaValidation';

export async function createMissionSocialDraft(input: {
  companyId?: string | null;
  body: string;
  title?: string | null;
  linkUrl?: string | null;
  missionId?: string;
  stepId?: string;
  createdBy?: string | null;
  media?: MediaInput[];
  metadata?: Record<string, unknown>;
}) {
  return createAiGeneratedDraft({
    companyId: input.companyId,
    body: input.body,
    title: input.title,
    linkUrl: input.linkUrl,
    createdBy: input.createdBy ?? 'mission',
    media: input.media,
    metadata: {
      ...(input.metadata || {}),
      source: 'mission',
      missionId: input.missionId,
      stepId: input.stepId,
      ai_generated: true,
      // Explicit: mission must NOT set approved / scheduled here.
      autoApproved: false,
    },
  });
}
