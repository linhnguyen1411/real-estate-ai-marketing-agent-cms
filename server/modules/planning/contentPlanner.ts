/**
 * Content Planner — multi-channel schedule proposal (advisory).
 */

import { createHash } from 'node:crypto';
import type { ContentPlan } from './types';

export function planContentSchedule(input: {
  campaignName: string;
  propertyHint?: string;
}): ContentPlan {
  const topic = input.propertyHint || input.campaignName;
  const id = `cnt_${createHash('sha1').update(`${input.campaignName}:${Date.now()}`).digest('hex').slice(0, 12)}`;
  return {
    id,
    campaignName: input.campaignName,
    channels: ['Facebook', 'Threads', 'Instagram', 'TikTok', 'SEO', 'Email', 'Zalo', 'Landing Page'],
    schedule: [
      { time: '08:00', channel: 'Facebook', format: 'Post + ảnh', topic: `${topic} — mở bán / USP` },
      { time: '10:00', channel: 'Threads', format: 'Short thread', topic: `${topic} — góc nhìn NĐT` },
      { time: '14:00', channel: 'SEO', format: 'Article outline', topic: `Giá & pháp lý ${topic}` },
      { time: '18:00', channel: 'Facebook Group', format: 'Group post', topic: `${topic} — hỏi đáp nhanh` },
      { time: '20:00', channel: 'TikTok', format: 'Caption + hook', topic: `${topic} — 15s walkthrough` },
      { time: '21:00', channel: 'Zalo', format: 'Broadcast note', topic: `Lead nurture ${topic}` },
    ],
    createdAt: new Date().toISOString(),
  };
}
