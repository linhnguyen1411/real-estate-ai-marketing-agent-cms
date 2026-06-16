const NOISE_FULL_LINE_PATTERNS: RegExp[] = [
  /^facebook$/i,
  /^t[iì]m bạn b[eè]\.{0,3}$/i,
  /^thích$/i,
  /^bình luận$/i,
  /^chia sẻ$/i,
  /^like$/i,
  /^comment$/i,
  /^share$/i,
  /đoạn chat chưa đọc/i,
  /mục thông báo mới/i,
  /chỉ báo trạng thái online/i,
  /^đang hoạt động$/i,
  /^mời$/i,
  /^đã tham gia$/i,
  /^xem thêm$/i,
  /^giới thiệu$/i,
  /^thảo luận$/i,
  /^mọi người$/i,
  /^sự kiện$/i,
  /^file phương tiện$/i,
  /bạn viết gì đi/i,
  /cảm xúc\/hoạt động/i,
  /thăm dò ý kiến/i,
  /bình luận dưới tên/i,
  /^ẩn bớt$/i,
  /sắp xếp bảng feed/i,
  /phù hợp nhất/i,
  /^see more$/i,
  /^see all$/i
];

const INLINE_NOISE_PATTERNS: RegExp[] = [
  /t[iì]m bạn b[eè][.\s]*/gi,
  /\bfacebook\b/gi,
  /\bthích\b/gi,
  /\bbình luận\b/gi,
  /\bbình luận dưới tên\b/gi,
  /\bchia sẻ\b/gi,
  /\blike\b/gi,
  /\bcomment\b/gi,
  /\bshare\b/gi,
  /đoạn chat chưa đọc/gi,
  /mục thông báo mới/gi,
  /sắp xếp bảng feed/gi,
  /phù hợp nhất/gi,
  /\bxem thêm\b/gi
];

function isSplitCharLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return false;
  const singleChar = tokens.filter(t => t.length === 1).length;
  return singleChar / tokens.length > 0.6;
}

function isNoiseOnlyLine(line: string): boolean {
  if (line.length > 100) return false;
  return NOISE_FULL_LINE_PATTERNS.some(p => p.test(line.trim()));
}

function stripInlineNoise(text: string): string {
  let result = text;
  for (const pattern of INLINE_NOISE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

export function cleanFacebookNoise(text: string): string {
  if (!text) return '';

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const lineCounts = new Map<string, number>();
  for (const line of lines) {
    const key = line.toLowerCase();
    lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
  }

  const kept: string[] = [];
  const keptCounts = new Map<string, number>();

  for (const line of lines) {
    if (isSplitCharLine(line)) continue;
    if (isNoiseOnlyLine(line)) continue;

    const key = line.toLowerCase();
    const total = lineCounts.get(key) || 0;
    const seen = keptCounts.get(key) || 0;
    if (total > 2 && seen >= 1) continue;

    keptCounts.set(key, seen + 1);
    kept.push(line);
  }

  const merged = stripInlineNoise(kept.join('\n'));
  return merged.replace(/\s+/g, ' ').trim();
}
