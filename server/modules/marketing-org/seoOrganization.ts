/**
 * SEO Organization — keyword / topic / landing / competitor gaps → tasks.
 */

import { createHash } from 'crypto';
import type { SeoGapItem } from './types';

export function buildSeoGaps(input: {
  topic: string;
  existingTitles?: string[];
  trendingTopics?: string[];
}): SeoGapItem[] {
  const topic = input.topic || 'BĐS Đà Nẵng';
  const titles = (input.existingTitles || []).map(t => t.toLowerCase());
  const trends = input.trendingTopics || [];
  const gaps: SeoGapItem[] = [];

  const keyword = `giá ${topic}`;
  if (!titles.some(t => t.includes('giá') && t.includes(topic.toLowerCase().slice(0, 8)))) {
    gaps.push({
      id: id('keyword', keyword),
      kind: 'keyword',
      title: `Keyword gap: ${keyword}`,
      detail: `Chưa có bài SEO phủ “${keyword}”`,
      task: `Viết bài SEO: ${keyword} ${new Date().getFullYear()}`,
    });
  }

  gaps.push({
    id: id('topic', topic),
    kind: 'topic_gap',
    title: `Topic gap: pháp lý ${topic}`,
    detail: 'Thiếu pillar về pháp lý / quy hoạch',
    task: `Outline pillar: Pháp lý ${topic}`,
  });

  gaps.push({
    id: id('link', topic),
    kind: 'internal_link',
    title: 'Internal link gaps',
    detail: 'Landing ↔ SEO ↔ Facebook CTA chưa nối',
    task: `Map internal links cho cluster ${topic}`,
  });

  gaps.push({
    id: id('landing', topic),
    kind: 'landing_gap',
    title: `Landing gap: ${topic}`,
    detail: 'Thiếu landing CTA chuyên biệt',
    task: `Tạo landing CTA + form cho ${topic}`,
  });

  if (trends[0]) {
    gaps.push({
      id: id('comp', trends[0]),
      kind: 'competitor_gap',
      title: `Competitor/trend gap: ${trends[0]}`,
      detail: `Trend đang nóng nhưng content chưa cover`,
      task: `Brief content cạnh tranh quanh “${trends[0]}”`,
    });
  }

  return gaps.slice(0, 8);
}

function id(kind: string, seed: string): string {
  return `seo_${createHash('sha1').update(`${kind}:${seed}`).digest('hex').slice(0, 10)}`;
}
