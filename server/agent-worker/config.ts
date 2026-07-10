import fs from 'fs';
import os from 'os';
import path from 'path';

export interface WorkerConfig {
  workerId: string;
  profileDir: string;
  headless: boolean;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  companyId: string | null;
  sessionName: string;
}

export function loadWorkerConfig(): WorkerConfig {
  const workerId =
    process.env.AGENT_WORKER_ID?.trim() ||
    `worker-${os.hostname().replace(/[^a-zA-Z0-9-]/g, '-')}-${process.pid}`;

  const profileDir = path.resolve(
    process.env.AGENT_BROWSER_PROFILE_DIR?.trim() ||
      path.join(process.cwd(), 'data', 'browser-profiles', 'default'),
  );

  const headless = process.env.AGENT_HEADLESS !== 'false';
  const pollIntervalMs = Math.max(500, Number(process.env.AGENT_POLL_INTERVAL_MS || 3000));
  const heartbeatIntervalMs = Math.min(
    30_000,
    Math.max(15_000, Number(process.env.AGENT_HEARTBEAT_INTERVAL_MS || 20_000)),
  );

  const companyId = process.env.AGENT_COMPANY_ID?.trim() || null;
  const sessionName = process.env.AGENT_SESSION_NAME?.trim() || `Browser Worker (${workerId})`;

  fs.mkdirSync(profileDir, { recursive: true });

  return {
    workerId,
    profileDir,
    headless,
    pollIntervalMs,
    heartbeatIntervalMs,
    companyId,
    sessionName,
  };
}
