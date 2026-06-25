import { OPPORTUNITY_GROUPS } from './leadMagnetFramework';
import type { OpportunityGroup } from '../types/leadMagnetContent';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickRank(record: Record<string, unknown>, index: number): number | null {
  if (typeof record.rank === 'number' && Number.isFinite(record.rank)) {
    return record.rank;
  }
  return index + 1;
}

export function hasOpportunityFieldValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeOpportunityGroup(raw: unknown, index = 0): OpportunityGroup | null {
  const record = asRecord(raw);
  if (!record) return null;

  const rank = pickRank(record, index);
  if (rank === null) return null;

  const framework = OPPORTUNITY_GROUPS.find(group => group.rank === rank);
  const name = pickString(record, ['name', 'title']) ?? framework?.name;
  if (!name) return null;

  const area = pickString(record, ['area', 'khuVuc', 'khu_vuc', 'region', 'location']);
  const assetType = pickString(record, ['assetType', 'loaiTaiSan', 'loai_tai_san', 'asset_type']);
  const whyWatch = pickString(record, ['whyWatch', 'why_watch', 'viSaoTheoDoi', 'reason', 'description']);
  const risks = pickString(record, ['risks', 'risk', 'ruiRo', 'rui_ro']);
  const suitableBudget = pickString(record, [
    'suitableBudget',
    'suitable_budget',
    'budget',
    'nganSach',
  ]);

  if (!framework && !area && !assetType && !whyWatch && !risks && !suitableBudget) {
    return null;
  }

  return {
    rank,
    name,
    area: area ?? framework?.area ?? '',
    assetType: assetType ?? framework?.assetType ?? '',
    whyWatch: whyWatch ?? framework?.whyWatch ?? '',
    risks: risks ?? framework?.risks ?? '',
    suitableBudget: suitableBudget ?? framework?.suitableBudget ?? '',
  };
}

export function normalizeOpportunityGroups(raw: unknown): OpportunityGroup[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => normalizeOpportunityGroup(item, index))
    .filter((group): group is OpportunityGroup => group !== null)
    .sort((left, right) => left.rank - right.rank);
}
