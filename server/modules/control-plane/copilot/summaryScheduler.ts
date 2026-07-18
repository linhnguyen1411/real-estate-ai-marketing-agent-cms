/**
 * Periodic Copilot summary (08:00 / 12:00 / 18:00 Asia/Ho_Chi_Minh).
 */

import type { CopilotClock } from './types';
import type { CopilotControlPlanePort } from './ports';

export type SummarySlot = 'morning' | 'noon' | 'evening';

const SLOT_HOURS: Record<SummarySlot, number> = {
  morning: 8,
  noon: 12,
  evening: 18,
};

export function hourInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find(p => p.type === 'hour')?.value;
  return Number(hour);
}

export function resolveSummarySlot(date: Date, timeZone: string): SummarySlot | null {
  const hour = hourInTimeZone(date, timeZone);
  if (hour === SLOT_HOURS.morning) return 'morning';
  if (hour === SLOT_HOURS.noon) return 'noon';
  if (hour === SLOT_HOURS.evening) return 'evening';
  return null;
}

export async function buildPeriodicSummary(
  port: CopilotControlPlanePort,
  slot: SummarySlot,
): Promise<{ text: string; lines: string[] }> {
  const fromPort = await port.buildSummary(slot);
  return fromPort;
}

export type SummaryNotifier = {
  send(text: string): Promise<void>;
};

export function createSummaryScheduler(input: {
  portFactory: () => Promise<CopilotControlPlanePort | null>;
  notifier: SummaryNotifier;
  clock?: CopilotClock;
  tickMs?: number;
  /** Test: force slot */
  forceSlot?: SummarySlot | null;
}): { start(): void; stop(): void; tickOnce(): Promise<boolean> } {
  const clock = input.clock ?? { now: () => new Date(), timeZone: 'Asia/Ho_Chi_Minh' };
  const tickMs = input.tickMs ?? 60_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  const sentKeys = new Set<string>();

  const tickOnce = async (): Promise<boolean> => {
    const now = clock.now();
    const slot = input.forceSlot ?? resolveSummarySlot(now, clock.timeZone);
    if (!slot) return false;
    const dayKey = `${now.toISOString().slice(0, 10)}:${slot}`;
    if (sentKeys.has(dayKey)) return false;
    const port = await input.portFactory();
    if (!port) return false;
    const summary = await buildPeriodicSummary(port, slot);
    await input.notifier.send(summary.text);
    sentKeys.add(dayKey);
    return true;
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void tickOnce().catch(() => undefined);
      }, tickMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tickOnce,
  };
}
