import type { LeadMagnetDefinition } from './leadMagnets';
import type { LeadMagnetContent } from '../types/leadMagnetContent';
import { LEAD_MAGNET_FRAMEWORK_SOURCE_LABEL } from '../types/leadMagnetContent';
import { normalizeOpportunityGroups } from './normalizeOpportunityGroup';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickGroups(payload: Record<string, unknown>) {
  const candidates = [payload.groups, payload.opportunities, payload.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return normalizeOpportunityGroups(candidate);
    }
  }
  return [];
}

export function normalizeLeadMagnetContent(
  raw: unknown,
  magnet: LeadMagnetDefinition
): LeadMagnetContent | null {
  const bag = asRecord(raw);
  if (!bag) return null;

  const nested = asRecord(bag.content);
  const payload =
    nested && bag.type === undefined && nested.type !== undefined ? nested : bag;

  const source =
    (payload.source as LeadMagnetContent['source'] | undefined) ?? 'static-framework';
  const sourceLabel =
    typeof payload.sourceLabel === 'string'
      ? payload.sourceLabel
      : LEAD_MAGNET_FRAMEWORK_SOURCE_LABEL;

  const type = typeof payload.type === 'string' ? payload.type : magnet.type;

  if (type === 'report' || magnet.type === 'report') {
    if (!Array.isArray(payload.sections)) return null;
    return { type: 'report', sections: payload.sections, source, sourceLabel };
  }

  if (type === 'opportunity-framework' || type === 'list' || magnet.type === 'list') {
    return {
      type: 'opportunity-framework',
      groups: pickGroups(payload),
      source,
      sourceLabel,
    };
  }

  if (type === 'map' || magnet.type === 'map') {
    if (!Array.isArray(payload.zones)) return null;
    return { type: 'map', zones: payload.zones, source, sourceLabel };
  }

  return null;
}
