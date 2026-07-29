import { createHash } from 'node:crypto';
import type { AssetIdentity, AssetType } from './AssetIdentity';

type AssetMatchInput = {
  utterance: string;
  fallbackName?: string | null;
  fallbackHint?: string | null;
};

const LOCATION_RE = /(đà nẵng|da nang|ngũ hành sơn|ngu hanh son|hải châu|hai chau|sơn trà|son tra)/i;
const DEVELOPER_RE = /(sun group|vingroup|fpt|novaland|masterise|dat xanh|đất xanh)/i;
const STAGE_RE = /(đang bán|dang ban|chuyển nhượng|chuyen nhuong|cho thuê|cho thue|mở bán|mo ban)/i;

function inferType(text: string): AssetType {
  if (/(shophouse|khối đế|khoi de|retail podium)/i.test(text)) return 'shophouse';
  if (/(căn hộ|can ho|apartment|penthouse)/i.test(text)) return 'apartment';
  if (/(đất|dat|land)/i.test(text)) return 'land';
  if (/(kho|warehouse|xưởng|xuong)/i.test(text)) return 'warehouse';
  if (/(hotel|khách sạn|khach san)/i.test(text)) return 'hotel';
  if (/(dự án|du an|project|sun|plaza|symphony|s-light|slight|spana|cora)/i.test(text)) return 'project';
  return 'unknown';
}

function pickPrimaryName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(bán|ban|campaign|chien dich|chiến dịch)\s+/i, '')
    .trim();
}

function toAssetId(name: string): string {
  return `asset_${createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 12)}`;
}

export function matchAssetIdentity(input: AssetMatchInput): AssetIdentity {
  const utterance = String(input.utterance || '').trim();
  const base = pickPrimaryName(utterance || input.fallbackName || input.fallbackHint || 'Asset');
  const project = /(sun\s*cora|sun\s*spana|sun\s*symphony|s-light|fpt plaza|mai đăng chơn|mai dang chon)/i.exec(base)?.[0] || null;
  const developer = DEVELOPER_RE.exec(utterance)?.[0] || null;
  const location = LOCATION_RE.exec(utterance)?.[0] || null;
  const stage = STAGE_RE.exec(utterance)?.[0] || null;

  return {
    id: toAssetId(base),
    type: inferType(`${base} ${utterance}`),
    name: base,
    project,
    developer,
    location,
    stage,
  };
}
