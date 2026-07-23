import type { Page } from 'playwright';
import type { SocialChannel } from '@prisma/client';
import { detectFacebookAuthBlock } from '../../../agent-worker/facebook/facebookCheckpointDetector';
import { fingerprintBody } from '../safetyService';
import type { ChannelHealth, PublishContext, PublishResult, SocialPublisher } from '../types';

export interface PublishPageFactory {
  getPublishPage(options?: { initialUrl?: string; mode?: 'cdp' | 'managed' }): Promise<Page>;
  beginCdpJob?(): Promise<void>;
  releaseCdpLock?(): void;
}

export interface BrowserPublishDeps {
  pageFactory: PublishPageFactory;
}

export function buildPublishContext(input: {
  body: string;
  linkUrl?: string | null;
  mediaPaths?: string[];
  dryRun?: boolean;
}) {
  const hashes = fingerprintBody(input.body);
  return {
    body: input.body,
    linkUrl: input.linkUrl ?? null,
    mediaPaths: input.mediaPaths || [],
    dryRun: Boolean(input.dryRun),
    bodyHash: hashes.bodyHash,
    normalizedBodyHash: hashes.normalizedBodyHash,
  };
}

export function parsePublishSuccess(input: {
  currentUrl?: string;
  bodyText?: string;
  toastText?: string;
}): { success: boolean; reason: string } {
  const hay = `${input.currentUrl || ''} ${input.bodyText || ''} ${input.toastText || ''}`.toLowerCase();
  if (/your post is now live|đã đăng|post shared|shared successfully|đăng thành công/.test(hay)) {
    return { success: true, reason: 'success_heuristic_match' };
  }
  if (/something went wrong|try again|không thể đăng|couldn't post|could not post/.test(hay)) {
    return { success: false, reason: 'failure_heuristic_match' };
  }
  // Soft feed URL alone is insufficient — caused H0 false "published" without a real post.
  // Callers must also have a non-junk permalink or composer-closed + body proof.
  if (
    input.currentUrl &&
    /facebook\.com\/?(home\.php|home|profile|me|groups\/[^/?#]+\/?(\?|$)|$|\?)/i.test(input.currentUrl)
  ) {
    return { success: false, reason: 'soft_feed_url_unverified' };
  }
  return { success: false, reason: 'no_success_signal' };
}

/**
 * After Post click, navigation/timeout can leave the page mid-transition.
 * Pure recovery decision: re-check success signals before treating as failure.
 */
export function recoverAfterPublishClickTimeout(input: {
  timedOut: boolean;
  currentUrl?: string;
  bodyText?: string;
  toastText?: string;
}): { recovered: boolean; success: boolean; reason: string } {
  if (!input.timedOut) {
    return { recovered: false, success: false, reason: 'not_timed_out' };
  }
  const parsed = parsePublishSuccess(input);
  if (parsed.success) {
    return { recovered: true, success: true, reason: `recovered_${parsed.reason}` };
  }
  return { recovered: false, success: false, reason: `timeout_unconfirmed_${parsed.reason}` };
}

export { fingerprintBody };

async function findComposer(page: Page) {
  const candidates = [
    page.getByRole('textbox', { name: /what.?s on your mind|bạn đang nghĩ gì|create a post|tạo bài viết/i }),
    page.locator('[aria-label*="What" i][contenteditable="true"]'),
    page.locator('[aria-label*="nghĩ gì" i][contenteditable="true"]'),
    page.locator('[contenteditable="true"][role="textbox"]'),
    page.locator('div[contenteditable="true"]'),
  ];
  for (const loc of candidates) {
    const first = loc.first();
    if (await first.isVisible().catch(() => false)) return first;
  }
  return null;
}

async function clickPublish(page: Page): Promise<boolean> {
  const buttons = [
    page.getByRole('button', { name: /^(post|publish|đăng|share)$/i }),
    page.locator('[aria-label="Post"], [aria-label="Đăng"], [aria-label="Publish"]'),
  ];
  for (const loc of buttons) {
    const btn = loc.first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 10_000 }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function dismissDialogs(page: Page): Promise<void> {
  const close = page.locator('[aria-label="Close"], [aria-label="Đóng"], [aria-label="Cancel"]');
  const count = await close.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, 3); i += 1) {
    await close.nth(i).click({ timeout: 2_000 }).catch(() => undefined);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
}

export function createFacebookProfileBrowserPublisher(
  deps: BrowserPublishDeps,
): SocialPublisher {
  return {
    supports(channel: SocialChannel) {
      return channel.type === 'facebook_profile' && channel.executionMode === 'browser';
    },

    async verifyChannel(channel: SocialChannel): Promise<ChannelHealth> {
      const checkedAt = new Date().toISOString();
      const dryRun = process.env.SOCIAL_PUBLISH_DRY_RUN === '1';
      if (dryRun) {
        return { ok: true, status: 'active', checkedAt, details: 'dry_run verify skipped browser' };
      }
      try {
        await deps.pageFactory.beginCdpJob?.();
        const page = await deps.pageFactory.getPublishPage({
          initialUrl: channel.profileUrl || 'https://www.facebook.com/',
          mode: 'cdp',
        });
        const auth = await detectFacebookAuthBlock(page);
        if (auth.blocked) {
          return {
            ok: false,
            status: 'needs_login',
            checkedAt,
            details: auth.reason,
            errorCode: 'browser_auth_blocked',
          };
        }
        return { ok: true, status: 'active', checkedAt, details: page.url() };
      } catch (error) {
        return {
          ok: false,
          status: 'error',
          checkedAt,
          details: error instanceof Error ? error.message : 'verify failed',
          errorCode: 'unknown',
        };
      } finally {
        deps.pageFactory.releaseCdpLock?.();
      }
    },

    async publish(ctx: PublishContext): Promise<PublishResult> {
      const dryRun = process.env.SOCIAL_PUBLISH_DRY_RUN === '1';
      const publishCtx = buildPublishContext({
        body: ctx.draft.body,
        linkUrl: ctx.draft.linkUrl,
        mediaPaths: (ctx.draft.media || [])
          .map(m => m.fileUrl)
          .filter(url => !/^https?:\/\//i.test(url)),
        dryRun,
      });

      if (dryRun) {
        return {
          ok: true,
          dryRun: true,
          externalPostId: `dry_run_${ctx.job.id}`,
          errorCode: 'dry_run',
          raw: { publishCtx },
        };
      }

      try {
        await deps.pageFactory.beginCdpJob?.();
        const page = await deps.pageFactory.getPublishPage({
          initialUrl: 'https://www.facebook.com/',
          mode: 'cdp',
        });

        const auth = await detectFacebookAuthBlock(page);
        if (auth.blocked) {
          return {
            ok: false,
            errorCode: 'browser_auth_blocked',
            errorMessage: auth.reason,
            raw: { kind: auth.kind, url: auth.currentUrl },
          };
        }

        await page.goto('https://www.facebook.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        }).catch(() => undefined);

        const composer = await findComposer(page);
        if (!composer) {
          return {
            ok: false,
            errorCode: 'browser_composer_not_found',
            errorMessage: 'Could not find Facebook composer',
          };
        }

        await composer.click({ timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        const activeComposer = (await findComposer(page)) || composer;
        await activeComposer.fill(publishCtx.body).catch(async () => {
          await activeComposer.click();
          await page.keyboard.type(publishCtx.body, { delay: 5 });
        });

        if (publishCtx.linkUrl) {
          await page.keyboard.type(`\n${publishCtx.linkUrl}`, { delay: 5 }).catch(() => undefined);
        }

        for (const mediaPath of publishCtx.mediaPaths) {
          const fileInput = page.locator('input[type="file"]').first();
          if (await fileInput.count().catch(() => 0)) {
            await fileInput.setInputFiles(mediaPath).catch(() => undefined);
          } else {
            const [chooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 5_000 }).catch(() => null),
              page.getByRole('button', { name: /photo|ảnh|image|media/i }).first().click().catch(() => undefined),
            ]);
            if (chooser) await chooser.setFiles(mediaPath).catch(() => undefined);
          }
        }

        const clicked = await clickPublish(page);
        if (!clicked) {
          return {
            ok: false,
            errorCode: 'browser_publish_failed',
            errorMessage: 'Publish button not found',
          };
        }

        await page.waitForTimeout(2_500);
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const parsed = parsePublishSuccess({
          currentUrl: page.url(),
          bodyText: bodyText.slice(0, 4000),
        });

        if (!parsed.success) {
          return {
            ok: false,
            errorCode: 'browser_publish_failed',
            errorMessage: parsed.reason,
            raw: { url: page.url() },
          };
        }

        return {
          ok: true,
          externalPostId: `browser_${ctx.job.id}_${Date.now()}`,
          raw: { reason: parsed.reason, url: page.url() },
        };
      } finally {
        try {
          const page = await deps.pageFactory.getPublishPage({ mode: 'cdp' });
          await dismissDialogs(page);
        } catch {
          // ignore cleanup errors
        }
        deps.pageFactory.releaseCdpLock?.();
      }
    },
  };
}

/** Default instance without browser — verify/publish need injected factory via registry override. */
export const facebookProfileBrowserPublisher: SocialPublisher = {
  supports(channel) {
    return channel.type === 'facebook_profile' && channel.executionMode === 'browser';
  },
  async verifyChannel() {
    // CMS has no Playwright page factory. Do NOT mark the channel error/disconnected —
    // real auth check happens on the agent worker during publish.
    return {
      ok: true,
      status: 'active',
      checkedAt: new Date().toISOString(),
      details:
        'Browser channel: CMS Test skipped (no page factory). Worker verifies login when publishing.',
      errorCode: 'browser_verify_skipped_cms',
    };
  },
  async publish() {
    return {
      ok: false,
      errorCode: 'unknown',
      errorMessage: 'Browser publisher requires worker page factory — use worker handler',
    };
  },
};
