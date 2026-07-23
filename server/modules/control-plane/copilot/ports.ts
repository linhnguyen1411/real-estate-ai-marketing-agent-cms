/**
 * Control Plane port — Copilot never imports Prisma / Browser / Mission cores.
 */

import type { AuthUser } from '../../../../src/types';
import type { CommandResult } from '../command-engine/types';
import type { OperationsMetricsSnapshot } from '../operations/types';
import type { ControlPlaneReportKind } from '../types';
import type { OpsIncident, OpsSignalBundle } from './operationalIntelligence';

export type CopilotLeadHit = {
  id: string;
  title: string | null;
  score: number | null;
  location: string | null;
  classification: string | null;
  createdAt: string;
  intent?: string | null;
  budget?: string | null;
  source?: string | null;
  link?: string | null;
};

export type CopilotInsightBundle = {
  lines: string[];
  metrics: Record<string, unknown>;
};

export type CopilotBrowserRow = {
  agentId: string;
  profile: string;
  facebookAccount: string | null;
  busy: boolean;
  currentUrl: string | null;
  lockedBy: string | null;
  state: string;
  hostname?: string | null;
};

export type CopilotControlPlanePort = {
  user: AuthUser;
  runCommand(raw: string): Promise<CommandResult>;
  getDashboard(): Promise<Record<string, unknown>>;
  /** Operations Center snapshot (via Control Plane — not Metrics Collector internals). */
  getOpsMetrics(refresh?: boolean): Promise<OperationsMetricsSnapshot>;
  listOfflineAgents(): Promise<Array<{ agentId: string; status: string }>>;
  countLeadsToday(filters?: { location?: string }): Promise<{ total: number; items: CopilotLeadHit[] }>;
  searchLeads(input: {
    location?: string;
    query?: string;
    createdFrom?: string;
    createdTo?: string;
    limit?: number;
  }): Promise<{ total: number; items: CopilotLeadHit[] }>;
  listFailedPublishJobs(limit?: number): Promise<Array<{ id: string; error?: string | null }>>;
  retryPublish(id: string): Promise<{ ok: boolean; id: string; error?: string }>;
  pauseMission(nameOrId: string): Promise<{ ok: boolean; message: string }>;
  resumeMission(nameOrId: string): Promise<{ ok: boolean; message: string }>;
  report(kind: ControlPlaneReportKind): Promise<Record<string, unknown>>;
  buildInsights(): Promise<CopilotInsightBundle>;
  buildSummary(slot: 'morning' | 'noon' | 'evening'): Promise<{ text: string; lines: string[] }>;
  /** F4 */
  detectIncidents(): Promise<OpsSignalBundle>;
  listBrowsers(): Promise<CopilotBrowserRow[]>;
  findMachine(query: string): Promise<OperationsMetricsSnapshot['machines'][number] | null>;
  explainScanner(): Promise<string[]>;
};
