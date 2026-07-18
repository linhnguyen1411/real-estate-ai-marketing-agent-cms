/**
 * HTTP client — Execution Agent ↔ Control Plane Runtime API only.
 * No Prisma. No CMS module imports beyond this client's types.
 */

export type RuntimeAgentClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
};

export class RuntimeAgentClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RuntimeAgentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as { status: string; data?: T; message?: string };
    if (!res.ok || json.status !== 'success') {
      throw new Error(json.message || `Runtime API ${method} ${path} → ${res.status}`);
    }
    return json.data as T;
  }

  register(body: Record<string, unknown>) {
    return this.request<{
      sessionId: string;
      agentId: string;
      status: string;
      lastHeartbeatAt: string | null;
    }>('POST', '/api/agent/runtime/register', body);
  }

  heartbeat(body: Record<string, unknown>) {
    return this.request<{
      sessionId: string;
      agentId: string;
      status: string;
      lastHeartbeatAt: string | null;
    }>('POST', '/api/agent/runtime/heartbeat', body);
  }

  offline(body: Record<string, unknown>) {
    return this.request<{ agentId: string; status: string; requeued: number }>(
      'POST',
      '/api/agent/runtime/offline',
      body,
    );
  }

  claimJob(body: Record<string, unknown>) {
    return this.request<Record<string, unknown> | null>(
      'POST',
      '/api/agent/runtime/jobs/claim',
      body,
    );
  }

  completeJob(jobId: string, result: Record<string, unknown>) {
    return this.request('POST', `/api/agent/runtime/jobs/${jobId}/complete`, { result });
  }

  releaseJob(jobId: string, errorMessage: string) {
    return this.request('POST', `/api/agent/runtime/jobs/${jobId}/release`, {
      errorMessage,
    });
  }

  requeueJob(jobId: string, reason: string) {
    return this.request('POST', `/api/agent/runtime/jobs/${jobId}/requeue`, { reason });
  }

  reclaim(body: Record<string, unknown>) {
    return this.request<{ reclaimed: number }>(
      'POST',
      '/api/agent/runtime/jobs/reclaim',
      body,
    );
  }
}
