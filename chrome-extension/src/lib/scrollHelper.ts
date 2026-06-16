import { getLoadedPostElements, scrollToUnseenPost } from './postBlockScanner';

/** Snapshot nhiều nguồn scroll — Facebook thường scroll window, không phải div[role=feed] */
export interface ScrollSnapshot {
  windowY: number;
  docY: number;
  mainScrollTop: number;
  lastArticleTop: number;
  feedChildCount: number;
  visibleBlockKey: string;
}

function getFeed(): HTMLElement | null {
  return document.querySelector('div[role="feed"]') as HTMLElement | null;
}

export function takeScrollSnapshot(visibleBlockIds: string[] = []): ScrollSnapshot {
  const main = document.querySelector('div[role="main"]') as HTMLElement | null;
  const feed = getFeed();
  const articles = getLoadedPostElements();
  const last = articles[articles.length - 1];

  return {
    windowY: window.scrollY || window.pageYOffset || 0,
    docY: document.documentElement.scrollTop || 0,
    mainScrollTop: main?.scrollTop ?? 0,
    lastArticleTop: last?.getBoundingClientRect().top ?? 0,
    feedChildCount: feed?.childElementCount ?? 0,
    visibleBlockKey: visibleBlockIds.slice().sort().join('|')
  };
}

/** @deprecated dùng takeScrollSnapshot */
export function getScrollPosition(): number {
  return takeScrollSnapshot().windowY;
}

function scrollWindowDown(): void {
  const pct = 0.75 + Math.random() * 0.15;
  const delta = Math.max(500, window.innerHeight * pct);
  window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop += delta;
  document.body.scrollTop += delta;
}

function scrollMainDown(): boolean {
  const main = document.querySelector('div[role="main"]') as HTMLElement | null;
  if (!main || main.scrollHeight <= main.clientHeight + 20) return false;
  const delta = Math.max(500, main.clientHeight * 0.8);
  main.scrollTop += delta;
  return true;
}

function scrollFeedContainerDown(): boolean {
  const feed = getFeed();
  if (!feed) return false;

  let el: HTMLElement | null = feed;
  while (el) {
    if (el.scrollHeight > el.clientHeight + 20) {
      el.scrollTop += Math.max(400, el.clientHeight * 0.75);
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Scroll tới bài chưa quét + window scroll — attempt tăng dần */
export function scrollFeedDown(attempt = 0, seenBlockIds?: Set<string>): boolean {
  if (seenBlockIds?.size) {
    scrollToUnseenPost(seenBlockIds);
  } else {
    const units = getLoadedPostElements();
    const last = units[units.length - 1];
    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
  }

  scrollWindowDown();

  if (attempt >= 2) {
    scrollMainDown();
    scrollFeedContainerDown();
    window.scrollBy({ top: window.innerHeight, left: 0, behavior: 'instant' });
  }

  return true;
}

export function didScrollAdvance(before: ScrollSnapshot, after: ScrollSnapshot): boolean {
  if (Math.abs(after.windowY - before.windowY) > 8) return true;
  if (Math.abs(after.docY - before.docY) > 8) return true;
  if (Math.abs(after.mainScrollTop - before.mainScrollTop) > 8) return true;
  if (after.feedChildCount > before.feedChildCount) return true;

  if (before.lastArticleTop > 0 && after.lastArticleTop < before.lastArticleTop - 40) return true;
  if (before.visibleBlockKey && after.visibleBlockKey !== before.visibleBlockKey) return true;

  return false;
}

export function detectCheckpointOrCaptcha(): boolean {
  const url = location.href.toLowerCase();
  if (/checkpoint|captcha|two_step/.test(url)) return true;
  const text = (document.body?.innerText || '').slice(0, 3000).toLowerCase();
  return /security check|xác minh|checkpoint|mã xác nhận|robot/i.test(text);
}
