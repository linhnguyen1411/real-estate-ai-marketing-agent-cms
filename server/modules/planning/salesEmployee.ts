/**
 * AI Sales Employee façade — Copilot / Telegram / API entry.
 * Orchestrates planning modules only.
 */

import { planCampaignBoard } from './campaignPlanner';
import { planContentSchedule } from './contentPlanner';
import { rankLeadCards } from './leadIntelligenceV2';
import { proposeMissions } from './missionPlanner';
import { formatTimelineLines, loadTodayTimeline, rememberPlanningEvent } from './operationalMemory';
import { buildCampaignRecommendations } from './recommendationEngine';
import { buildMarketIntelligenceReport } from './researchAgent';
import {
  campaignCard,
  contentPlanCard,
  fleetEmployeeCard,
  leadCardsBlock,
  missionCardsBlock,
  recommendationCards,
  researchCard,
  timelineCard,
} from './cards/telegramCards';
import type { SalesEmployeeResult } from './types';
import type { InlineKeyboard } from '../control-plane/inlineKeyboard';

export type SalesEmployeeReply = SalesEmployeeResult & {
  replyMarkup?: InlineKeyboard;
};

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectSalesMode(
  text: string,
): SalesEmployeeResult['mode'] {
  const t = norm(text);
  if (/hôm nay ai đã làm|hom nay ai da lam|timeline|ai đã làm gì|ai da lam gi/.test(t)) return 'timeline';
  if (/lead nổi bật|lead noi bat|top lead|lead vip|lead hôm nay|lead hom nay/.test(t)) return 'lead_cards';
  if (/research|market report|giá thị trường|gia thi truong|khảo sát|khao sat/.test(t)) return 'research_report';
  if (/mission|nhiệm vụ buyer|nhiem vu buyer|đề xuất mission|de xuat mission/.test(t)) {
    return 'mission_proposals';
  }
  if (/content|lịch đăng|lich dang|threads|tiktok caption|seo bài/.test(t)) return 'content_plan';
  if (/đề xuất|de xuat|recommendation|thiếu bài|thieu bai|nên giảm|nen giam/.test(t)) {
    return 'recommendations';
  }
  if (
    /bán mạnh|ban manh|campaign|chiến dịch|chien dich|cần bán|can ban|lập campaign|lap campaign|mai đăng chơn|mai dang chon/.test(
      t,
    )
  ) {
    return 'campaign_board';
  }
  if (/^\/?ai\b|sales employee|help ai|ai employee/.test(t)) return 'help';
  return 'help';
}

export async function runSalesEmployee(input: {
  utterance: string;
  companyId?: string | null;
  mode?: SalesEmployeeResult['mode'];
}): Promise<SalesEmployeeReply> {
  const mode = input.mode || detectSalesMode(input.utterance);

  if (mode === 'help') {
    const fleet = fleetEmployeeCard();
    return {
      mode: 'help',
      lines: [
        ...fleet.lines,
        '',
        'Ví dụ:',
        '• Hôm nay cần bán mạnh lô Mai Đăng Chơn',
        '• Lead nổi bật nhất hôm nay',
        '• Research Mai Đăng Chơn',
        '• Hôm nay AI đã làm gì?',
      ],
      text: [...fleet.lines, '', 'Ví dụ: bán mạnh / lead nổi bật / research / timeline'].join('\n'),
      replyMarkup: fleet.replyMarkup,
    };
  }

  if (mode === 'timeline') {
    const timeline = await loadTodayTimeline({ companyId: input.companyId });
    const card = timelineCard(timeline);
    return {
      mode,
      timeline,
      lines: card.lines,
      text: card.lines.join('\n'),
      replyMarkup: card.replyMarkup,
    };
  }

  if (mode === 'lead_cards') {
    const leads = await rankLeadCards({ companyId: input.companyId, limit: 10 });
    const card = leadCardsBlock(leads);
    await rememberPlanningEvent({
      companyId: input.companyId,
      kind: 'lead_intel',
      title: 'Lead Intelligence V2',
      detail: `Top ${leads.length} lead`,
    });
    return {
      mode,
      leads,
      lines: card.lines,
      text: card.lines.join('\n'),
      replyMarkup: card.replyMarkup,
    };
  }

  if (mode === 'research_report') {
    const boardLite = planCampaignBoard({ utterance: input.utterance, companyId: input.companyId });
    const research = await buildMarketIntelligenceReport({
      propertyHint: boardLite.propertyHint,
      companyId: input.companyId,
    });
    const card = researchCard(research);
    await rememberPlanningEvent({
      companyId: input.companyId,
      kind: 'research',
      title: 'Research xong',
      detail: research.title,
      entityId: research.id,
    });
    return {
      mode,
      research,
      lines: card.lines,
      text: card.lines.join('\n'),
      replyMarkup: card.replyMarkup,
    };
  }

  if (mode === 'mission_proposals') {
    const boardLite = planCampaignBoard({ utterance: input.utterance, companyId: input.companyId });
    const missions = proposeMissions({ propertyHint: boardLite.propertyHint, campaignName: boardLite.name });
    const card = missionCardsBlock(missions);
    await rememberPlanningEvent({
      companyId: input.companyId,
      kind: 'mission',
      title: 'Mission mới (đề xuất)',
      detail: `${missions.length} missions`,
    });
    return {
      mode,
      missions,
      lines: card.lines,
      text: card.lines.join('\n'),
      replyMarkup: card.replyMarkup,
    };
  }

  if (mode === 'content_plan') {
    const boardLite = planCampaignBoard({ utterance: input.utterance, companyId: input.companyId });
    const content = planContentSchedule({
      campaignName: boardLite.name,
      propertyHint: boardLite.propertyHint,
    });
    const card = contentPlanCard(content);
    await rememberPlanningEvent({
      companyId: input.companyId,
      kind: 'content',
      title: 'Content plan',
      detail: `${content.schedule.length} slots`,
      entityId: content.id,
    });
    return {
      mode,
      content,
      lines: card.lines,
      text: card.lines.join('\n'),
      replyMarkup: card.replyMarkup,
    };
  }

  if (mode === 'recommendations') {
    const board = planCampaignBoard({ utterance: input.utterance, companyId: input.companyId });
    const research = await buildMarketIntelligenceReport({
      propertyHint: board.propertyHint,
      companyId: input.companyId,
    });
    const content = planContentSchedule({ campaignName: board.name, propertyHint: board.propertyHint });
    const recommendations = buildCampaignRecommendations({ board, research, content });
    const card = recommendationCards(recommendations);
    return {
      mode,
      board,
      research,
      content,
      recommendations,
      lines: card.lines,
      text: card.lines.join('\n'),
      replyMarkup: card.replyMarkup,
    };
  }

  // default: campaign_board — full employee loop (plan + research + missions + content + recs)
  const board = planCampaignBoard({ utterance: input.utterance, companyId: input.companyId });
  const research = await buildMarketIntelligenceReport({
    propertyHint: board.propertyHint,
    companyId: input.companyId,
  });
  const missions = proposeMissions({ propertyHint: board.propertyHint, campaignName: board.name });
  const content = planContentSchedule({ campaignName: board.name, propertyHint: board.propertyHint });
  const recommendations = buildCampaignRecommendations({ board, research, content });
  const card = campaignCard(board);

  await rememberPlanningEvent({
    companyId: input.companyId,
    kind: 'campaign',
    title: 'Campaign tạo',
    detail: board.name,
    entityId: board.id,
    payload: { boardId: board.id, priority: board.priority },
  });

  const extra = [
    '',
    `Research: TB ${research.avgPricePerSqm} ${research.priceUnit}`,
    `Missions đề xuất: ${missions.length}`,
    `Content slots: ${content.schedule.length}`,
    `Recs: ${recommendations[0]?.message || '—'}`,
  ];

  return {
    mode: 'campaign_board',
    board,
    research,
    missions,
    content,
    recommendations,
    lines: [...card.lines, ...extra],
    text: [...card.lines, ...extra].join('\n'),
    replyMarkup: card.replyMarkup,
  };
}

export { formatTimelineLines };
