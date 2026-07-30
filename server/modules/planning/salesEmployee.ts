/**
 * AI Sales Employee façade — Copilot / Telegram / API entry.
 * Orchestrates planning modules + Campaign Runtime (H2.1).
 */

import { planCampaignBoard } from './campaignPlanner';
import {
  approveCampaign,
  campaignRuntimeSummaryLines,
  completeCampaign,
  createAndRunCampaign,
  findCampaignByPrefix,
  listCampaigns,
  livingToBoard,
  rejectCampaign,
} from './campaignRuntime';
import { planContentSchedule } from './contentPlanner';
import { rankLeadCards } from './leadIntelligenceV2';
import { proposeMissions } from './missionPlanner';
import { formatTimelineLines, loadTodayTimeline, rememberPlanningEvent } from './operationalMemory';
import { buildCampaignRecommendations } from './recommendationEngine';
import { buildMarketIntelligenceReport } from './researchAgent';
import { formatOrchestratorWorkLines } from './taskOrchestrator';
import {
  campaignCard,
  contentPlanCard,
  fleetEmployeeCard,
  leadCardsBlock,
  missionCardsBlock,
  recommendationCards,
  researchCard,
  timelineCard,
  workStatusCard,
} from './cards/telegramCards';
import { getCampaignWorkspace } from './campaignWorkspace';
import { AssetValidationError } from './asset/AssetValidator';
import { isCampaignPlanningUtterance } from './campaignIntent';
import type { LivingCampaign } from './types';
import type { SalesEmployeeResult } from './types';
import type { InlineKeyboard } from '../control-plane/inlineKeyboard';

export type SalesEmployeeReply = SalesEmployeeResult & {
  replyMarkup?: InlineKeyboard;
};

async function enrichedCampaignCard(living: LivingCampaign) {
  const board = livingToBoard(living);
  try {
    const ws = await getCampaignWorkspace(living.id);
    if (ws) {
      return campaignCard(board, living.id, living.state.orchestratorTasks, {
        health: `${ws.health.level} (${ws.health.score})`,
        researchDone: Boolean(ws.research),
        missions: ws.missions.length,
        leads: ws.buyers.candidates,
        buyers: ws.buyers.vip + ws.sales.negotiating + ws.buyers.converted,
        drafts: ws.content.draft,
        published: ws.content.published,
        salesLine: `Sales  ${ws.sales.negotiating} negotiating · won ${ws.sales.won}`,
        revenueLine: `Revenue  expected ${ws.sales.expectedRevenueTy.toFixed(1)} tỷ`,
        aiThoughts: ws.aiThoughts,
      });
    }
  } catch {
    /* workspace enrich is best-effort */
  }
  return campaignCard(board, living.id, living.state.orchestratorTasks);
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCampaignId(text: string): string | null {
  const m =
    text.match(/campaign\s+([a-z0-9_-]{8,})/i) ||
    text.match(/\b(c[a-z0-9]{20,})\b/i) ||
    text.match(/\b([a-z0-9]{20,})\b/i);
  return m?.[1] || null;
}

export function detectSalesMode(
  text: string,
): SalesEmployeeResult['mode'] {
  const t = norm(text);
  if (/^approve\s+campaign\b|duyệt campaign|duyet campaign/.test(t)) return 'campaign_approve';
  if (/^reject\s+campaign\b|từ chối campaign|tu choi campaign/.test(t)) return 'campaign_reject';
  if (/complete\s+campaign\b|đóng campaign|dong campaign/.test(t)) return 'campaign_approve';
  if (/view\s+campaign\b|mở campaign|mo campaign|open campaign/.test(t)) return 'campaign_board';
  // H2.5 — campaign planning before mission/content/research branches
  if (isCampaignPlanningUtterance(text)) return 'campaign_board';
  if (/hôm nay ai đang làm|hom nay ai dang lam|ai đang làm gì|ai dang lam gi|đang làm gì|dang lam gi/.test(t)) {
    return 'work_status';
  }
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
  if (/^\/?ai\b|sales employee|help ai|ai employee/.test(t)) return 'help';
  return 'help';
}

export async function runSalesEmployee(input: {
  utterance: string;
  companyId?: string | null;
  mode?: SalesEmployeeResult['mode'];
  telegramChatId?: string | null;
  telegramUserId?: string | null;
  sessionId?: string | null;
  intentName?: string | null;
}): Promise<SalesEmployeeReply> {
  const mode = input.mode || detectSalesMode(input.utterance);
  const utteranceNorm = norm(input.utterance);

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

  if (mode === 'campaign_approve') {
    const id = extractCampaignId(input.utterance);
    if (!id) {
      return {
        mode,
        lines: ['Thiếu campaign id để Approve.'],
        text: 'Thiếu campaign id để Approve.',
      };
    }
    if (/complete\s+campaign/.test(utteranceNorm)) {
      const living = await completeCampaign(id);
      const lines = campaignRuntimeSummaryLines(living);
      return { mode, livingCampaign: living, lines, text: lines.join('\n'), board: livingToBoard(living) };
    }
    const living = await approveCampaign({ campaignId: id, actor: 'copilot' });
    const lines = campaignRuntimeSummaryLines(living);
    const card = await enrichedCampaignCard(living);
    return {
      mode,
      livingCampaign: living,
      board: livingToBoard(living),
      recommendations: living.state.recommendations,
      lines: [...card.lines, '', ...lines.slice(0, 12)],
      text: lines.join('\n'),
      replyMarkup: card.replyMarkup,
    };
  }

  if (mode === 'campaign_reject') {
    const id = extractCampaignId(input.utterance);
    if (!id) {
      return {
        mode,
        lines: ['Thiếu campaign id để Reject.'],
        text: 'Thiếu campaign id để Reject.',
      };
    }
    const living = await rejectCampaign({ campaignId: id, actor: 'copilot' });
    const lines = campaignRuntimeSummaryLines(living);
    return { mode, livingCampaign: living, lines, text: lines.join('\n'), board: livingToBoard(living) };
  }

  if (mode === 'timeline' || mode === 'work_status') {
    const campaigns = await listCampaigns({ companyId: input.companyId, limit: 5 });
    const active =
      campaigns.find(c => !['completed', 'rejected'].includes(c.status)) || campaigns[0];
    if (active?.state.orchestratorTasks?.length) {
      const lines = formatOrchestratorWorkLines({
        campaignName: active.name,
        tasks: active.state.orchestratorTasks,
      });
      const card = workStatusCard(lines, active.state.orchestratorTasks);
      const timeline = await loadTodayTimeline({ companyId: input.companyId });
      return {
        mode: mode === 'work_status' ? 'work_status' : 'timeline',
        timeline,
        livingCampaign: active,
        orchestratorTasks: active.state.orchestratorTasks,
        lines: card.lines,
        text: card.lines.join('\n'),
        replyMarkup: card.replyMarkup,
      };
    }
    const timeline = await loadTodayTimeline({ companyId: input.companyId });
    const card = timelineCard(timeline);
    return {
      mode: 'timeline',
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

  // View existing campaign by id (from inline Open)
  if (/^(view|open)\s+campaign\b/i.test(input.utterance.trim())) {
    const id = extractCampaignId(input.utterance);
    if (id) {
      const living = await findCampaignByPrefix(id);
      if (living) {
        const board = livingToBoard(living);
        const card = await enrichedCampaignCard(living);
        const lines = [...card.lines, '', ...campaignRuntimeSummaryLines(living).slice(4, 20)];
        return {
          mode: 'campaign_board',
          board,
          livingCampaign: living,
          research: living.state.research || undefined,
          missions: living.state.missions,
          content: living.state.content || undefined,
          leads: living.state.leads,
          recommendations: living.state.recommendations,
          lines,
          text: lines.join('\n'),
          replyMarkup: card.replyMarkup,
        };
      }
    }
  }

  // Campaign Runtime — create + auto-run lifecycle (not ephemeral board)
  const {
    beginExecutionTrace,
    finishExecutionTrace,
    finishTraceStep,
    runWithTraceContext,
    startTraceStep,
  } = await import('../execution-trace');

  const trace = await beginExecutionTrace({
    utterance: input.utterance,
    intentName: input.intentName || 'ai_sales_campaign',
    sessionId: input.sessionId,
    telegramChatId: input.telegramChatId,
    telegramUserId: input.telegramUserId,
    companyId: input.companyId,
  });

  let living: LivingCampaign;
  try {
    living = await runWithTraceContext(trace.traceId, async () => {
      await startTraceStep(trace.traceId, 'Intent Parser', 'parsing');
      await finishTraceStep(trace.traceId, 'Intent Parser', {
        status: 'ok',
        summary: `Campaign request detected · ${input.utterance.slice(0, 80)}`,
      });
      await startTraceStep(trace.traceId, 'Copilot', 'routing');
      await finishTraceStep(trace.traceId, 'Copilot', {
        status: 'ok',
        summary: 'Routed to Campaign Planner',
      });
      try {
        const created = await createAndRunCampaign({
          utterance: input.utterance,
          companyId: input.companyId,
        });
        await startTraceStep(trace.traceId, 'Response Telegram', 'reply');
        await finishTraceStep(trace.traceId, 'Response Telegram', {
          status: 'ok',
          summary: `Reply campaign ${created.name}`,
        });
        await finishExecutionTrace(trace.traceId, 'waiting_approval');
        return created;
      } catch (error: unknown) {
        await finishExecutionTrace(trace.traceId, 'failed');
        throw error;
      }
    });
  } catch (error: unknown) {
    if (error instanceof AssetValidationError) {
      return {
        mode: 'campaign_board',
        lines: [error.prompt],
        text: error.prompt,
      };
    }
    throw error;
  }
  const board = livingToBoard(living);
  const research = living.state.research!;
  const missions = living.state.missions;
  const content = living.state.content!;
  const recommendations = living.state.recommendations;
  const card = await enrichedCampaignCard(living);
  const summary = campaignRuntimeSummaryLines(living);

  return {
    mode: 'campaign_board',
    board,
    livingCampaign: living,
    research,
    missions,
    content,
    leads: living.state.leads,
    recommendations,
    lines: [...card.lines, '', ...summary.slice(0, 18)],
    text: [...card.lines, '', ...summary].join('\n'),
    replyMarkup: card.replyMarkup,
  };
}
export { formatTimelineLines };
