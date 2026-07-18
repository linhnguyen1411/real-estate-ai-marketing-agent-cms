/**
 * Heartbeat over Runtime API for Execution Agent.
 */

import type { RuntimeAgentClient } from './runtimeClient';

export class HttpAgentHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;

  constructor(
    private readonly client: RuntimeAgentClient,
    private readonly agentId: string,
    private readonly intervalMs: number,
    private readonly getMetadata: () => Record<string, unknown> | Promise<Record<string, unknown>>,
    private readonly getCurrentUrl?: () => Promise<string | null>,
  ) {}

  async register(extra?: Record<string, unknown>): Promise<{ sessionId: string }> {
    const metadata = { ...(await this.getMetadata()), ...(extra || {}) };
    const res = await this.client.register({
      agentId: this.agentId,
      hostname: String(metadata.hostname || ''),
      version: String(metadata.version || ''),
      capabilities: Array.isArray(metadata.capabilities) ? metadata.capabilities : undefined,
      metadata,
      sessionName: `Execution Agent (${this.agentId})`,
      profilePath: String(metadata.profilePath || 'execution-agent'),
    });
    this.sessionId = res.sessionId;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.pulse();
    }, this.intervalMs);

    return { sessionId: res.sessionId };
  }

  async pulse(): Promise<void> {
    if (!this.sessionId) return;
    let currentUrl: string | null = null;
    try {
      currentUrl = this.getCurrentUrl ? await this.getCurrentUrl() : null;
    } catch {
      currentUrl = null;
    }
    const metadata = await this.getMetadata();
    await this.client.heartbeat({
      agentId: this.agentId,
      sessionId: this.sessionId,
      status: 'ready',
      currentUrl,
      metadata,
    });
  }

  async markOffline(lastError?: string): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.client.offline({
      agentId: this.agentId,
      lastError,
      requeueJobs: true,
    });
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
