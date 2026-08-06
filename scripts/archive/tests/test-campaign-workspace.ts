import assert from 'node:assert/strict';

import {
  buildAiThoughts,
  deriveCampaignHealth,
  formatCampaignWorkspaceLines,
} from '../server/modules/planning/campaignWorkspace.ts';
import type { LivingCampaign } from '../server/modules/planning/types.ts';

function baseCampaign(over: Partial<LivingCampaign> = {}): LivingCampaign {
  return {
    id: 'cmtest0000000000000000001',
    companyId: null,
    name: 'Mai Đăng Chơn',
    goal: 'Tạo buyer VIP',
    priority: 'high',
    owner: 'ai',
    status: 'finding_leads',
    propertyHint: 'Mai Đăng Chơn',
    utterance: 'bán mạnh Mai Đăng Chơn',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: {
      audience: ['HN investor'],
      budget: 'organic',
      health: 70,
      timeline: [],
      tasks: [],
      orchestratorTasks: [],
      progress: { percent: 40, currentPhase: 'finding_leads', phasesDone: ['planning', 'researching'] },
      metrics: {
        leadTotal: 4,
        leadVip: 2,
        leadContacted: 1,
        leadConverted: 0,
        missionsProposed: 3,
        contentSlots: 5,
        contentApproved: 2,
        recommendationsOpen: 1,
      },
      research: {
        id: 'r1',
        title: 'Research MDC',
        propertyHint: 'Mai Đăng Chơn',
        avgPricePerSqm: null,
        minPricePerSqm: null,
        maxPricePerSqm: null,
        priceUnit: 'tỷ',
        sources: [],
        topSimilarPosts: [],
        topBrokers: [],
        topKeywords: ['mai đăng chơn'],
        trends: ['giá tăng'],
        competitors: ['broker A'],
        priceTrend: 'tăng nhẹ',
        demandTrend: 'ổn',
        buyerSignals: [],
        suggestedPositioning: 'đất sổ đỏ',
        summary: 'ok',
        createdAt: new Date().toISOString(),
      },
      missions: [],
      content: null,
      leads: [],
      recommendations: [
        {
          id: 'rec1',
          campaignName: 'Mai Đăng Chơn',
          severity: 'warn',
          message: 'Tăng ngân sách Facebook',
          actionLabel: 'Boost FB',
        },
      ],
      publishProposal: null,
      operationalMemory: [],
      planChecklist: [],
    },
    ...over,
  };
}

const healthy = deriveCampaignHealth(baseCampaign());
assert.ok(['healthy', 'warning'].includes(healthy.level), healthy.level);

const critical = deriveCampaignHealth(
  baseCampaign({
    status: 'rejected',
    state: {
      ...baseCampaign().state,
      recommendations: [
        {
          id: 'c',
          campaignName: 'x',
          severity: 'critical',
          message: 'Price premium',
          actionLabel: 'Cut',
        },
      ],
    },
  }),
);
assert.equal(critical.level, 'critical');

const noLead = deriveCampaignHealth(
  baseCampaign({
    state: {
      ...baseCampaign().state,
      metrics: { ...baseCampaign().state.metrics, leadTotal: 0, leadVip: 0 },
      leads: [],
    },
  }),
);
assert.ok(noLead.score > 0, 'campaign without leads still has health score');

const thoughts = buildAiThoughts({
  campaign: baseCampaign(),
  board: {
    id: 'b',
    name: 'Mai Đăng Chơn',
    goal: 'g',
    audience: [],
    budget: 'organic',
    priority: 'high',
    propertyHint: 'Mai Đăng Chơn',
    planChecklist: [],
    tasks: [],
    health: 70,
    createdAt: new Date().toISOString(),
  },
  health: healthy,
  overview: {
    name: 'Mai Đăng Chơn',
    goal: 'g',
    priority: 'high',
    status: 'finding_leads',
    progressPercent: 40,
    owner: null,
    propertyHint: 'Mai Đăng Chơn',
    confidence: 70,
    roiNote: 'n/a',
  },
  research: baseCampaign().state.research,
  missions: [{ id: 'm1', name: 'M1', persona: 'p', areaHint: 'a', intent: 'i', priority: 'high', suggestedTemplateKey: 't' }],
  buyers: { candidates: 4, vip: 2, contacted: 1, converted: 0, leads: [] },
  content: { plan: null, slots: 5, approved: 2, draft: 3, scheduled: 0, published: 0 },
  publish: { proposal: null, suggestedChannel: null, approved: false, successNote: 'n/a' },
  knowledge: { mappedConcepts: [], keywordHints: [] },
  sales: {
    pipelineValueTy: 1,
    expectedRevenueTy: 0.5,
    negotiating: 1,
    won: 0,
    lost: 0,
    nextAction: null,
  },
  orchestrator: {
    tasks: [],
    progress: {
      total: 0,
      completed: 0,
      running: 0,
      waitingApproval: 0,
      failed: 0,
      pending: 0,
      percent: 0,
      stuck: [],
    },
    ready: [],
  },
  trace: null,
  timeline: [],
  recommendations: baseCampaign().state.recommendations,
} as any);

assert.match(thoughts, /Mai Đăng Chơn/);
assert.match(thoughts, /buyer/i);

const lines = formatCampaignWorkspaceLines({
  ...( {
    campaign: baseCampaign(),
    board: {
      id: 'b',
      name: 'Mai Đăng Chơn',
      goal: 'g',
      audience: [],
      budget: 'organic' as const,
      priority: 'high' as const,
      propertyHint: 'Mai Đăng Chơn',
      planChecklist: [],
      tasks: [],
      health: 70,
      createdAt: new Date().toISOString(),
    },
    health: healthy,
    overview: {
      name: 'Mai Đăng Chơn',
      goal: 'g',
      priority: 'high',
      status: 'finding_leads' as const,
      progressPercent: 40,
      owner: null,
      propertyHint: 'Mai Đăng Chơn',
      confidence: 70,
      roiNote: 'n/a',
    },
    research: baseCampaign().state.research,
    missions: [],
    buyers: { candidates: 4, vip: 2, contacted: 0, converted: 0, leads: [] },
    content: { plan: null, slots: 0, approved: 0, draft: 0, scheduled: 0, published: 0 },
    publish: { proposal: null, suggestedChannel: null, approved: false, successNote: 'n/a' },
    knowledge: { mappedConcepts: [], keywordHints: [] },
    sales: {
      pipelineValueTy: 0,
      expectedRevenueTy: 0,
      negotiating: 0,
      won: 0,
      lost: 0,
      nextAction: null,
    },
    orchestrator: {
      tasks: [],
      progress: {
        total: 0,
        completed: 0,
        running: 0,
        waitingApproval: 0,
        failed: 0,
        pending: 0,
        percent: 0,
        stuck: [],
      },
      ready: [],
    },
    trace: null,
    timeline: [],
    recommendations: [],
    aiThoughts: thoughts,
  } as any),
});
assert.ok(lines.some(l => /Campaign Workspace/.test(l)));
assert.ok(lines.some(l => /AI Thoughts/.test(l)));

console.log('campaign-workspace: PASS');
