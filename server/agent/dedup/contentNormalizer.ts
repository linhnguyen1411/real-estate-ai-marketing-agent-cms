/**
 * Content normalization for Lead Intelligence dedupe (exact hash layer).
 * Preserves phones, money, addresses, and property info.
 */

import crypto from 'crypto';

export const CONTENT_DEDUPE_VERSION = 'lead-dedupe@v1';

const EMOJI_EDGE =
  /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s🔥🍀🏠📍📐💰☎️📲‼️✅️☘️]+|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s🔥🍀🏠📍📐💰☎️📲‼️✅️☘️]+$/gu;

const ACTION_LABELS =
  /\b(thích|like|bình luận|comment|chia sẻ|share|trả lời|reply|xem thêm|see more|theo dõi|follow)\b/gi;

export function normalizeLeadContent(raw: string, title?: string | null): string {
  let text = String(raw || '');
  try {
    text = text.normalize('NFKC');
  } catch {
    // ignore
  }

  text = text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
  text = text.replace(EMOJI_EDGE, '');
  text = text.replace(ACTION_LABELS, ' ');
  text = text.replace(/\bm\s*2\b/gi, 'm2').replace(/m²/gi, 'm2');
  text = text.replace(/[.]{3,}/g, '...').replace(/[!?]{2,}/g, match => match[0]);
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  text = text.replace(/[\s!?.,…]+$/g, '').trim();
  text = text.replace(EMOJI_EDGE, '');
  text = text.replace(/[\s!?.,…]+$/g, '').trim();
  text = text.replace(/\s+/g, ' ').trim().toLowerCase();

  let titleNorm = String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  try {
    titleNorm = titleNorm.normalize('NFKC');
  } catch {
    // ignore
  }
  titleNorm = titleNorm.replace(/\bm\s*2\b/gi, 'm2').replace(/m²/gi, 'm2');

  if (titleNorm && titleNorm.length >= 12 && text.startsWith(titleNorm)) {
    text = text.slice(titleNorm.length).trim();
  }

  return text.replace(/\s+/g, ' ').trim();
}

export function hashNormalizedContent(normalized: string): string {
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
