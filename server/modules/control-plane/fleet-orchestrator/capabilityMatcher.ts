/**
 * Capability Matcher (G2) — job requirements ↔ agent / browser capabilities.
 * Pure functions; no DB.
 */

import { capabilityForJobType } from '../../../agent-worker/ports';
import type { FleetAgent } from '../fleet/types';
import type {
  BrowserCapabilityView,
  CapabilityToken,
  JobRequirements,
} from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Infer / extract job requirements from AgentJob fields + payload. */
export function extractJobRequirements(input: {
  id: string;
  type: string;
  priority?: number | null;
  sourceId?: string | null;
  missionId?: string | null;
  payload?: unknown;
}): JobRequirements {
  const payload = asRecord(input.payload);
  const reqCapsRaw = payload.requiredCapabilities ?? payload.requireCapabilities;
  const preferredCapsRaw = payload.preferredCapabilities;

  const requiredFromType = capabilityForJobType(input.type);
  const requiredCapabilities: CapabilityToken[] = [];
  if (Array.isArray(reqCapsRaw)) {
    for (const c of reqCapsRaw) {
      const s = str(c);
      if (s) requiredCapabilities.push(s);
    }
  }
  if (requiredCapabilities.length === 0 && requiredFromType) {
    requiredCapabilities.push(requiredFromType);
  }

  // Fine-grained publish variants from payload
  const dest = str(payload.destination) || str(payload.channel) || str(payload.publishTarget);
  if (input.type === 'publish_social' && dest) {
    if (/timeline|feed|profile/i.test(dest) && !requiredCapabilities.includes('publish_timeline')) {
      requiredCapabilities.push('publish_timeline');
    }
    if (/group/i.test(dest) && !requiredCapabilities.includes('publish_group')) {
      requiredCapabilities.push('publish_group');
    }
  }

  const preferredCapabilities: CapabilityToken[] = [];
  if (Array.isArray(preferredCapsRaw)) {
    for (const c of preferredCapsRaw) {
      const s = str(c);
      if (s) preferredCapabilities.push(s);
    }
  }

  return {
    requiredCapabilities,
    preferredCapabilities,
    preferredBrowser: str(payload.preferredBrowser) || str(payload.browserProfile),
    requiredBrowser: str(payload.requiredBrowser),
    executionType: str(payload.executionType) || input.type,
    priority: num(input.priority) ?? num(payload.priority) ?? 5,
    estimatedDurationSec: num(payload.estimatedDurationSec),
    expectedCpu: num(payload.expectedCpu),
    expectedRamMb: num(payload.expectedRamMb),
    affinityAgentId:
      str(payload.affinityAgentId) ||
      str(payload.targetAgentId) ||
      str(payload.lastAgentId),
    affinityHostname: str(payload.affinityHostname) || str(payload.lastHostname),
    affinitySourceId: str(payload.affinitySourceId) || input.sourceId || null,
    pinMachineId: str(payload.pinMachineId) || str(payload.pinnedMachineId),
  };
}

/** Normalize agent capability list (aliases). */
export function normalizeAgentCapabilities(caps: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of caps) {
    const c = raw.trim().toLowerCase();
    if (!c) continue;
    out.add(c);
    // Aliases: publish covers timeline/group unless explicitly denied
    if (c === 'publish') {
      out.add('publish_timeline');
      out.add('publish_group');
    }
    if (c === 'browser') {
      out.add('scan');
      out.add('publish');
    }
  }
  return out;
}

export function agentHasCapabilities(
  agentCaps: string[],
  required: CapabilityToken[],
): { ok: boolean; missing: string[] } {
  if (!required.length) return { ok: true, missing: [] };
  const have = normalizeAgentCapabilities(agentCaps);
  const missing = required.filter(r => !have.has(r.trim().toLowerCase()));
  return { ok: missing.length === 0, missing };
}

export function deriveBrowserCapabilities(agent: FleetAgent): BrowserCapabilityView[] {
  return agent.browserProfiles.map(p => {
    const state = String(p.state || '').toLowerCase();
    const healthy =
      state !== 'crashed' &&
      state !== 'orphan' &&
      state !== 'expired' &&
      state !== 'recovering';
    return {
      profile: p.profile,
      facebookAccount: p.facebookAccount || null,
      loggedIn: Boolean(p.facebookAccount) || healthy,
      timelinePublish: true,
      groupPublish: true,
      comment: agent.capabilities.includes('comment'),
      reply: agent.capabilities.includes('messaging') || agent.capabilities.includes('comment'),
      marketplace: false,
      healthy,
      busy: p.busy,
    };
  });
}

export function matchBrowserRequirements(
  browsers: BrowserCapabilityView[],
  req: JobRequirements,
): { ok: boolean; score: number; reason: string } {
  if (browsers.length === 0) {
    // Agent may still run CDP/managed without snapshot profiles yet
    return { ok: true, score: 5, reason: 'no_browser_snapshot' };
  }

  const freeHealthy = browsers.filter(b => b.healthy && !b.busy);
  if (req.requiredBrowser) {
    const hit = browsers.find(
      b =>
        b.profile === req.requiredBrowser ||
        b.profile.endsWith(req.requiredBrowser!) ||
        b.profile.includes(req.requiredBrowser!),
    );
    if (!hit) return { ok: false, score: 0, reason: 'required_browser_missing' };
    if (!hit.healthy) return { ok: false, score: 0, reason: 'required_browser_unhealthy' };
    if (hit.busy) return { ok: false, score: 0, reason: 'required_browser_busy' };
    return { ok: true, score: 25, reason: 'required_browser_ok' };
  }

  if (req.preferredBrowser) {
    const hit = freeHealthy.find(
      b =>
        b.profile === req.preferredBrowser ||
        b.profile.endsWith(req.preferredBrowser!) ||
        b.profile.includes(req.preferredBrowser!),
    );
    if (hit) return { ok: true, score: 18, reason: 'preferred_browser' };
  }

  if (freeHealthy.length === 0) {
    // Soft: still allow if any healthy (busy) — lease manager may free soon
    const anyHealthy = browsers.some(b => b.healthy);
    if (!anyHealthy) return { ok: false, score: 0, reason: 'no_healthy_browser' };
    return { ok: true, score: 2, reason: 'browsers_busy' };
  }

  return { ok: true, score: 10 + Math.min(10, freeHealthy.length * 3), reason: 'browser_free' };
}

/** Priority band for job types (lower AgentJob.priority number = higher urgency already). */
export function jobTypePriorityBoost(jobType: string): number {
  switch (jobType) {
    case 'publish_social':
      return 30; // Publish Due
    case 'scan_source':
    case 'source_scan':
      return 12;
    case 'visit_url':
      return 5;
    case 'send_message':
    case 'messaging':
    case 'post_comment':
    case 'comment':
      return 15;
    case 'health_check':
      return 0;
    default:
      return 8;
  }
}
