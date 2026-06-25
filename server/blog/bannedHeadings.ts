/** PHASE 29 — forbidden generic SEO article headings */
export const BANNED_HEADING_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /bối cảnh thị trường/i, label: 'Bối cảnh thị trường' },
  { pattern: /động lực tăng trưởng/i, label: 'Động lực tăng trưởng' },
  { pattern: /khả năng khai thác dòng tiền/i, label: 'Khả năng khai thác dòng tiền' },
  { pattern: /khung lựa chọn sản phẩm/i, label: 'Khung lựa chọn sản phẩm' },
  { pattern: /rủi ro vận hành/i, label: 'Rủi ro vận hành' },
  { pattern: /checklist\s*90\s*ngày/i, label: 'Checklist 90 ngày' },
];

export function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (m) headings.push(m[1].trim());
  }
  return headings;
}

export function validateBannedHeadings(markdown: string): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  const haystack = `${markdown}\n${extractHeadings(markdown).join('\n')}`;
  for (const { pattern, label } of BANNED_HEADING_PATTERNS) {
    if (pattern.test(haystack)) violations.push(label);
  }
  return { passed: violations.length === 0, violations };
}
