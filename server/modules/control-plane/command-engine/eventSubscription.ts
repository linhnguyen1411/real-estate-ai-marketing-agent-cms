/**
 * Runtime Event subscription for Command / Report engines.
 * Read-only consumer over Runtime Event Bus — never queries Worker.
 */

import { listRuntimeEvents } from '../runtimeEventBus';
import type { RuntimeEventRecord, RuntimeEventType } from '../types';

export type EventSubscriptionOptions = {
  companyId?: string | null;
  types?: RuntimeEventType[];
  since?: Date;
  limit?: number;
};

/** Subscribe = pull recent matching events (console / report projection). */
export async function subscribeRuntimeEvents(
  options: EventSubscriptionOptions = {},
): Promise<RuntimeEventRecord[]> {
  return listRuntimeEvents({
    companyId: options.companyId,
    types: options.types,
    since: options.since,
    limit: options.limit ?? 50,
  });
}

export function summarizeEventStream(events: RuntimeEventRecord[]): {
  counts: Record<string, number>;
  recent: string[];
} {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return {
    counts,
    recent: events.slice(0, 8).map(e => `${e.type}@${e.createdAt.slice(11, 19)}`),
  };
}
