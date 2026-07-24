/**
 * Knowledge Center HTTP API.
 */

import type { Express, Request, Response } from 'express';
import {
  applyOutcomeFeedback,
  buildFeedbackCenterSnapshot,
  formatWeeklyEvolution,
} from '../feedbackEngine';
import {
  buildKnowledgeSnapshot,
  getKnowledgeReportText,
} from '../knowledgeService';
import {
  buildKnowledgeAnalytics,
  formatKnowledgeHealthBriefing,
} from '../analyticsEngine';
import {
  recordFalseNegative,
  recordRuleConversion,
} from '../analyticsStore';
import {
  learnFromAdminRule,
  learnFromLeadCorrection,
  proposeFromAiEnrichment,
} from '../learning';
import type { FeedbackOutcome } from '../feedbackTypes';
import {
  deleteConcept,
  exportKnowledgeLibrary,
  getKnowledgeHealth,
  getRuleCoverage,
  ignoreUnknownTerm,
  importConcepts,
  listConcepts,
  listSuggestions,
  listUnknownTerms,
  mapUnknownTerm,
  mergeConcepts,
  resetConceptsToDefault,
  resolveSuggestion,
  upsertConcept,
} from '../store';
import type { KnowledgeConcept } from '../types';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerKnowledgeBaseRoutes(app: Express): void {
  app.get('/api/knowledge/snapshot', async (_req, res) => {
    try {
      res.json({ status: 'success', data: await buildKnowledgeSnapshot() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Snapshot failed');
    }
  });

  app.get('/api/knowledge/health', async (_req, res) => {
    try {
      res.json({
        status: 'success',
        data: { health: await getKnowledgeHealth(), coverage: await getRuleCoverage() },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Health failed');
    }
  });

  app.get('/api/knowledge/report', async (_req, res) => {
    try {
      res.json({
        status: 'success',
        data: { text: await getKnowledgeReportText(), health: await getKnowledgeHealth() },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Report failed');
    }
  });

  app.get('/api/knowledge/analytics', async (_req, res) => {
    try {
      res.json({ status: 'success', data: await buildKnowledgeAnalytics() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Analytics failed');
    }
  });

  app.get('/api/knowledge/health-briefing', async (_req, res) => {
    try {
      const snap = await buildKnowledgeAnalytics();
      res.json({
        status: 'success',
        data: { text: formatKnowledgeHealthBriefing(snap), analytics: snap },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Health briefing failed');
    }
  });

  app.post('/api/knowledge/analytics/conversion', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const keywords = Array.isArray(body.keywords)
        ? body.keywords.map(String)
        : typeof body.keyword === 'string'
          ? [body.keyword]
          : [];
      await recordRuleConversion({
        keywords,
        locationLabel: typeof body.locationLabel === 'string' ? body.locationLabel : null,
        sourceId: typeof body.sourceId === 'string' ? body.sourceId : null,
        missionId: typeof body.missionId === 'string' ? body.missionId : null,
      });
      res.json({ status: 'success', data: { recorded: true } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Conversion failed');
    }
  });

  app.post('/api/knowledge/analytics/false-negative', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const term = String(body.term || '').trim();
      if (!term) return sendError(res, 400, 'term required');
      await recordFalseNegative({
        term,
        suggestedConcept: typeof body.suggestedConcept === 'string' ? body.suggestedConcept : undefined,
      });
      res.json({ status: 'success', data: { recorded: true } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'FN failed');
    }
  });

  /** H3.6.3 — Continuous feedback from real outcomes (does not import Sales Layer) */
  app.post('/api/knowledge/feedback/outcome', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const outcome = String(body.outcome || '').trim() as FeedbackOutcome;
      if (!outcome) return sendError(res, 400, 'outcome required');
      const data = await applyOutcomeFeedback({
        outcome,
        keywords: Array.isArray(body.keywords) ? body.keywords.map(String) : undefined,
        conceptIds: Array.isArray(body.conceptIds) ? body.conceptIds.map(String) : undefined,
        sourceId: typeof body.sourceId === 'string' ? body.sourceId : null,
        sourceLabel: typeof body.sourceLabel === 'string' ? body.sourceLabel : null,
        missionId: typeof body.missionId === 'string' ? body.missionId : null,
        missionLabel: typeof body.missionLabel === 'string' ? body.missionLabel : null,
        campaignKey: typeof body.campaignKey === 'string' ? body.campaignKey : null,
        contentId: typeof body.contentId === 'string' ? body.contentId : null,
        revenue: typeof body.revenue === 'number' ? body.revenue : undefined,
        note: typeof body.note === 'string' ? body.note : null,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Feedback failed');
    }
  });

  app.get('/api/knowledge/feedback/snapshot', async (_req, res) => {
    try {
      res.json({ status: 'success', data: await buildFeedbackCenterSnapshot() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Feedback snapshot failed');
    }
  });

  app.get('/api/knowledge/feedback/weekly', async (_req, res) => {
    try {
      const snap = await buildFeedbackCenterSnapshot();
      res.json({
        status: 'success',
        data: { text: formatWeeklyEvolution(snap), weekly: snap.weekly, snapshot: snap },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Weekly failed');
    }
  });

  app.get('/api/knowledge/concepts', async (_req, res) => {
    try {
      res.json({ status: 'success', data: await listConcepts() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Concepts failed');
    }
  });

  app.post('/api/knowledge/concepts', async (req, res) => {
    try {
      const body = (req.body || {}) as Partial<KnowledgeConcept>;
      if (!body.concept || !body.category) return sendError(res, 400, 'concept and category required');
      const concept: KnowledgeConcept = {
        id: String(body.id || `kb_${Date.now()}`),
        category: body.category,
        concept: String(body.concept),
        aliases: Array.isArray(body.aliases) ? body.aliases.map(String) : [],
        synonyms: Array.isArray(body.synonyms) ? body.synonyms.map(String) : [],
        weight: typeof body.weight === 'number' ? body.weight : 20,
        trust: typeof body.trust === 'number' ? body.trust : 60,
        examples: Array.isArray(body.examples) ? body.examples.map(String) : [],
        negativeExamples: Array.isArray(body.negativeExamples) ? body.negativeExamples.map(String) : [],
        campaignMapping: body.campaignMapping ? String(body.campaignMapping) : null,
        enabled: body.enabled !== false,
        priority: typeof body.priority === 'number' ? body.priority : 50,
        hitCount: typeof body.hitCount === 'number' ? body.hitCount : 0,
        source: body.source || 'admin',
        updatedAt: new Date().toISOString(),
      };
      res.json({ status: 'success', data: await upsertConcept(concept) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Upsert failed');
    }
  });

  app.delete('/api/knowledge/concepts/:id', async (req, res) => {
    try {
      res.json({ status: 'success', data: await deleteConcept(String(req.params.id)) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Delete failed');
    }
  });

  app.post('/api/knowledge/concepts/merge', async (req, res) => {
    try {
      const body = (req.body || {}) as { sourceId?: string; targetId?: string };
      if (!body.sourceId || !body.targetId) return sendError(res, 400, 'sourceId and targetId required');
      res.json({
        status: 'success',
        data: await mergeConcepts(String(body.sourceId), String(body.targetId)),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Merge failed');
    }
  });

  app.get('/api/knowledge/export', async (_req, res) => {
    try {
      res.json({ status: 'success', data: await exportKnowledgeLibrary() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Export failed');
    }
  });

  app.post('/api/knowledge/import', async (req, res) => {
    try {
      const body = (req.body || {}) as { concepts?: KnowledgeConcept[] };
      if (!Array.isArray(body.concepts)) return sendError(res, 400, 'concepts array required');
      res.json({ status: 'success', data: await importConcepts(body.concepts) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Import failed');
    }
  });

  app.post('/api/knowledge/reset', async (_req, res) => {
    try {
      res.json({ status: 'success', data: await resetConceptsToDefault() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Reset failed');
    }
  });

  app.get('/api/knowledge/unknown', async (_req, res) => {
    try {
      res.json({ status: 'success', data: await listUnknownTerms() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Unknown failed');
    }
  });

  app.post('/api/knowledge/unknown/:id/map', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      if (!body.category) return sendError(res, 400, 'category required');
      res.json({
        status: 'success',
        data: await mapUnknownTerm({
          termId: String(req.params.id),
          category: body.category as KnowledgeConcept['category'],
          conceptId: typeof body.conceptId === 'string' ? body.conceptId : null,
          conceptName: typeof body.conceptName === 'string' ? body.conceptName : undefined,
          weight: typeof body.weight === 'number' ? body.weight : undefined,
        }),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Map failed');
    }
  });

  app.post('/api/knowledge/unknown/:id/ignore', async (req, res) => {
    try {
      res.json({ status: 'success', data: await ignoreUnknownTerm(String(req.params.id)) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Ignore failed');
    }
  });

  app.get('/api/knowledge/suggestions', async (req, res) => {
    try {
      const status =
        typeof req.query.status === 'string'
          ? (req.query.status as 'pending' | 'approved' | 'rejected')
          : 'pending';
      res.json({ status: 'success', data: await listSuggestions(status) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Suggestions failed');
    }
  });

  app.post('/api/knowledge/suggestions/:id/approve', async (req, res) => {
    try {
      res.json({ status: 'success', data: await resolveSuggestion(String(req.params.id), 'approve') });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Approve failed');
    }
  });

  app.post('/api/knowledge/suggestions/:id/reject', async (req, res) => {
    try {
      res.json({ status: 'success', data: await resolveSuggestion(String(req.params.id), 'reject') });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Reject failed');
    }
  });

  /** Learning hooks (no Sales Layer import) */
  app.post('/api/knowledge/learn/lead-correction', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const text = String(body.text || '').trim();
      const correctedIntent = String(body.correctedIntent || body.intent || '').trim();
      if (!text || !correctedIntent) return sendError(res, 400, 'text and correctedIntent required');
      const data = await learnFromLeadCorrection({
        text,
        correctedIntent: correctedIntent as KnowledgeConcept['category'],
        note: typeof body.note === 'string' ? body.note : undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Learn failed');
    }
  });

  app.post('/api/knowledge/learn/admin-rule', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      if (!body.keyword || typeof body.weight !== 'number' || !body.category) {
        return sendError(res, 400, 'keyword, weight, category required');
      }
      res.json({
        status: 'success',
        data: await learnFromAdminRule({
          keyword: String(body.keyword),
          weight: Number(body.weight),
          category: body.category as KnowledgeConcept['category'],
          group: typeof body.group === 'string' ? body.group : undefined,
        }),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Learn failed');
    }
  });

  app.post('/api/knowledge/learn/ai-propose', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      if (!body.term || !body.proposedCategory) return sendError(res, 400, 'term and proposedCategory required');
      await proposeFromAiEnrichment({
        term: String(body.term),
        proposedCategory: body.proposedCategory as KnowledgeConcept['category'],
        confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        occurrences: typeof body.occurrences === 'number' ? body.occurrences : undefined,
        conceptName: typeof body.conceptName === 'string' ? body.conceptName : undefined,
      });
      res.json({ status: 'success', data: { queued: true } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Propose failed');
    }
  });
}
