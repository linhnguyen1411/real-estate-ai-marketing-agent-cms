import { cleanFacebookNoise } from './cleanFacebookNoise';
import { extractVietnamPhones } from './extractVietnamPhones';
import { makeArticleHash } from './hash';
import type { PostBlock } from '../types';

const MIN_TEXT = 25;
const MAX_TEXT = 4000;

export type ScanScope = 'viewport' | 'loaded';

function isFacebook(): boolean {
  return location.hostname.includes('facebook.com');
}

function isInViewport(el: HTMLElement, margin = 0): boolean {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return rect.bottom > -margin && rect.top < vh + margin && rect.height > 20;
}

function isLikelyPostUnit(el: HTMLElement): boolean {
  if (el.offsetHeight < 60) return false;
  const text = (el.innerText || '').trim();
  if (text.length < 15) return false;
  const tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE') return false;
  return true;
}

function isNestedInOtherUnit(el: HTMLElement, units: Set<HTMLElement>): boolean {
  let parent = el.parentElement;
  while (parent) {
    if (units.has(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}

/** Gom post unit Facebook — ưu tiên feed.children, không dừng ở 1 role=article */
export function collectFacebookPostUnits(): HTMLElement[] {
  const feed = document.querySelector('div[role="feed"]');
  if (!feed) return [];

  const seen = new Set<HTMLElement>();
  const units: HTMLElement[] = [];

  const add = (el: HTMLElement) => {
    if (seen.has(el) || !isLikelyPostUnit(el)) return;
    seen.add(el);
    units.push(el);
  };

  // 1) Direct children — chuẩn Facebook Group feed
  Array.from(feed.children).forEach(child => {
    if (child instanceof HTMLElement && child.tagName === 'DIV') add(child);
  });

  // 2) FeedUnit pagelets
  feed.querySelectorAll('[data-pagelet^="FeedUnit_"]').forEach(n => {
    add(n as HTMLElement);
  });

  // 3) aria-posinset — bài có thứ tự trong feed
  feed.querySelectorAll('div[aria-posinset]').forEach(n => {
    const el = n as HTMLElement;
    if (isNestedInOtherUnit(el, seen)) return;
    add(el);
  });

  // 4) role=article — chỉ lấy nếu chưa có unit cha
  feed.querySelectorAll('[role="article"]').forEach(n => {
    const el = n as HTMLElement;
    if (isNestedInOtherUnit(el, seen)) return;
    add(el);
  });

  return units;
}

/** Trích text từ post — ưu tiên message body */
function extractBlockText(el: HTMLElement): string {
  const parts: string[] = [];
  const seen = new Set<string>();

  const push = (t: string) => {
    const s = t.trim();
    if (s.length < 8 || seen.has(s)) return;
    seen.add(s);
    parts.push(s);
  };

  const msg = el.querySelector(
    '[data-ad-comet-preview="message"], [data-ad-preview="message"], [data-ad-rendering-role="story_message"]'
  ) as HTMLElement | null;
  if (msg?.innerText) push(msg.innerText);

  el.querySelectorAll('div[dir="auto"], span[dir="auto"]').forEach(node => {
    const t = (node as HTMLElement).innerText?.trim() || '';
    if (t.length >= 20) push(t);
  });

  if (parts.length) return parts.join('\n');
  return (el.innerText || '').trim();
}

function isValidPost(text: string): boolean {
  const cleaned = cleanFacebookNoise(text);
  if (!cleaned || cleaned.length < MIN_TEXT) {
    const phones = extractVietnamPhones(text).validPhones;
    return phones.length > 0 && cleaned.length >= 15;
  }
  if (cleaned.length > MAX_TEXT * 2) return false;
  return true;
}

function stableUnitKey(el: HTMLElement, trimmed: string): string {
  const pos = el.getAttribute('aria-posinset') || '';
  const pagelet = el.getAttribute('data-pagelet') || '';
  const idx = el.parentElement
    ? Array.from(el.parentElement.children).indexOf(el)
    : 0;
  return `${pos}|${pagelet}|${idx}|${trimmed.slice(0, 120)}`;
}

function toPostBlock(el: HTMLElement, selectorUsed: string): PostBlock | null {
  const rawText = extractBlockText(el);
  if (!rawText || !isValidPost(rawText)) return null;

  const cleaned = cleanFacebookNoise(rawText);
  const trimmed = cleaned.length > MAX_TEXT ? cleaned.slice(0, MAX_TEXT) : cleaned;
  if (!trimmed) return null;

  const blockId = `blk-${makeArticleHash(stableUnitKey(el, trimmed))}`;
  el.setAttribute('data-estoria-block-id', blockId);

  const rect = el.getBoundingClientRect();
  return {
    blockId,
    selectorUsed,
    text: trimmed,
    textPreview: trimmed.slice(0, 120),
    rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    url: location.href,
    sourceTitle: document.title || ''
  };
}

function scanFacebookBlocks(scope: ScanScope): PostBlock[] {
  const units = collectFacebookPostUnits();
  const blocks: PostBlock[] = [];
  const margin = scope === 'viewport' ? 120 : 0;

  for (const el of units) {
    if (scope === 'viewport' && !isInViewport(el, margin)) continue;
    const block = toPostBlock(el, 'fb-feed-unit');
    if (block) blocks.push(block);
  }
  return blocks;
}

function scanGenericBlocks(scope: ScanScope): PostBlock[] {
  const selectors = ['article', '[role="article"]', '.post', '.listing', '.property'];
  const blocks: PostBlock[] = [];
  const seen = new Set<HTMLElement>();
  const margin = scope === 'viewport' ? 120 : 0;

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(node => {
      const el = node as HTMLElement;
      if (seen.has(el)) return;
      if (scope === 'viewport' && !isInViewport(el, margin)) return;
      seen.add(el);
      const block = toPostBlock(el, sel);
      if (block) blocks.push(block);
    });
  }
  return blocks;
}

export function getPostBlocks(scope: ScanScope = 'viewport'): PostBlock[] {
  let blocks = isFacebook() ? scanFacebookBlocks(scope) : scanGenericBlocks(scope);

  if (!blocks.length && isFacebook()) {
    blocks = scanGenericBlocks(scope);
  }

  const unique = new Map<string, PostBlock>();
  for (const b of blocks) {
    if (!unique.has(b.blockId)) unique.set(b.blockId, b);
  }
  return Array.from(unique.values());
}

/** @deprecated — dùng getPostBlocks('viewport') */
export function getVisiblePostBlocks(): PostBlock[] {
  return getPostBlocks('viewport');
}

/** Post units đã load trong feed — dùng cho scroll target */
export function getLoadedPostElements(): HTMLElement[] {
  return collectFacebookPostUnits();
}

/** Scroll tới bài chưa quét — kích hoạt Facebook load thêm */
export function scrollToUnseenPost(seenBlockIds: Set<string>): boolean {
  const units = collectFacebookPostUnits();
  if (!units.length) return false;

  let target: HTMLElement | null = null;

  for (let i = units.length - 1; i >= 0; i--) {
    const el = units[i];
    const blockId = el.getAttribute('data-estoria-block-id');
    if (blockId && seenBlockIds.has(blockId)) continue;

    const block = toPostBlock(el, 'fb-scroll-target');
    if (block && !seenBlockIds.has(block.blockId)) {
      target = el;
      break;
    }
  }

  if (!target) target = units[units.length - 1];
  target.scrollIntoView({ block: 'end', behavior: 'instant' });
  return true;
}

export function highlightBlock(blockId: string): boolean {
  const el = document.querySelector(`[data-estoria-block-id="${blockId}"]`) as HTMLElement | null;
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('estoria-block-highlight');
  setTimeout(() => el.classList.remove('estoria-block-highlight'), 2500);
  return true;
}

export function scrollToBlock(blockId: string): boolean {
  const el = document.querySelector(`[data-estoria-block-id="${blockId}"]`) as HTMLElement | null;
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return true;
}

export function getScanDebugInfo() {
  const feed = document.querySelector('div[role="feed"]');
  const units = collectFacebookPostUnits();
  const viewportBlocks = getPostBlocks('viewport');
  const loadedBlocks = getPostBlocks('loaded');
  const withPhone = loadedBlocks.filter(b => extractVietnamPhones(b.text).validPhones.length > 0).length;
  return {
    hasFeed: Boolean(feed),
    articleCount: feed?.querySelectorAll('[role="article"]').length ?? 0,
    feedChildCount: feed?.childElementCount ?? 0,
    loadedUnits: units.length,
    visibleBlocks: viewportBlocks.length,
    loadedBlocks: loadedBlocks.length,
    blocksWithPhone: withPhone,
    samples: loadedBlocks.slice(0, 3).map(b => ({
      preview: b.textPreview,
      phones: extractVietnamPhones(b.text).validPhones
    }))
  };
}
