/**
 * Marketing Organization orchestrator — Brain over Publisher executor.
 */

import { prisma } from '../../prisma';
import { produceContentPack } from './contentFactory';
import { buildWeeklyContentCalendar } from './contentCalendar';
import { planContentReuse } from './contentReuse';
import { buildConversationItem } from './socialCare';
import { detectTrendsFromTexts } from './trendDetection';
import { buildSeoGaps } from './seoOrganization';
import { computeMarketingHealth, updateMarketingLearning } from './campaignHealth';
import { emptySnapshotExtras, loadMarketingState, saveMarketingState } from './store';
import type {
  ContentPack,
  ContentReusePlan,
  MarketingOrgSnapshot,
} from './types';

export async function buildMarketingSnapshot(input?: {
  companyId?: string | null;
  topic?: string | null;
}): Promise<MarketingOrgSnapshot> {
  const state = await loadMarketingState();
  const topic = input?.topic || state.defaultTopic || 'Mai Đăng Chơn';
  const since = new Date(Date.now() - 7 * 24 * 3600_000);

  const [drafts, jobs, findings, failedJobs] = await Promise.all([
    prisma.socialPostDraft.count({
      where: {
        ...(input?.companyId ? { companyId: input.companyId } : {}),
        createdAt: { gte: since },
      },
    }),
    prisma.socialPublishJob.findMany({
      where: {
        ...(input?.companyId ? { companyId: input.companyId } : {}),
        updatedAt: { gte: since },
      },
      take: 200,
      select: { status: true, scheduledAt: true },
    }),
    prisma.agentFinding.findMany({
      where: {
        ...(input?.companyId ? { companyId: input.companyId } : {}),
        createdAt: { gte: since },
        status: { notIn: ['duplicate'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: { id: true, title: true, summary: true, createdAt: true, classification: true },
    }),
    prisma.socialPublishJob.count({
      where: {
        ...(input?.companyId ? { companyId: input.companyId } : {}),
        status: 'failed',
        updatedAt: { gte: since },
      },
    }),
  ]);

  const published = jobs.filter(j => j.status === 'published').length;
  const calendar = buildWeeklyContentCalendar({ topic, campaignHint: topic });

  const trends = detectTrendsFromTexts(
    findings.map(f => ({ text: `${f.title} ${f.summary || ''}`, source: 'findings' as const })),
    6,
  );

  const conversationQueue = findings.slice(0, 40).map(f =>
    buildConversationItem({
      id: f.id,
      source: 'finding',
      text: `${f.title}. ${f.summary || ''}`,
      at: f.createdAt.toISOString(),
    }),
  );
  conversationQueue.sort((a, b) => b.priority - a.priority);

  const needReply = conversationQueue.filter(c => c.label === 'reply' || c.label === 'inbox').length;
  const buyerConversations = conversationQueue.filter(c => c.label === 'buyer').length;

  const draftTitles = await prisma.socialPostDraft
    .findMany({
      where: input?.companyId ? { companyId: input.companyId } : {},
      take: 40,
      select: { title: true },
      orderBy: { updatedAt: 'desc' },
    })
    .then(rows => rows.map(r => r.title || ''))
    .catch(() => [] as string[]);

  const seoGaps = buildSeoGaps({
    topic,
    existingTitles: draftTitles,
    trendingTopics: trends.map(t => t.topic),
  });

  const packs = state.packs.length
    ? state.packs
    : [produceContentPack({ topic, campaignHint: topic })];
  const reusePlans = state.reusePlans.length
    ? state.reusePlans
    : [planContentReuse({ sourceTitle: `Video tour ${topic}`, topic })];

  const contentProduced = Math.max(drafts, packs.reduce((n, p) => n + p.variants.length, 0));
  const reused = reusePlans.reduce((n, p) => n + p.cuts.length, 0);

  const health = computeMarketingHealth({
    contentProduced,
    published,
    reused,
    comments: conversationQueue.length,
    needReply,
    buyerConversations,
    trendingTopics: trends.length,
    seoGaps: seoGaps.length,
    failedJobs,
  });

  if (trends[0] && !/video/i.test(health.recommendation)) {
    health.recommendation = `Nên quay thêm 1 video ${trends[0].topic}.`;
  }

  return {
    ...emptySnapshotExtras(),
    packs: packs.slice(0, 20),
    calendar,
    reusePlans: reusePlans.slice(0, 20),
    conversationQueue: conversationQueue.slice(0, 50),
    trends,
    seoGaps,
    health,
    learning: state.learning,
    updatedAt: new Date().toISOString(),
  };
}

export async function createFactoryPack(input: {
  topic: string;
  campaignHint?: string | null;
  usp?: string | null;
}): Promise<ContentPack> {
  const pack = produceContentPack(input);
  const state = await loadMarketingState();
  state.packs = [pack, ...state.packs].slice(0, 30);
  state.defaultTopic = input.topic;
  state.learning = updateMarketingLearning(state.learning, {
    format: pack.variants[0]?.kind,
    cta: pack.variants[0]?.cta || undefined,
    campaign: input.campaignHint || input.topic,
    note: `Factory pack ${pack.id}`,
  });
  await saveMarketingState(state);
  return pack;
}

export async function createReusePlan(input: {
  sourceTitle: string;
  topic?: string;
}): Promise<ContentReusePlan> {
  const plan = planContentReuse(input);
  const state = await loadMarketingState();
  state.reusePlans = [plan, ...state.reusePlans].slice(0, 30);
  state.learning = updateMarketingLearning(state.learning, {
    format: 'reuse_video',
    campaign: input.topic,
    note: `Reuse ${plan.id}`,
  });
  await saveMarketingState(state);
  return plan;
}

export function formatMarketingBriefing(snapshot: MarketingOrgSnapshot): string {
  const h = snapshot.health;
  return [
    'Marketing Health',
    `${h.healthScore}%`,
    '',
    `Content  ${h.contentProduced}`,
    `Published  ${h.published}`,
    `Reused  ${h.reused}`,
    `Comments  ${h.comments}`,
    `Need Reply  ${h.needReply}`,
    `Buyer Conversation  ${h.buyerConversations}`,
    `Trending Topic  ${h.trendingTopics}`,
    `SEO Gap  ${h.seoGaps}`,
    '',
    'Recommendation',
    h.recommendation,
  ].join('\n');
}
