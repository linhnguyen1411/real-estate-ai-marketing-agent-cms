import { DEFAULT_SAFETY_SETTINGS } from './types';

export interface MediaInput {
  type?: string;
  fileUrl: string;
  mime?: string;
  sizeBytes?: number;
  altText?: string;
  sortOrder?: number;
}

export function validateMime(mime?: string | null): { ok: boolean; error?: string } {
  if (!mime) return { ok: true };
  const lower = mime.toLowerCase();
  if (lower.startsWith('video/')) {
    return {
      ok: false,
      error:
        'Video publish is Experimental (H0.5) and not enabled for Facebook Timeline/Group in v0.9 stable.',
    };
  }
  const allowed = DEFAULT_SAFETY_SETTINGS.allowedMime as readonly string[];
  if (!allowed.includes(lower)) {
    return {
      ok: false,
      error: `MIME not allowed: ${mime}. Allowed: ${allowed.join(', ')}`,
    };
  }
  return { ok: true };
}

export function validateCount(count: number, max = DEFAULT_SAFETY_SETTINGS.maxMediaCount): {
  ok: boolean;
  error?: string;
} {
  if (count > max) {
    return { ok: false, error: `Too many media files (${count} > ${max})` };
  }
  return { ok: true };
}

export function validateSize(
  sizeBytes?: number | null,
  max = DEFAULT_SAFETY_SETTINGS.maxMediaBytes,
): { ok: boolean; error?: string } {
  if (sizeBytes == null) return { ok: true };
  if (sizeBytes > max) {
    return { ok: false, error: `Media too large (${sizeBytes} > ${max} bytes)` };
  }
  return { ok: true };
}

export function validateMediaList(items: MediaInput[]): { ok: boolean; error?: string } {
  const countCheck = validateCount(items.length);
  if (!countCheck.ok) return countCheck;

  for (const item of items) {
    const mimeCheck = validateMime(item.mime);
    if (!mimeCheck.ok) return mimeCheck;
    const sizeCheck = validateSize(item.sizeBytes);
    if (!sizeCheck.ok) return sizeCheck;
    if (!String(item.fileUrl || '').trim()) {
      return { ok: false, error: 'Media fileUrl is required' };
    }
  }
  return { ok: true };
}
