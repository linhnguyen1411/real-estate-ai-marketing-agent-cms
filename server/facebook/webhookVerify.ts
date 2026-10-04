import crypto from 'crypto';
import { getFacebookConfig } from './config';

export function verifyFacebookWebhookChallenge(query: Record<string, unknown>) {
  const mode = String(query['hub.mode'] || '');
  const token = String(query['hub.verify_token'] || '');
  const challenge = String(query['hub.challenge'] || '');
  const { verifyToken } = getFacebookConfig();

  if (mode !== 'subscribe' || !token || !verifyToken) {
    return null;
  }

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(verifyToken);

  if (tokenBuf.length !== expectedBuf.length) {
    return null;
  }

  try {
    if (crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return challenge;
    }
  } catch {
    return null;
  }

  return null;
}
