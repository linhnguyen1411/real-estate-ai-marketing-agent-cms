import type { AssetIdentity } from './AssetIdentity';

const GENERIC_PATTERNS: RegExp[] = [
  /\bbđs\b|\bbat dong san\b|\bnhà đất\b|\bnha dat\b/i,
  /\bcăn hộ\b|\bcan ho\b|\bđất nền\b|\bdat nen\b/i,
  /\bchung cư\b|\bchung cu\b|\bproject\b/i,
];

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
      'Campaign cần gắn với một tài sản cụ thể. Vui lòng nhập tên asset rõ ràng (ví dụ: Sun Cora Retail Podium, Sun Symphony S181).',
    );
  }

  if (GENERIC_PATTERNS.some(re => re.test(name)) && !/\b(sun|fpt|mai đăng chơn|mai dang chon|symphony|plaza|podium)\b/i.test(name)) {
    throw new AssetValidationError(
      'Generic campaign name is not allowed.',
      'Tên campaign đang quá generic. Vui lòng chỉ rõ asset cụ thể (ví dụ: Sun Cora, Sun Symphony, FPT Plaza, Penthouse S-Light).',
    );
  }

  return asset;
}
