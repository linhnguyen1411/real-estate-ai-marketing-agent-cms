/**
 * Content Calendar — weekly themes (not per-post scheduling).
 */

import type { CalendarDayTheme, CalendarSlot, MarketingChannel } from './types';

const WEEK: Array<{ weekday: number; theme: CalendarDayTheme; label: string; format: string }> = [
  { weekday: 1, theme: 'research', label: 'Thứ 2 · Research', format: 'Insight + poll' },
  { weekday: 2, theme: 'story', label: 'Thứ 3 · Story', format: 'Story / short narrative' },
  { weekday: 3, theme: 'video', label: 'Thứ 4 · Video', format: 'Reel / TikTok' },
  { weekday: 4, theme: 'review', label: 'Thứ 5 · Review', format: 'Review / FAQ' },
  { weekday: 5, theme: 'livestream', label: 'Thứ 6 · Livestream', format: 'Live Q&A' },
  { weekday: 6, theme: 'case_study', label: 'Thứ 7 · Case Study', format: 'Case / before-after' },
  { weekday: 7, theme: 'recap', label: 'CN · Recap', format: 'Weekly recap' },
];

const THEME_CHANNELS: Record<CalendarDayTheme, MarketingChannel[]> = {
  research: ['facebook', 'threads', 'seo'],
  story: ['instagram', 'facebook', 'zalo_oa'],
  video: ['tiktok', 'instagram', 'facebook'],
  review: ['facebook', 'threads', 'email'],
  livestream: ['facebook', 'zalo_oa', 'tiktok'],
  case_study: ['linkedin', 'seo', 'facebook'],
  recap: ['email', 'zalo_oa', 'facebook'],
};

export function buildWeeklyContentCalendar(input: {
  topic: string;
  campaignHint?: string | null;
}): CalendarSlot[] {
  const topic = input.topic || input.campaignHint || 'Campaign';
  return WEEK.map(d => ({
    weekday: d.weekday,
    theme: d.theme,
    label: d.label,
    channels: THEME_CHANNELS[d.theme],
    format: d.format,
    topicHint: `${topic} — ${d.theme.replace('_', ' ')}`,
  }));
}
