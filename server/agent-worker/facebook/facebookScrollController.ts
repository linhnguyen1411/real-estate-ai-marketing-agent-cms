import type { Page } from 'playwright';

export interface FacebookScrollConfig {
  maxScrolls: number;
  scrollPauseMs: number;
  maxDurationSeconds: number;
}

export interface FacebookScrollState {
  scrollsPerformed: number;
  stoppedReason: 'max_scrolls' | 'max_duration' | 'manual' | 'known_posts' | 'no_new_posts';
}

export async function scrollFacebookFeed(
  page: Page,
  config: FacebookScrollConfig,
  startedAt: number,
): Promise<FacebookScrollState> {
  if (config.maxScrolls <= 0) {
    return { scrollsPerformed: 0, stoppedReason: 'manual' };
  }

  const elapsedSec = (Date.now() - startedAt) / 1000;
  if (elapsedSec >= config.maxDurationSeconds) {
    return { scrollsPerformed: 0, stoppedReason: 'max_duration' };
  }

  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(config.scrollPauseMs);

  return { scrollsPerformed: 1, stoppedReason: 'manual' };
}

export function shouldStopScrolling(input: {
  scrollsPerformed: number;
  maxScrolls: number;
  startedAt: number;
  maxDurationSeconds: number;
  knownPostsStreak: number;
  stopAfterKnownPosts: number;
}): FacebookScrollState['stoppedReason'] | null {
  if (input.knownPostsStreak >= input.stopAfterKnownPosts) {
    return 'known_posts';
  }
  if (input.scrollsPerformed >= input.maxScrolls) {
    return 'max_scrolls';
  }
  const elapsedSec = (Date.now() - input.startedAt) / 1000;
  if (elapsedSec >= input.maxDurationSeconds) {
    return 'max_duration';
  }
  return null;
}

export async function switchFacebookFeedTab(
  page: Page,
  feedTab: string | undefined,
): Promise<boolean> {
  if (!feedTab || feedTab === 'default') return false;

  const patterns: Record<string, RegExp> = {
    discussion: /thảo luận|discussion/i,
    new: /mới nhất|new posts/i,
    featured: /nổi bật|featured/i,
  };

  const pattern = patterns[feedTab];
  if (!pattern) return false;

  const tab = page.getByRole('tab', { name: pattern }).first();
  const visible = await tab.isVisible().catch(() => false);
  if (!visible) {
    console.warn(`[facebook] Feed tab "${feedTab}" not found — @calibrate selectors`);
    return false;
  }

  await tab.click({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  return true;
}
