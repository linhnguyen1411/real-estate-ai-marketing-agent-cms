/**
 * Control Plane port — Copilot never imports Prisma / Browser / Mission cores.
 */

import type { AuthUser } from '../../../../src/types';
import type { CommandResult } from '../command-engine/types';
import type { ControlPlaneReportKind } from '../types';

export type CopilotLeadHit = {
  id: string;
  title: string | null;
  score: number | null;
  location: string | null;
  classification: string | null;
  createdAt: string;
};

export type CopilotInsightBundle = {
  lines: string[];
  metrics: Record<string, unknown>;
};

export type CopilotControlPlanePort = {
  user: AuthUser;
  runCommand(raw: string): Promise<CommandResult>;
  getDashboard(): Promise<Record<string, unknown>>;
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
};
