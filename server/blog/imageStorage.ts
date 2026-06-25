import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type PublicImageFolder = 'blog-covers' | 'content-images';

const MAX_BYTES = 5 * 1024 * 1024;

function extensionForMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function sanitizeBasename(value: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'image';
}

function ensureDir(folder: PublicImageFolder): string {
  const dir = path.join(process.cwd(), 'public', folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveImageFromDataUrl(
  dataUrl: string,
  folder: PublicImageFolder,
  basename?: string
): string {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Ảnh không đúng định dạng base64 (data:image/...).');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    throw new Error('Dữ liệu ảnh rỗng.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('Ảnh vượt quá 5MB sau khi upload.');
  }

  const ext = extensionForMime(match[1]);
  const stem = sanitizeBasename(basename || (folder === 'blog-covers' ? 'cover' : 'content'));
  const filename = `${stem}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;

  const dir = ensureDir(folder);
  fs.writeFileSync(path.join(dir, filename), buffer);

  return `/${folder}/${filename}`;
}
