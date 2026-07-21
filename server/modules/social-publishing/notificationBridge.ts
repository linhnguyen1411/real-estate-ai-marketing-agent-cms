import { createAgentNotification } from '../../agent/agentNotificationService';
import { appendAuditLog } from './auditService';
import { notification } from '../../notifications/notificationRouter';

/** Stable eventKey builders — tested for notification idempotency. */
export function buildPublishSuccessEventKey(publishJobId: string): string {
  return `social_publish_success:${publishJobId}`;
}

export function buildPublishFailureEventKey(
  publishJobId: string,
  errorCode?: string | null,
): string {
  return `social_publish_failed:${publishJobId}:${errorCode || 'unknown'}`;
}

export function buildChannelNeedsLoginEventKey(channelId: string): string {
  return `social_channel_needs_login:${channelId}`;
}

export async function notifyPublishSuccess(input: {
  companyId?: string | null;
  publishJobId: string;
  channelId: string;
  externalPostId?: string;
}): Promise<void> {
  await appendAuditLog({
    companyId: input.companyId,
    entityType: 'SocialPublishJob',
    entityId: input.publishJobId,
    action: 'notify_success',
    metadata: { channelId: input.channelId, externalPostId: input.externalPostId },
  });
  await createAgentNotification({
    companyId: input.companyId,
    type: 'social_publish_success',
    eventKey: buildPublishSuccessEventKey(input.publishJobId),
    title: 'Đăng bài thành công',
    message: `Job ${input.publishJobId} đã đăng lên kênh ${input.channelId}${
      input.externalPostId ? ` (#${input.externalPostId})` : ''
    }.`,
    severity: 'info',
    data: {
      publishJobId: input.publishJobId,
      channelId: input.channelId,
      externalPostId: input.externalPostId,
    },
    link: { kind: 'job', jobId: input.publishJobId },
  });
  void notification
    .send({
      type: 'publish_success',
      payload: {
        publishJobId: input.publishJobId,
        entityId: input.publishJobId,
        channelId: input.channelId,
        summary: `Đăng thành công${input.externalPostId ? ` #${input.externalPostId}` : ''}`,
        recommendation: 'Kiểm tra permalink trên Timeline.',
      },
      dedupeKey: buildPublishSuccessEventKey(input.publishJobId),
      immediate: true,
    })
    .catch(() => undefined);
}

export async function notifyPublishFailure(input: {
  companyId?: string | null;
  publishJobId: string;
  channelId: string;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  await appendAuditLog({
    companyId: input.companyId,
    entityType: 'SocialPublishJob',
    entityId: input.publishJobId,
    action: 'notify_failure',
    metadata: {
      channelId: input.channelId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    },
  });
  await createAgentNotification({
    companyId: input.companyId,
    type: 'social_publish_failed',
    eventKey: buildPublishFailureEventKey(input.publishJobId, input.errorCode),
    title: 'Đăng bài thất bại',
    message: input.errorMessage || `Job ${input.publishJobId} thất bại.`,
    severity: 'error',
    data: {
      publishJobId: input.publishJobId,
      channelId: input.channelId,
      errorCode: input.errorCode,
    },
    link: { kind: 'job', jobId: input.publishJobId },
  });
  void notification
    .send({
      type: 'publish_failed',
      payload: {
        publishJobId: input.publishJobId,
        entityId: input.publishJobId,
        channelId: input.channelId,
        summary: input.errorMessage || 'Đăng thất bại',
        detail: input.errorCode || undefined,
        recommendation: 'Retry hoặc kiểm tra evidence.',
      },
      dedupeKey: buildPublishFailureEventKey(input.publishJobId, input.errorCode),
      immediate: true,
    })
    .catch(() => undefined);
}

export async function notifyChannelNeedsLogin(input: {
  companyId?: string | null;
  channelId: string;
  reason?: string;
}): Promise<void> {
  await appendAuditLog({
    companyId: input.companyId,
    entityType: 'SocialChannel',
    entityId: input.channelId,
    action: 'notify_needs_login',
    metadata: { reason: input.reason },
  });
  await createAgentNotification({
    companyId: input.companyId,
    type: 'social_channel_needs_login',
    eventKey: buildChannelNeedsLoginEventKey(input.channelId),
    title: 'Kênh cần đăng nhập lại',
    message: input.reason || `Channel ${input.channelId} cần login / refresh session.`,
    severity: 'warning',
    data: { channelId: input.channelId },
    link: { kind: 'notifications' },
  });
}
