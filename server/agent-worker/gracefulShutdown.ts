export type ShutdownHandler = (signal: string) => Promise<void>;

const registered: ShutdownHandler[] = [];
let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function registerGracefulShutdown(handler: ShutdownHandler): void {
  registered.push(handler);

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.once(signal, () => {
      void runShutdown(signal);
    });
  }
}

async function runShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[agent-worker] Nhận ${signal} — graceful shutdown...`);

  for (const handler of registered) {
    try {
      await handler(signal);
    } catch (error) {
      console.error('[agent-worker] Shutdown handler lỗi:', error);
    }
  }

  console.log('[agent-worker] Đã dừng.');
  process.exit(0);
}
