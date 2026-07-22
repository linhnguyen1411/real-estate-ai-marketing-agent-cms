/**
 * Structured publish instrumentation — one event stream per publishJobId.
 */

export type PublishTraceEvent =
  | 'AcquireLock'
  | 'EditorFocus'
  | 'EditorEmpty'
  | 'InsertText'
  | 'ReadBack'
  | 'CaptionMismatch'
  | 'UploadMedia'
  | 'ThumbnailVisible'
  | 'UploadComplete'
  | 'AntiDuplicateCheck'
  | 'AlreadyOnFeed'
  | 'PublishClick'
  | 'SpinnerGone'
  | 'VerifyFeed'
  | 'Permalink'
  | 'VerifyUnknown'
  | 'Complete'
  | 'Fail'
  | 'Duration';

export class PublishTrace {
  private readonly startedAt = Date.now();
  private readonly events: Array<{
    at: string;
    event: PublishTraceEvent;
    ms: number;
    detail?: Record<string, unknown>;
  }> = [];

  constructor(private readonly publishJobId: string) {}

  mark(event: PublishTraceEvent, detail?: Record<string, unknown>): void {
    const ms = Date.now() - this.startedAt;
    const row = {
      at: new Date().toISOString(),
      event,
      ms,
      ...(detail ? { detail } : {}),
    };
    this.events.push(row);
    const extra = detail ? ` ${JSON.stringify(detail)}` : '';
    console.log(`[publish-trace] job=${this.publishJobId} +${ms}ms ${event}${extra}`);
  }

  durationMs(): number {
    return Date.now() - this.startedAt;
  }

  toJSON(): Record<string, unknown> {
    return {
      publishJobId: this.publishJobId,
      durationMs: this.durationMs(),
      events: this.events,
    };
  }
}

const traces = new Map<string, PublishTrace>();

export function getPublishTrace(publishJobId: string): PublishTrace {
  let t = traces.get(publishJobId);
  if (!t) {
    t = new PublishTrace(publishJobId);
    traces.set(publishJobId, t);
  }
  return t;
}

export function clearPublishTrace(publishJobId: string): void {
  traces.delete(publishJobId);
}
