import { getGraphBaseUrl } from './config';
import { getActivePageAccessToken } from './facebookDb';

/**
 * Sprint 1: stub only — private reply requires valid scopes and user-initiated context.
 * Never call automatically for likes/reactions.
 */
export async function canSendPrivateReply(commentId: string, pageId?: string): Promise<boolean> {
  if (!commentId) return false;
  const token = await getActivePageAccessToken(pageId);
  if (!token) return false;

  try {
    const url = `${getGraphBaseUrl()}/${encodeURIComponent(commentId)}?fields=can_reply_privately&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    if (!response.ok) return false;
    const data = await response.json() as { can_reply_privately?: boolean };
    return Boolean(data.can_reply_privately);
  } catch {
    return false;
  }
}

export async function sendPrivateReply(commentId: string, message: string, pageId?: string) {
  const allowed = await canSendPrivateReply(commentId, pageId);
  if (!allowed) {
    throw new Error('Private reply not permitted for this comment');
  }
  const token = await getActivePageAccessToken(pageId);
  if (!token) throw new Error('Missing page access token');

  const url = `${getGraphBaseUrl()}/${encodeURIComponent(commentId)}/private_replies`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      access_token: token,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Private reply failed: ${err}`);
  }
  return response.json();
}
