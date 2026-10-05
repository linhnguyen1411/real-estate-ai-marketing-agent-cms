/**
 * Utility to safely wrap fire-and-forget async operations with logging,
 * preventing unhandled promise rejections and silent crashes.
 */
export function safeRun(name: string, fn: () => Promise<unknown> | unknown): void {
  try {
    const result = fn();
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch((err: unknown) => {
        console.error(`[SAFE_RUN_ERROR] Async task "${name}" failed:`, err instanceof Error ? err.stack || err.message : err);
      });
    }
  } catch (err: unknown) {
    console.error(`[SAFE_RUN_ERROR] Synchronous task "${name}" failed:`, err instanceof Error ? err.stack || err.message : err);
  }
}
