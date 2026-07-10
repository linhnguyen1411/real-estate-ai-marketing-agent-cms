import type { BrowserSession } from '@prisma/client';
import { prisma } from '../prisma';
import type { WorkerConfig } from './config';

export class HeartbeatService {
  private sessionId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: WorkerConfig) {}

  async register(getCurrentUrl?: () => Promise<string | null>): Promise<BrowserSession> {
    const existing = await prisma.browserSession.findFirst({
      where: { workerId: this.config.workerId },
      orderBy: { updatedAt: 'desc' },
    });

    const data = {
      name: this.config.sessionName,
      workerId: this.config.workerId,
      profilePath: this.config.profileDir,
      companyId: this.config.companyId,
      status: 'online',
      lastHeartbeatAt: new Date(),
      lastError: null,
    };

    const session = existing
      ? await prisma.browserSession.update({ where: { id: existing.id }, data })
      : await prisma.browserSession.create({ data });

    this.sessionId = session.id;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.pulse(getCurrentUrl);
    }, this.config.heartbeatIntervalMs);

    return session;
  }

  async pulse(getCurrentUrl?: () => Promise<string | null>): Promise<void> {
    if (!this.sessionId) return;

    let currentUrl: string | null = null;
    try {
      currentUrl = getCurrentUrl ? await getCurrentUrl() : null;
    } catch {
      currentUrl = null;
    }

    await prisma.browserSession.update({
      where: { id: this.sessionId },
      data: {
        status: 'online',
        lastHeartbeatAt: new Date(),
        ...(currentUrl ? { currentUrl } : {}),
      },
    });
  }

  async markOffline(lastError?: string): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.sessionId) return;

    await prisma.browserSession.update({
      where: { id: this.sessionId },
      data: {
        status: 'offline',
        lastHeartbeatAt: new Date(),
        ...(lastError ? { lastError } : {}),
      },
    });
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
