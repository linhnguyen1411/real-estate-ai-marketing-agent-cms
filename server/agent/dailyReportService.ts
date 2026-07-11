import type { AuthUser } from '../../src/types';
import { prisma } from '../prisma';
import { generateText } from '../aiService';
import { buildCompanyScopeFilter } from './agentDb';

export interface DailyReportQuery {
  /** YYYY-MM-DD in Asia/Ho_Chi_Minh; default = today */
  date?: string;
  /** When true, call AI to write narrative from metrics only */
  includeAiSummary?: boolean;
}

export interface DailyReportMetrics {
  date: string;
  timezone: string;
  rangeStart: string;
  rangeEnd: string;
  sourcesScanned: number;
  postsNew: number;
  findingsTotal: number;
  findingsByScore: {
    hot: number;
    warm: number;
    cool: number;
    buckets: Array<{ label: string; min: number; max: number; count: number }>;
  };
  topLeads: Array<{
    id: string;
    title: string;
    score: number;
    summary: string;
    sourceName: string | null;
    missionName: string | null;
    createdAt: string;
  }>;
  mostEffectiveSources: Array<{
    sourceId: string;
    sourceName: string;
    sourceType: string;
    findingsCount: number;
    avgScore: number;
    postsNew: number;
  }>;
  demandThemes: Array<{
    theme: string;
    count: number;
  }>;
  failedJobs: Array<{
    id: string;
    type: string;
    sourceName: string | null;
    missionName: string | null;
    errorMessage: string | null;
    finishedAt: string | null;
  }>;
  browserSessionHealth: {
    total: number;
    byStatus: Record<string, number>;
    needsLogin: number;
    staleHeartbeat: number;
    healthy: number;
  };
}

export interface DailyReportResult {
  metrics: DailyReportMetrics;
  aiSummary: string | null;
  aiSummaryError: string | null;
  /** Explicit: numbers come from DB only */
  dataSource: 'database';
}

const TZ = 'Asia/Ho_Chi_Minh';
const STALE_HEARTBEAT_MS = 90_000;

const DAILY_SUMMARY_SYSTEM = `Bạn là trợ lý báo cáo nội bộ CMS bất động sản.
Nhiệm vụ: viết đoạn tóm tắt ngắn (3–6 câu tiếng Việt) từ JSON metrics đã cho.
QUY TẮC BẮT BUỘC:
- Chỉ dùng số liệu có trong JSON. Không bịa, không ước lượng, không thêm số mới.
- Nếu một mục = 0 hoặc thiếu, nói rõ "không có" / "0".
- Không đề xuất hành động dựa trên số liệu không tồn tại.
- Không dùng markdown heading; chỉ đoạn văn xuôi.`;

export function parseReportDate(dateStr?: string): { date: string; start: Date; end: Date } {
  const today = formatDateInTz(new Date(), TZ);
  const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim()) ? dateStr.trim() : today;
  // Interpret calendar day in Asia/Ho_Chi_Minh (UTC+7, no DST)
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(`${date}T23:59:59.999+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const fallbackStart = new Date(`${today}T00:00:00+07:00`);
    const fallbackEnd = new Date(`${today}T23:59:59.999+07:00`);
    return { date: today, start: fallbackStart, end: fallbackEnd };
  }
  return { date, start, end };
}

function formatDateInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function extractThemesFromFinding(finding: {
  title: string;
  reasons: unknown;
  extractedData: unknown;
}): string[] {
  const themes = new Set<string>();
  const reasons = Array.isArray(finding.reasons) ? finding.reasons : [];
  for (const reason of reasons) {
    const text = String(reason);
    const match = text.match(/từ khóa "([^"]+)"/i) || text.match(/keyword "([^"]+)"/i);
    if (match?.[1]) themes.add(match[1].toLowerCase());
  }

  const data = (finding.extractedData && typeof finding.extractedData === 'object'
    ? finding.extractedData
    : {}) as Record<string, unknown>;
  const matched = data.matchedPositive ?? data.positiveKeywords;
  if (Array.isArray(matched)) {
    for (const kw of matched) {
      const s = String(kw).trim().toLowerCase();
      if (s) themes.add(s);
    }
  }

  if (themes.size === 0 && finding.title) {
    // Fallback: first 4 significant words from title (still from DB text, not invented)
    const words = finding.title
      .toLowerCase()
      .split(/[\s,./|]+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3)
      .slice(0, 4);
    for (const w of words) themes.add(w);
  }

  return [...themes];
}

export async function buildDailyReportMetrics(
  user: AuthUser,
  query: DailyReportQuery = {},
): Promise<DailyReportMetrics> {
  const companyScope = buildCompanyScopeFilter(user);
  const { date, start, end } = parseReportDate(query.date);
  const rangeFilter = { gte: start, lte: end };

  const [
    sourcesScanned,
    postsNew,
    findingsTotal,
    findings,
    findingsBySource,
    postsBySource,
    failedJobs,
    sessions,
  ] = await Promise.all([
    prisma.agentSource.count({
      where: {
        ...companyScope,
        lastScannedAt: rangeFilter,
      },
    }),
    prisma.scannedContent.count({
      where: {
        ...companyScope,
        collectedAt: rangeFilter,
      },
    }),
    prisma.agentFinding.count({
      where: {
        ...companyScope,
        createdAt: rangeFilter,
      },
    }),
    prisma.agentFinding.findMany({
      where: {
        ...companyScope,
        createdAt: rangeFilter,
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: {
        source: { select: { id: true, name: true, type: true } },
        mission: { select: { id: true, name: true } },
      },
    }),
    prisma.agentFinding.groupBy({
      by: ['sourceId'],
      where: {
        ...companyScope,
        createdAt: rangeFilter,
      },
      _count: { _all: true },
      _avg: { score: true },
      orderBy: { _count: { sourceId: 'desc' } },
      take: 10,
    }),
    prisma.scannedContent.groupBy({
      by: ['sourceId'],
      where: {
        ...companyScope,
        collectedAt: rangeFilter,
      },
      _count: { _all: true },
    }),
    prisma.agentJob.findMany({
      where: {
        ...companyScope,
        status: 'failed',
        OR: [
          { finishedAt: rangeFilter },
          { finishedAt: null, updatedAt: rangeFilter },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        source: { select: { name: true } },
        mission: { select: { name: true } },
      },
    }),
    prisma.browserSession.findMany({
      where: companyScope,
      select: {
        id: true,
        status: true,
        lastHeartbeatAt: true,
      },
    }),
  ]);

  // Score buckets from all findings in range (groupBy raw SQL via multiple counts for accuracy)
  const [hot, warm, cool, bucket90, bucket75, bucket50, bucket0] = await Promise.all([
    prisma.agentFinding.count({ where: { ...companyScope, createdAt: rangeFilter, score: { gte: 75 } } }),
    prisma.agentFinding.count({ where: { ...companyScope, createdAt: rangeFilter, score: { gte: 50, lt: 75 } } }),
    prisma.agentFinding.count({ where: { ...companyScope, createdAt: rangeFilter, score: { lt: 50 } } }),
    prisma.agentFinding.count({ where: { ...companyScope, createdAt: rangeFilter, score: { gte: 90 } } }),
    prisma.agentFinding.count({ where: { ...companyScope, createdAt: rangeFilter, score: { gte: 75, lt: 90 } } }),
    prisma.agentFinding.count({ where: { ...companyScope, createdAt: rangeFilter, score: { gte: 50, lt: 75 } } }),
    prisma.agentFinding.count({ where: { ...companyScope, createdAt: rangeFilter, score: { lt: 50 } } }),
  ]);

  const buckets = [
    { label: '90–100', min: 90, max: 100, count: bucket90 },
    { label: '75–89', min: 75, max: 89, count: bucket75 },
    { label: '50–74', min: 50, max: 74, count: bucket50 },
    { label: '0–49', min: 0, max: 49, count: bucket0 },
  ];

  const sourceIds = [
    ...new Set([
      ...findingsBySource.map(r => r.sourceId),
      ...postsBySource.map(r => r.sourceId),
    ]),
  ];
  const sources = sourceIds.length
    ? await prisma.agentSource.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, name: true, type: true },
      })
    : [];
  const sourceMap = new Map(sources.map(s => [s.id, s]));
  const postsMap = new Map(postsBySource.map(r => [r.sourceId, r._count._all]));

  const mostEffectiveSources = findingsBySource.map(row => {
    const src = sourceMap.get(row.sourceId);
    return {
      sourceId: row.sourceId,
      sourceName: src?.name ?? row.sourceId,
      sourceType: src?.type ?? 'unknown',
      findingsCount: row._count._all,
      avgScore: Math.round((row._avg.score ?? 0) * 10) / 10,
      postsNew: postsMap.get(row.sourceId) ?? 0,
    };
  });

  const themeCounts = new Map<string, number>();
  for (const finding of findings) {
    for (const theme of extractThemesFromFinding(finding)) {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    }
  }
  const demandThemes = [...themeCounts.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const now = Date.now();
  const byStatus: Record<string, number> = {};
  let needsLogin = 0;
  let staleHeartbeat = 0;
  let healthy = 0;
  for (const session of sessions) {
    const status = session.status || 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === 'needs_login') needsLogin += 1;
    const hb = session.lastHeartbeatAt?.getTime() ?? 0;
    const isStale = !hb || now - hb > STALE_HEARTBEAT_MS;
    if (isStale && status !== 'offline') staleHeartbeat += 1;
    if (!isStale && (status === 'ready' || status === 'running' || status === 'online')) {
      healthy += 1;
    }
  }

  return {
    date,
    timezone: TZ,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    sourcesScanned,
    postsNew,
    findingsTotal,
    findingsByScore: { hot, warm, cool, buckets },
    topLeads: findings.slice(0, 10).map(f => ({
      id: f.id,
      title: f.title,
      score: f.score,
      summary: f.summary,
      sourceName: f.source?.name ?? null,
      missionName: f.mission?.name ?? null,
      createdAt: f.createdAt.toISOString(),
    })),
    mostEffectiveSources,
    demandThemes,
    failedJobs: failedJobs.map(j => ({
      id: j.id,
      type: j.type,
      sourceName: j.source?.name ?? null,
      missionName: j.mission?.name ?? null,
      errorMessage: j.errorMessage,
      finishedAt: j.finishedAt?.toISOString() ?? null,
    })),
    browserSessionHealth: {
      total: sessions.length,
      byStatus,
      needsLogin,
      staleHeartbeat,
      healthy,
    },
  };
}

export async function writeDailyReportAiSummary(
  metrics: DailyReportMetrics,
): Promise<{ summary: string | null; error: string | null }> {
  const payload = {
    date: metrics.date,
    sourcesScanned: metrics.sourcesScanned,
    postsNew: metrics.postsNew,
    findingsTotal: metrics.findingsTotal,
    findingsByScore: {
      hot: metrics.findingsByScore.hot,
      warm: metrics.findingsByScore.warm,
      cool: metrics.findingsByScore.cool,
    },
    topLeadTitles: metrics.topLeads.slice(0, 5).map(l => ({
      title: l.title,
      score: l.score,
      source: l.sourceName,
    })),
    mostEffectiveSources: metrics.mostEffectiveSources.slice(0, 5).map(s => ({
      name: s.sourceName,
      findings: s.findingsCount,
      avgScore: s.avgScore,
    })),
    demandThemes: metrics.demandThemes.slice(0, 8),
    failedJobsCount: metrics.failedJobs.length,
    browser: {
      total: metrics.browserSessionHealth.total,
      healthy: metrics.browserSessionHealth.healthy,
      needsLogin: metrics.browserSessionHealth.needsLogin,
      staleHeartbeat: metrics.browserSessionHealth.staleHeartbeat,
    },
  };

  try {
    const summary = await generateText(
      DAILY_SUMMARY_SYSTEM,
      `Viết tóm tắt báo cáo ngày ${metrics.date} từ metrics sau (JSON):\n${JSON.stringify(payload, null, 2)}`,
      {
        temperature: 0.2,
        maxOutputTokens: 600,
        timeoutMs: 45_000,
        promptContext: 'editorial',
      },
    );
    const text = String(summary || '').trim();
    if (!text) return { summary: null, error: 'AI trả về tóm tắt rỗng.' };
    return { summary: text, error: null };
  } catch (error: unknown) {
    return {
      summary: null,
      error: error instanceof Error ? error.message : 'Không tạo được tóm tắt AI.',
    };
  }
}

export async function getDailyAgentReport(
  user: AuthUser,
  query: DailyReportQuery = {},
): Promise<DailyReportResult> {
  const metrics = await buildDailyReportMetrics(user, query);
  let aiSummary: string | null = null;
  let aiSummaryError: string | null = null;

  if (query.includeAiSummary !== false) {
    const ai = await writeDailyReportAiSummary(metrics);
    aiSummary = ai.summary;
    aiSummaryError = ai.error;
  }

  return {
    metrics,
    aiSummary,
    aiSummaryError,
    dataSource: 'database',
  };
}

/** Exported for tests — theme extraction must stay DB-grounded */
export const __test = {
  extractThemesFromFinding,
  parseReportDate,
};
