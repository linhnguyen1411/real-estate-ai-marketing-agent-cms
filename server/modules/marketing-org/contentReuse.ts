/**
 * Content Reuse — one video/post → multi-cut assets.
 */

import { createHash } from 'crypto';
import type { ContentReusePlan, ContentVariant } from './types';

export function planContentReuse(input: {
  sourceTitle: string;
  sourceKind?: 'video' | 'article' | 'post';
  topic?: string;
}): ContentReusePlan {
  const title = input.sourceTitle || 'Asset';
  const topic = input.topic || title;
  const cuts: ContentVariant[] = [
    {
      channel: 'tiktok',
      kind: 'reel_script',
      title: `${title} → TikTok cut`,
      body: `Cut 0-15s hook + CTA. Source: ${title}`,
      reuseOf: title,
      cta: 'Follow + comment',
    },
    {
      channel: 'facebook',
      kind: 'reel_script',
      title: `${title} → FB Reel`,
      body: `Reel 15-30s từ ${title}. Caption ngắn + CTA comment.`,
      reuseOf: title,
    },
    {
      channel: 'instagram',
      kind: 'reel_script',
      title: `${title} → IG Reel`,
      body: `IG Reel crop 9:16. Cover frame + sticker poll.`,
      reuseOf: title,
    },
    {
      channel: 'threads',
      kind: 'thread',
      title: `${title} → Threads`,
      body: `3-tweet thread tóm insight từ ${title}.`,
      reuseOf: title,
    },
    {
      channel: 'seo',
      kind: 'short_article',
      title: `${topic} — short article from video`,
      body: `Outline 400 từ từ transcript ${title}.`,
      reuseOf: title,
    },
    {
      channel: 'instagram',
      kind: 'quote',
      title: `${title} → Quote card`,
      body: `1 câu quotable + brand frame.`,
      reuseOf: title,
    },
    {
      channel: 'instagram',
      kind: 'story',
      title: `${title} → Story`,
      body: `3 frame Story: hook / proof / CTA swipe-up.`,
      reuseOf: title,
    },
  ];

  return {
    id: `reuse_${createHash('sha1').update(`${title}:${Date.now()}`).digest('hex').slice(0, 10)}`,
    sourceKind: input.sourceKind || 'video',
    sourceTitle: title,
    cuts,
    createdAt: new Date().toISOString(),
  };
}
