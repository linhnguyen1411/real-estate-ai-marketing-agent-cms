import { getFacebookConfig } from './config';

export function verifyFacebookWebhookChallenge(query: Record<string, unknown>) {
  const mode = String(query['hub.mode'] || '');
  const token = String(query['hub.verify_token'] || '');
  const challenge = String(query['hub.challenge'] || '');
  const { verifyToken } = getFacebookConfig();

  if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
    return challenge;
  }
  return null;
}
