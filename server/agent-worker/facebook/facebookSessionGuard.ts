import fs from 'fs';
import path from 'path';
import type { Page } from 'playwright';
import { prisma } from '../../prisma';
import type { FacebookAuthBlockKind } from './facebookCheckpointDetector';
import { FacebookAuthBlockedError } from './facebookCheckpointDetector';

export async function handleFacebookAuthBlocked(input: {
  workerId: string;
  companyId: string | null;
  sourceId: string;
  sourceName: string;
  kind: FacebookAuthBlockKind;
  reason: string;
}): Promise<never> {
  const message = input.reason || `Facebook ${input.kind} — cần đăng nhập thủ công.`;

  await prisma.browserSession.updateMany({
    where: { workerId: input.workerId },
    data: {
      status: 'needs_login',
      lastError: message,
      lastHeartbeatAt: new Date(),
    },
  });

  const eventKey = `fb-auth:${input.workerId}:${input.kind ?? 'unknown'}`;
  try {
    await prisma.agentNotification.create({
      data: {
        companyId: input.companyId,
        type: 'browser_needs_login',
        eventKey,
        title: 'Browser cần đăng nhập lại',
        message: `${input.sourceName}: ${message}`,
        severity: 'high',
        status: 'unread',
        data: {
          sourceId: input.sourceId,
          workerId: input.workerId,
          kind: input.kind,
        },
      },
    });
  } catch (error) {
    console.warn('[facebook] Could not create auth notification:', error);
  }

  throw new FacebookAuthBlockedError(input.kind, message);
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
  return process.env.AGENT_WORKER_ID?.trim() || `worker-${process.pid}`;
}
