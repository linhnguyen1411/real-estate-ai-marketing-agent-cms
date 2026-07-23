/**
 * Telegram Rich Dashboard cards — formatted text + inline keyboards (Operations App look).
 */

import { formatTimelineLines } from '../operationalMemory';
import type {
  CampaignBoard,
  ContentPlan,
  LeadCardV2,
  MarketIntelligenceReport,
  MissionProposal,
  RecommendationItem,
  TimelineEntry,
} from '../types';
import type { InlineKeyboard } from '../../control-plane/inlineKeyboard';

export function campaignCard(board: CampaignBoard): { lines: string[]; replyMarkup: InlineKeyboard } {
  const check = board.planChecklist.map(c => `${c.done ? '✓' : '○'} ${c.label}`).join('\n');
  const lines = [
    'Campaign Card',
    '────────────────────────────────',
    board.name,
    `Goal: ${board.goal}`,
    `Audience: ${board.audience.join(' · ')}`,
    `Budget: ${board.budget}`,
    `Priority: ${board.priority}`,
    `Health: ${board.health}`,
    '',
    'Plan',
    check,
    '',
    'Tasks',
    ...board.tasks.map(t => `• ${t}`),
    '────────────────────────────────',
  ];
  return {
    lines,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Research', callback_data: 'ai:research' },
          { text: 'Content', callback_data: 'ai:content' },
          { text: 'Mission', callback_data: 'ai:mission' },
        ],
        [
          { text: 'Leads', callback_data: 'ai:leads' },
          { text: 'Publish', callback_data: 'ai:publish' },
          { text: 'Recs', callback_data: 'ai:recs' },
        ],
      ],
    },
  };
}

export function researchCard(report: MarketIntelligenceReport): { lines: string[]; replyMarkup: InlineKeyboard } {
  const lines = [
    'Research Card',
    '────────────────────────────────',
    report.title,
    `Giá trung bình: ${report.avgPricePerSqm ?? '—'} ${report.priceUnit}`,
    `Band: ${report.minPricePerSqm ?? '—'} → ${report.maxPricePerSqm ?? '—'}`,
    `Nguồn: ${report.sources.length}`,
    '',
    'Top keywords',
    ...report.topKeywords.slice(0, 5).map(k => `• ${k}`),
    '',
    'Xu hướng',
    ...report.trends.slice(0, 3).map(t => `• ${t}`),
    '',
    report.summary,
    '────────────────────────────────',
  ];
  return {
    lines,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Campaign', callback_data: 'ai:campaign' },
          { text: 'Missions', callback_data: 'ai:mission' },
          { text: 'Content', callback_data: 'ai:content' },
        ],
      ],
    },
  };
}

export function leadCardsBlock(leads: LeadCardV2[]): { lines: string[]; replyMarkup: InlineKeyboard } {
  const lines = ['Lead Intelligence V2', '────────────────────────────────', 'Top theo xác suất giao dịch', ''];
  for (const l of leads.slice(0, 10)) {
    lines.push(
      `${l.rank}.  ${l.confidence}%  ${l.name}`,
      `   Budget ${l.budget} · ${l.area}`,
      `   Need: ${l.need}`,
      `   Timeline: ${l.timeline}`,
      `   Reason: ${l.reason.join(' · ')}`,
      `   → ${l.recommendation}`,
      '',
    );
  }
  lines.push('────────────────────────────────');
  const top = leads[0];
  return {
    lines,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Open', callback_data: top?.findingId ? `l:o:${top.findingId.slice(0, 28)}` : 'ai:leads' },
          { text: 'Reply', callback_data: 'ai:leads' },
          { text: 'CRM', callback_data: 'ai:leads' },
        ],
      ],
    },
  };
}

export function missionCardsBlock(missions: MissionProposal[]): { lines: string[]; replyMarkup: InlineKeyboard } {
  const lines = ['Mission Planner', '────────────────────────────────', 'AI đề xuất (chưa chạy engine)', ''];
  for (const m of missions) {
    lines.push(`• ${m.name}`, `  ${m.persona} · ${m.areaHint} · ${m.intent} · ${m.priority}`, '');
  }
  lines.push('────────────────────────────────');
  return {
    lines,
    replyMarkup: {
      inline_keyboard: [[{ text: 'Campaign', callback_data: 'ai:campaign' }, { text: 'Leads', callback_data: 'ai:leads' }]],
    },
  };
}

export function contentPlanCard(plan: ContentPlan): { lines: string[]; replyMarkup: InlineKeyboard } {
  const lines = [
    'Content Planner',
    '────────────────────────────────',
    plan.campaignName,
    `Channels: ${plan.channels.join(' · ')}`,
    '',
    'Lịch đề xuất',
    ...plan.schedule.map(s => `${s.time}  ${s.channel}  — ${s.topic}`),
    '────────────────────────────────',
  ];
  return {
    lines,
    replyMarkup: {
      inline_keyboard: [[{ text: 'Campaign', callback_data: 'ai:campaign' }, { text: 'Publish', callback_data: 'ai:publish' }]],
    },
  };
}

export function recommendationCards(items: RecommendationItem[]): { lines: string[]; replyMarkup: InlineKeyboard } {
  const lines = ['Recommendation Engine', '────────────────────────────────'];
  for (const r of items) {
    lines.push(`[${r.severity}] ${r.campaignName}`, r.message, `→ ${r.actionLabel}${r.command ? ` (${r.command})` : ''}`, '');
  }
  lines.push('────────────────────────────────');
  return {
    lines,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Research', callback_data: 'ai:research' },
          { text: 'Content', callback_data: 'ai:content' },
          { text: 'Leads', callback_data: 'ai:leads' },
        ],
      ],
    },
  };
}

export function fleetEmployeeCard(): { lines: string[]; replyMarkup: InlineKeyboard } {
  const lines = [
    'Fleet Card — AI Employee',
    '────────────────────────────────',
    'Scanner · Publisher · Content · Research · Mission · AI',
    'Planning Layer active — Runtime cores untouched.',
    '────────────────────────────────',
  ];
  return {
    lines,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Campaign', callback_data: 'ai:campaign' },
          { text: 'Research', callback_data: 'ai:research' },
          { text: 'Leads', callback_data: 'ai:leads' },
        ],
        [
          { text: 'Mission', callback_data: 'ai:mission' },
          { text: 'Content', callback_data: 'ai:content' },
          { text: 'Timeline', callback_data: 'ai:timeline' },
        ],
      ],
    },
  };
}

export function timelineCard(entries: TimelineEntry[]): { lines: string[]; replyMarkup: InlineKeyboard } {
  return {
    lines: formatTimelineLines(entries),
    replyMarkup: {
      inline_keyboard: [[{ text: 'Campaign', callback_data: 'ai:campaign' }, { text: 'Recs', callback_data: 'ai:recs' }]],
    },
  };
}
