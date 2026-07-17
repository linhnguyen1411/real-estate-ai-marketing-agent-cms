/**
 * Facebook Timeline DOM helpers — browser-only, no Graph API.
 * Used exclusively by FacebookTimelineAdapter.
 */

import type { Locator, Page } from 'playwright';
import {
  parsePublishSuccess,
  recoverAfterPublishClickTimeout,
} from '../../publishers/facebookProfileBrowserPublisher';

export { parsePublishSuccess, recoverAfterPublishClickTimeout };

const COMPOSER_OPEN_TRIGGERS = [
  /what.?s on your mind/i,
  /bạn đang nghĩ gì/i,
  /create a post/i,
  /tạo bài viết/i,
];

const PHOTO_BUTTON = /photo|video|ảnh|hình|image|media/i;

const PUBLISH_BUTTON = /^(post|publish|đăng|share)$/i;

const FACEBOOK_URL_RE = /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi;

const POST_ID_RE =
  /(?:story_fbid=|\/posts\/|\/activity\/|fbid=)(\d{3,})/i;

const PERMALINK_MARKERS =
  /(?:story_fbid=|\/posts\/\d+|permalink\.php|story\.php|\/activity\/\d+)/i;

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export function extractPostIdFromUrl(url: string): string | null {
  const m = url.match(POST_ID_RE);
  return m?.[1] ?? null;
}

export function extractFacebookPermalink(input: {
  currentUrl?: string | null;
  hrefs?: string[];
  html?: string | null;
  bodyText?: string | null;
}): { permalink: string | null; postId: string | null } {
  const pool: string[] = [];
  if (input.currentUrl) pool.push(input.currentUrl);
  if (input.hrefs?.length) pool.push(...input.hrefs);
  if (input.html) {
    const matches = input.html.match(FACEBOOK_URL_RE) || [];
    pool.push(...matches);
  }
  if (input.bodyText) {
    const matches = input.bodyText.match(FACEBOOK_URL_RE) || [];
    pool.push(...matches);
  }

  for (const raw of pool) {
    const url = raw.replace(/&amp;/g, '&').replace(/[>"'].*$/, '').trim();
    if (!url || !/facebook\.com/i.test(url)) continue;
    if (!PERMALINK_MARKERS.test(url)) continue;
    const postId = extractPostIdFromUrl(url);
    return { permalink: url, postId };
  }

  return { permalink: null, postId: null };
}

export function localMediaPaths(
  media: Array<{ fileUrl: string }>,
): string[] {
  return media
    .map(m => m.fileUrl)
    .filter(p => typeof p === 'string' && p.trim().length > 0 && !/^https?:\/\//i.test(p));
}

export async function findTimelineComposer(page: Page): Promise<Locator | null> {
  const candidates = [
    page.getByRole('textbox', {
      name: /what.?s on your mind|bạn đang nghĩ gì|create a post|tạo bài viết/i,
    }),
    page.locator('[aria-label*="What" i][contenteditable="true"]'),
    page.locator('[aria-label*="nghĩ gì" i][contenteditable="true"]'),
    page.locator('[role="dialog"] [contenteditable="true"][role="textbox"]'),
    page.locator('[contenteditable="true"][role="textbox"]'),
    page.locator('div[contenteditable="true"]'),
  ];
  for (const loc of candidates) {
    const first = loc.first();
    if (await first.isVisible().catch(() => false)) return first;
  }
  return null;
}

export async function openTimelineComposer(page: Page): Promise<Locator> {
  let composer = await findTimelineComposer(page);
  if (composer) {
    await composer.click({ timeout: 10_000 }).catch(() => undefined);
    await sleep(400);
    composer = (await findTimelineComposer(page)) || composer;
    return composer;
  }

  for (const name of COMPOSER_OPEN_TRIGGERS) {
    const trigger = page.getByRole('button', { name }).first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click({ timeout: 10_000 }).catch(() => undefined);
      await sleep(600);
      break;
    }
  }

  // Feed placeholder often looks like a button/div, not always role=button
  const feedPrompt = page
    .locator(
      '[role="button"]:has-text("What\'s on your mind"), [role="button"]:has-text("Bạn đang nghĩ gì")',
    )
    .first();
  if (await feedPrompt.isVisible().catch(() => false)) {
    await feedPrompt.click({ timeout: 10_000 }).catch(() => undefined);
    await sleep(600);
  }

  composer = await findTimelineComposer(page);
  if (!composer) {
    throw new Error('browser_composer_not_found');
  }
  await composer.click({ timeout: 10_000 }).catch(() => undefined);
  await sleep(300);
  return (await findTimelineComposer(page)) || composer;
}

export async function typeIntoComposer(
  page: Page,
  composer: Locator,
  body: string,
  linkUrl?: string | null,
): Promise<void> {
  await composer.click({ timeout: 10_000 }).catch(() => undefined);
  await sleep(200);

  const filled = await composer
    .fill(body)
    .then(() => true)
    .catch(() => false);
  if (!filled) {
    await composer.click().catch(() => undefined);
    await page.keyboard.press('Control+A').catch(() => undefined);
    await page.keyboard.type(body, { delay: 8 });
  }

  if (linkUrl) {
    await page.keyboard.type(`\n${linkUrl}`, { delay: 8 }).catch(() => undefined);
  }
}

export async function uploadTimelineMedia(
  page: Page,
  mediaFiles: string[],
): Promise<{ uploaded: number; method: string }> {
  if (mediaFiles.length === 0) {
    return { uploaded: 0, method: 'none' };
  }

  // Prefer existing file inputs (composer dialog often has hidden inputs)
  const inputs = page.locator('input[type="file"]');
  const inputCount = await inputs.count().catch(() => 0);
  for (let i = 0; i < inputCount; i += 1) {
    const input = inputs.nth(i);
    const accept = (await input.getAttribute('accept').catch(() => '')) || '';
    if (accept && !/image|\*|photo/i.test(accept) && /video/i.test(accept)) {
      continue;
    }
    try {
      await input.setInputFiles(mediaFiles);
      await sleep(1_200);
      return { uploaded: mediaFiles.length, method: 'file_input' };
    } catch {
      // try next / fallback
    }
  }

  // Open Photo/video chooser then set all files
  const photoBtn = page.getByRole('button', { name: PHOTO_BUTTON }).first();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8_000 }).catch(() => null),
    photoBtn.click({ timeout: 10_000 }).catch(() => undefined),
  ]);
  if (chooser) {
    await chooser.setFiles(mediaFiles);
    await sleep(1_200);
    return { uploaded: mediaFiles.length, method: 'file_chooser' };
  }

  // Last resort: set on any file input that appeared after click
  const after = page.locator('input[type="file"]').first();
  if (await after.count().catch(() => 0)) {
    await after.setInputFiles(mediaFiles);
    await sleep(1_200);
    return { uploaded: mediaFiles.length, method: 'file_input_after_click' };
  }

  throw new Error('browser_media_input_not_found');
}

export async function clickTimelinePublish(page: Page): Promise<boolean> {
  const buttons = [
    page.getByRole('button', { name: PUBLISH_BUTTON }),
    page.locator('[aria-label="Post"], [aria-label="Đăng"], [aria-label="Publish"]'),
    page.locator('[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Đăng"]'),
  ];
  for (const loc of buttons) {
    const btn = loc.first();
    if (await btn.isVisible().catch(() => false)) {
      const disabled = await btn.isDisabled().catch(() => false);
      if (disabled) {
        await sleep(1_500);
      }
      await btn.click({ timeout: 15_000 });
      return true;
    }
  }
  return false;
}

export async function collectPermalinkCandidates(page: Page): Promise<{
  currentUrl: string;
  hrefs: string[];
  html: string;
  bodyText: string;
}> {
  const currentUrl = page.url();
  const hrefs = await page
    .locator('a[href*="story_fbid"], a[href*="/posts/"], a[href*="permalink"], a[href*="story.php"]')
    .evaluateAll(els =>
      els
        .map(el => (el as HTMLAnchorElement).href)
        .filter(Boolean)
        .slice(0, 40),
    )
    .catch(() => [] as string[]);
  const html = await page.content().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  return { currentUrl, hrefs, html, bodyText: bodyText.slice(0, 8000) };
}

export async function dismissTimelineDialogs(page: Page): Promise<void> {
  const close = page.locator('[aria-label="Close"], [aria-label="Đóng"], [aria-label="Cancel"]');
  const count = await close.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, 3); i += 1) {
    await close.nth(i).click({ timeout: 2_000 }).catch(() => undefined);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
}
