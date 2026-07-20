import type { BrowserSession } from '@prisma/client';
import { Prisma } from '@prisma/client';
import os from 'os';
import { prisma } from '../prisma';
import type { WorkerConfig } from './config';

export type BrowserSessionStatus =
  | 'starting'
  | 'ready'
  | 'running'
  | 'needs_login'
  | 'error'
  | 'offline';

export type MetadataProvider = () => Record<string, unknown> | Promise<Record<string, unknown>>;

export class HeartbeatService {
  private sessionId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: BrowserSessionStatus = 'starting';
  private getMetadata: MetadataProvider | null = null;

  constructor(private readonly config: WorkerConfig) {}

  async register(
    getCurrentUrl?: () => Promise<string | null>,
    metadata?: Record<string, unknown> | MetadataProvider,
  ): Promise<BrowserSession> {
    this.getMetadata =
      typeof metadata === 'function' ? metadata : metadata ? () => metadata : null;

    const existing = await prisma.browserSession.findFirst({
      where: { workerId: this.config.workerId },
      orderBy: { updatedAt: 'desc' },
    });

    const initialMeta = this.getMetadata ? await this.getMetadata() : {};

    const data = {
      name: this.config.sessionName,
      workerId: this.config.workerId,
      profilePath: this.config.profileDir,
      companyId: this.config.companyId,
      status: 'starting' as const,
      lastHeartbeatAt: new Date(),
      lastError: null as string | null,
      metadata: initialMeta as Prisma.InputJsonValue,
    };

    const session = existing
      ? await prisma.browserSession.update({ where: { id: existing.id }, data })
      : await prisma.browserSession.create({ data });

    this.sessionId = session.id;
    this.status = 'starting';

    // Retire zombie sessions from prior PID-based workerIds on this host.
    try {
      const { retireSiblingSessions } = await import('../modules/control-plane/agentRegistry');
      const hostname = os.hostname();
      await retireSiblingSessions({
        keepSessionId: session.id,
        machineId: process.env.AGENT_MACHINE_ID?.trim() || hostname,
        hostname,
        workerIdPrefix: `worker-${hostname.replace(/[^a-zA-Z0-9-]/g, '-')}`,
      });
    } catch (err) {
      console.warn(
        '[agent-worker] retireSiblingSessions failed:',
        err instanceof Error ? err.message : err,
      );
    }

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.pulse(getCurrentUrl);
    }, this.config.heartbeatIntervalMs);

    return session;
  }

  async setStatus(status: BrowserSessionStatus): Promise<void> {
    this.status = status;
    if (!this.sessionId) return;
    await prisma.browserSession.update({
      where: { id: this.sessionId },
      data: { status, lastHeartbeatAt: new Date() },
    });
  }

  async pulse(getCurrentUrl?: () => Promise<string | null>): Promise<void> {
    if (!this.sessionId) return;
    if (this.status === 'needs_login' || this.status === 'offline') return;

    let currentUrl: string | null = null;
    try {
      currentUrl = getCurrentUrl ? await getCurrentUrl() : null;
    } catch {
      currentUrl = null;
    }

    let metadata: Prisma.InputJsonValue | undefined;
    if (this.getMetadata) {
      try {
        metadata = (await this.getMetadata()) as Prisma.InputJsonValue;
      } catch {
        metadata = undefined;
      }
    }

    await prisma.browserSession.update({
      where: { id: this.sessionId },
      data: {
        status: this.status === 'starting' ? 'ready' : this.status,
        lastHeartbeatAt: new Date(),
        ...(currentUrl ? { currentUrl } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  }

  async markOffline(lastError?: string): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'offline';
    if (!this.sessionId) return;

    await prisma.browserSession.update({
      where: { id: this.sessionId },
      data: {
        status: 'offline',
        lastHeartbeatAt: new Date(),
        ...(lastError ? { lastError: lastError.slice(0, 500) } : {}),
      },
    });
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
