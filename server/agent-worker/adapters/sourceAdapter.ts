import type { AgentJob, AgentMission, AgentSource } from '@prisma/client';
import type { BrowserManager } from '../browserManager';

export interface ScanContext {
  job: AgentJob;
  source: AgentSource;
  mission: AgentMission | null;
  browser: BrowserManager;
}

export interface ScanMetrics {
  pagesVisited: number;
  contentsSeen: number;
  contentsInserted: number;
  findingsCreated: number;
  durationMs: number;
  scrollsPerformed?: number;
  postsParsed?: number;
  seeMoreClicks?: number;
  knownPostsStreak?: number;
  emptyPasses?: number;
  stopReason?: string;
  stoppedReason?: string;
  feedTabSwitched?: boolean;
  checkpointUpdated?: boolean;
  /** Sprint 5.2+ report (flat + nested metrics) */
  postsSeen?: number;
  postsNew?: number;
  duplicates?: number;
  ignored?: number;
  analyzed?: number;
  findings?: number;
  notifyCount?: number;
  articlesObserved?: number;
  uniquePostsObserved?: number;
  newPostsInserted?: number;
  knownFromDatabase?: number;
  duplicateInSession?: number;
  parseFailed?: number;
  ignoredByRule?: number;
  notificationsCreated?: number;
  scrollsCompleted?: number;
  metrics?: Record<string, number>;
}

export interface SourceAdapter {
  readonly name: string;
  supports(sourceType: string): boolean;
  scan(ctx: ScanContext): Promise<ScanMetrics>;
}

const adapters: SourceAdapter[] = [];

export function registerSourceAdapter(adapter: SourceAdapter): void {
  adapters.push(adapter);
}

export function getAdapterForSource(source: AgentSource): SourceAdapter | null {
  return adapters.find(adapter => adapter.supports(source.type)) ?? null;
}

export function resetSourceAdapters(): void {
  adapters.length = 0;
}
