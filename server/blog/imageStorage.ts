import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type PublicImageFolder = 'blog-covers' | 'content-images' | 'agent-avatars';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Detect image type by checking magic bytes at beginning of buffer.
 * Rejects SVG and any unknown or executable headers.
 */
function detectImageTypeByMagicBytes(buffer: Buffer): 'png' | 'jpg' | 'webp' | 'gif' {
  if (buffer.length < 12) {
    throw new Error('Dữ liệu ảnh quá ngắn hoặc không hợp lệ.');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  // GIF: GIF87a or GIF89a (47 49 46 38 37/39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'gif';
  }

  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  // Reject SVG explicitly if it looks like XML or SVG tag
  const headerStr = buffer.slice(0, 100).toString('utf-8').toLowerCase();
  if (headerStr.includes('<svg') || headerStr.includes('<?xml')) {
    throw new Error('Định dạng SVG không được chấp nhận vì lý do an toàn bảo mật.');
  }

  throw new Error('Định dạng ảnh không được hỗ trợ hoặc nội dung file không khớp header hợp lệ (chỉ hỗ trợ PNG, JPG, WebP, GIF).');
}

function ensureDir(folder: PublicImageFolder): string {
  const dir = path.join(process.cwd(), 'public', folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveImageFromDataUrl(
  dataUrl: string,
  folder: PublicImageFolder,
  _basename?: string
): string {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Ảnh không đúng định dạng base64 (data:image/...).');
  }

  // Explicitly reject claimed svg in data url
  if (match[1].toLowerCase().includes('svg')) {
    throw new Error('Định dạng SVG không được chấp nhận vì lý do an toàn bảo mật.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    throw new Error('Dữ liệu ảnh rỗng.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('Ảnh vượt quá 5MB sau khi upload.');
  }

  // Strictly verify magic bytes regardless of mime declaration
  const verifiedExt = detectImageTypeByMagicBytes(buffer);

  // Generate completely random, unguessable file name (16 bytes hex)
  const randomName = `${crypto.randomBytes(16).toString('hex')}.${verifiedExt}`;

  const dir = ensureDir(folder);
  fs.writeFileSync(path.join(dir, randomName), buffer);

  return `/${folder}/${randomName}`;
}
