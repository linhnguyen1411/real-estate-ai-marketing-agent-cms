import fs from 'fs';
import path from 'path';
import type { Page } from 'playwright';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { notifyBrowserNeedsLogin } from '../../agent/agentNotificationService';
import { loadWorkerConfig } from '../config';
import type {
  FacebookAuthBlockKind,
  FacebookSessionErrorCode,
} from './facebookCheckpointDetector';
import { FacebookAuthBlockedError } from './facebookCheckpointDetector';

export async function handleFacebookAuthBlocked(input: {
  workerId: string;
  companyId: string | null;
  sourceId: string;
  sourceName: string;
  kind: FacebookAuthBlockKind;
  reason: string;
  errorCode?: FacebookSessionErrorCode;
}): Promise<never> {
  const errorCode =
    input.errorCode ||
    (input.kind === 'login'
      ? 'FACEBOOK_LOGIN_REQUIRED'
      : input.kind === 'checkpoint'
        ? 'FACEBOOK_CHECKPOINT'
        : input.kind === 'challenge' || input.kind === 'captcha'
          ? 'FACEBOOK_CHALLENGE'
          : 'FACEBOOK_SESSION_UNKNOWN');

  // Safe message — no cookies, tokens, or long encrypted query strings
  const message = `${errorCode}: ${input.reason || `Facebook ${input.kind}`}`;

  const sessions = await prisma.browserSession.findMany({
    where: { workerId: input.workerId },
    select: { id: true },
    take: 1,
  });

  await prisma.browserSession.updateMany({
    where: { workerId: input.workerId },
    data: {
      status: 'needs_login',
      lastError: message,
      lastHeartbeatAt: new Date(),
      metadata: {
        lastAuthErrorCode: errorCode,
        lastAuthKind: input.kind,
      } as Prisma.InputJsonValue,
    },
  });

  await notifyBrowserNeedsLogin({
    companyId: input.companyId,
    workerId: input.workerId,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    kind: input.kind ?? 'unknown',
    reason: message,
    sessionId: sessions[0]?.id,
  });

  throw new FacebookAuthBlockedError(input.kind, message, errorCode);
}

export async function captureFacebookDebugArtifact(
  page: Page,
  label: string,
): Promise<string | null> {
  if (process.env.AGENT_FB_DEBUG_SCREENSHOTS !== '1') return null;

  const dir = path.resolve(process.cwd(), 'data', 'browser-debug', 'facebook');
  fs.mkdirSync(dir, { recursive: true });
  const safe = label.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60);
  const file = path.join(dir, `${Date.now()}-${safe}.png`);

  await page.screenshot({ path: file, fullPage: false });
  console.log(`[facebook-debug] Screenshot: ${file}`);
  return file;
}

export function getWorkerId(): string {
  return loadWorkerConfig().workerId;
}
