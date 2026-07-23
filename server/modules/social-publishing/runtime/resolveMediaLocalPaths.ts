/**
 * Resolve draft media URLs to local filesystem paths for Playwright setInputFiles.
 * Remote http(s) files are downloaded to runtime/tmp/social-media-cache.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.resolve(process.cwd(), 'runtime', 'tmp', 'social-media-cache');

function extFromUrlOrType(fileUrl: string, contentType?: string | null): string {
  try {
    const fromUrl = path.extname(new URL(fileUrl).pathname || '');
    if (fromUrl && fromUrl.length <= 5) return fromUrl.toLowerCase();
  } catch {
    // relative url
  }
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('gif')) return '.gif';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return '.jpg';
  return '.jpg';
}

function runtimeOrigin(): string {
  return (
    process.env.AGENT_RUNTIME_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    'https://bdsdanang.site'
  ).replace(/\/$/, '');
}

async function downloadToCache(fileUrl: string): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const hash = crypto.createHash('sha1').update(fileUrl).digest('hex').slice(0, 16);
  const existing = await fs.readdir(CACHE_DIR).catch(() => [] as string[]);
  const hit = existing.find(f => f.startsWith(`${hash}.`) || f === hash);
  if (hit) return path.join(CACHE_DIR, hit);

  const probe = await fetch(fileUrl, {
    headers: { Accept: 'image/*,*/*' },
    redirect: 'follow',
  });
  if (!probe.ok) {
    throw new Error(`media_download_failed:${probe.status}:${fileUrl.slice(0, 120)}`);
  }
  const contentType = probe.headers.get('content-type');
  const ext = extFromUrlOrType(fileUrl, contentType);
  const dest = path.join(CACHE_DIR, `${hash}${ext}`);
  const buf = Buffer.from(await probe.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

/**
 * Returns local absolute paths suitable for Playwright.
 * Skips empty; downloads remote URLs; keeps existing local paths.
 */
export async function resolveMediaLocalPaths(
  media: Array<{ fileUrl: string }>,
): Promise<string[]> {
  const out: string[] = [];
  for (const item of media) {
    const raw = String(item.fileUrl || '').trim();
    if (!raw) continue;

    if (/^https?:\/\//i.test(raw)) {
      out.push(await downloadToCache(raw));
      continue;
    }

    if (raw.startsWith('/api/social/media/files/')) {
      out.push(await downloadToCache(`${runtimeOrigin()}${raw}`));
      continue;
    }

    const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    try {
      await fs.access(abs);
      out.push(abs);
    } catch {
      throw new Error(`media_local_missing:${raw}`);
    }
  }
  return out;
}

/** Sync filter: local paths only (no download). Prefer resolveMediaLocalPaths for publish. */
export function localMediaPaths(media: Array<{ fileUrl: string }>): string[] {
  return media
    .map(m => m.fileUrl)
    .filter(p => typeof p === 'string' && p.trim().length > 0 && !/^https?:\/\//i.test(p));
}

export async function ensureMediaDir(): Promise<string> {
  const dir = path.resolve(process.cwd(), 'runtime', 'social-media');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function socialMediaPublicPath(storedName: string): string {
  return `/api/social/media/files/${encodeURIComponent(storedName)}`;
}
