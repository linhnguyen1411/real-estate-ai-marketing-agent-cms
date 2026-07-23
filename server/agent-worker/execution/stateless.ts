/**
 * G1 — Stateless Execution Agent runtime detection.
 */

export function isStatelessExecutionAgent(): boolean {
  const raw = process.env.EXECUTION_AGENT_STATELESS?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function requireHydratedExecution(jobPayload: unknown, jobType: string): void {
  if (!isStatelessExecutionAgent()) return;
  const payload =
    jobPayload && typeof jobPayload === 'object'
      ? (jobPayload as { execution?: { schemaVersion?: number } })
      : null;
  if (payload?.execution?.schemaVersion !== 1) {
    throw new Error(
      `Stateless Execution Agent requires hydrated payload for ${jobType}. Control Plane must hydrate at claim.`,
    );
  }
}
