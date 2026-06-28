import fs from 'fs';
import path from 'path';

export interface ImageDimensions {
  width: number;
  height: number;
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)),
      height: 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)),
    };
  }
  return null;
}

export function readImageDimensionsFromFile(filePath: string): ImageDimensions | null {
  try {
    const buffer = fs.readFileSync(filePath);
    return readImageDimensionsFromBuffer(buffer);
  } catch {
    return null;
  }
}

export function readImageDimensionsFromBuffer(buffer: Buffer): ImageDimensions | null {
  return (
    readJpegDimensions(buffer)
    || readPngDimensions(buffer)
    || readWebpDimensions(buffer)
  );
}

/** Map public URL path (/blog-covers/x.jpg) to filesystem under public/ */
export function readImageDimensionsFromPublicUrl(
  imageUrl: string,
  origin: string,
): ImageDimensions | null {
  try {
    const url = new URL(imageUrl);
    const originHost = new URL(origin).host;
    if (url.host !== originHost) return null;
    const relative = url.pathname.replace(/^\//, '');
    if (!relative || relative.includes('..')) return null;
    const filePath = path.join(process.cwd(), 'public', relative);
    if (!fs.existsSync(filePath)) return null;
    return readImageDimensionsFromFile(filePath);
  } catch {
    return null;
  }
}

export function ogImageDimensions(
  imageUrl: string,
  origin: string,
): ImageDimensions {
  const local = readImageDimensionsFromPublicUrl(imageUrl, origin);
  if (local && local.width >= 200 && local.height >= 200) {
    return local;
  }
  return { width: 1200, height: 630 };
}
