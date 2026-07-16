import type {
  BrowserDestinationAdapter,
  BrowserDestinationContext,
  BrowserDestinationEvidence,
  BrowserDestinationPhaseResult,
  DestinationCapabilities,
  DestinationKey,
} from '../types';

/**
 * Foundation stub — no browser automation. Phase C replaces with real adapters.
 */
export abstract class StubBrowserDestinationAdapter implements BrowserDestinationAdapter {
  abstract readonly key: DestinationKey;
  abstract readonly capabilities: DestinationCapabilities;

  protected phaseResult(
    phase: string,
    ctx: BrowserDestinationContext,
    extra?: Record<string, unknown>,
  ): BrowserDestinationPhaseResult {
    return {
      ok: true,
      phase,
      dryRun: ctx.dryRun,
      message: `stub:${this.key}:${phase}`,
      data: { destinationKey: this.key, publishJobId: ctx.publishJobId, ...extra },
    };
  }

  async prepare(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('prepare', ctx);
  }

  async navigate(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('navigate', ctx);
  }

  async ensureAuthenticated(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('ensureAuthenticated', ctx);
  }

  async uploadMedia(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('uploadMedia', ctx, { mediaCount: ctx.media.length });
  }

  async fillContent(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('fillContent', ctx, { bodyLength: ctx.body.length });
  }

  async publish(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('publish', ctx);
  }

  async verify(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('verify', ctx);
  }

  async captureEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence> {
    return {
      publishedUrl: undefined,
      postId: ctx.dryRun ? `stub_${ctx.publishJobId}` : undefined,
      domHash: undefined,
      durationMs: 0,
    };
  }

  async cleanup(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.phaseResult('cleanup', ctx);
  }
}
