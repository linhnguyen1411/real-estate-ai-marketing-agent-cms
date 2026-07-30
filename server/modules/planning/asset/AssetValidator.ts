import type { AssetIdentity } from './AssetIdentity';
import { CAMPAIGN_ASSET_CUE_RE } from '../campaignIntent';

const GENERIC_PATTERNS: RegExp[] = [
  /\bbđs\b|\bbat dong san\b|\bbất động sản\b|\bbat\s*dong\s*san\b|\bnhà đất\b|\bnha dat\b/i,
  /\bcăn hộ\b|\bcan ho\b|\bđất nền\b|\bdat nen\b/i,
  /\bchung cư\b|\bchung cu\b|\bproject\b/i,
];

const PLANNING_SHELL_RE =
  /^(tạo|tao|làm|lam|lập|lap)?\s*(campaign|chiến dịch|chien dich|mission|nhiệm vụ|nhiem vu)$/i;

export class AssetValidationError extends Error {
  readonly code = 'ASSET_IDENTITY_INVALID';
  readonly prompt: string;

  constructor(message: string, prompt: string) {
    super(message);
    this.prompt = prompt;
  }
}

export function validateAssetIdentity(asset: AssetIdentity): AssetIdentity {
  const name = String(asset.name || '').trim();
  if (!name || name.length < 3) {
    throw new AssetValidationError(
      'Asset identity is missing.',
      'Bạn muốn bán dự án nào?',
    );
  }

  if (PLANNING_SHELL_RE.test(name)) {
    throw new AssetValidationError(
      'Campaign shell without asset.',
      'Bạn muốn bán dự án nào?',
    );
  }

  const blob = `${name} ${asset.project || ''} ${asset.developer || ''}`;
  if (
    GENERIC_PATTERNS.some(re => re.test(name)) &&
    !/\b(sun|fpt|mai đăng chơn|mai dang chon|symphony|plaza|podium|cora|spana|cosmo)\b/i.test(blob)
  ) {
    throw new AssetValidationError(
      'Generic campaign name is not allowed.',
      'Bạn muốn bán dự án nào?',
    );
  }

  // Verb/intent text without any recognizable asset cue
  if (!CAMPAIGN_ASSET_CUE_RE.test(blob) && /tạo|tao|chiến dịch|chien dich|campaign|mission|nhiệm vụ|nhiem vu/i.test(name)) {
    throw new AssetValidationError(
      'Asset identity is missing.',
      'Bạn muốn bán dự án nào?',
    );
  }

  return asset;
}
