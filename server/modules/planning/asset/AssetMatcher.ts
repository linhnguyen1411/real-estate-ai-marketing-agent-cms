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
const PROJECT_RE =
  /(sun\s*cora|sun\s*spana|sun\s*symphony|sun\s*cosmo|sun\s*group|s-?light|fpt\s*plaza|mai đăng chơn|mai dang chon)/i;
const TYPE_HINT_RE = /(shophouse|khối đế|khoi de|retail podium|căn hộ|can ho|penthouse|đất nền|dat nen)/i;

function inferType(text: string): AssetType {
  if (/(shophouse|khối đế|khoi de|retail podium)/i.test(text)) return 'shophouse';
  if (/(căn hộ|can ho|apartment|penthouse)/i.test(text)) return 'apartment';
  if (/(đất|dat|land)/i.test(text)) return 'land';
  if (/(kho|warehouse|xưởng|xuong)/i.test(text)) return 'warehouse';
  if (/(hotel|khách sạn|khach san)/i.test(text)) return 'hotel';
  if (/(dự án|du an|project|sun|plaza|symphony|s-light|slight|spana|cora|cosmo)/i.test(text)) {
    return 'project';
  }
  return 'unknown';
}

function stripPlanningVerbs(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(tạo|tao|làm|lam|lập|lap)\s+(mission|campaign|chiến dịch|chien dich)\s*$/i, '')
    .replace(
      /^(tạo|tao|làm|lam|lập|lap)\s+(mission|campaign|chiến dịch|chien dich)\s+/i,
      '',
    )
    .replace(/^(marketing|research|tìm buyer|tim buyer)\s+(cho\s+)?/i, '')
    .replace(/^(làm|lam)\s+content\s+(cho\s+)?/i, '')
    .replace(/^(bán|ban|campaign|chien dich|chiến dịch)\s+/i, '')
    .replace(/\s+cho\s+(các\s+)?tòa\s+nhà\s+/gi, ' ')
    .trim();
}

function pickPrimaryName(raw: string): string {
  const cleaned = stripPlanningVerbs(raw);
  const project = PROJECT_RE.exec(cleaned)?.[0] || PROJECT_RE.exec(raw)?.[0] || null;
  const typeHint = TYPE_HINT_RE.exec(cleaned)?.[0] || TYPE_HINT_RE.exec(raw)?.[0] || null;
  if (project && typeHint) return `${project} ${typeHint}`.replace(/\s+/g, ' ').trim();
  if (project) return project.replace(/\s+/g, ' ').trim();
  // bare "sun" + type
  if (/\bsun\b/i.test(raw) && typeHint) {
    return `Sun ${typeHint}`.replace(/\s+/g, ' ').trim();
  }
  if (/\bsun\b/i.test(raw) && !project) return 'Sun';
  return cleaned || raw.trim();
}

function toAssetId(name: string): string {
  return `asset_${createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 12)}`;
}

export function matchAssetIdentity(input: AssetMatchInput): AssetIdentity {
  const utterance = String(input.utterance || '').trim();
  const base = pickPrimaryName(utterance || input.fallbackName || input.fallbackHint || 'Asset');
  const project = PROJECT_RE.exec(base)?.[0] || PROJECT_RE.exec(utterance)?.[0] || null;
  const developer = DEVELOPER_RE.exec(utterance)?.[0] || (/\bsun\b/i.test(utterance) ? 'Sun Group' : null);
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
