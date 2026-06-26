import {
  BANNED_ENDING_PATTERNS,
  BANNED_HEADING_PATTERNS,
  BANNED_PHRASE_MAX_COUNT,
  BANNED_PHRASES,
} from './contentRules';

export interface BoilerplateViolation {
  code: string;
  message: string;
  detail?: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(' ')
      .filter(w => w.length > 2),
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

export function extractParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map(p => p.replace(/^#+\s.*$/gm, '').trim())
    .filter(p => p.length > 80 && !p.startsWith('---'));
}

export function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (m) headings.push(m[1].trim());
  }
  return headings;
}

export function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 25);
}

export function countPhraseOccurrences(text: string, phrase: string): number {
  const haystack = normalizeText(text);
  const needle = normalizeText(phrase);
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (pos < haystack.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + needle.length;
  }
  return count;
}

export function detectBannedPhrases(text: string): BoilerplateViolation[] {
  const violations: BoilerplateViolation[] = [];
  for (const phrase of BANNED_PHRASES) {
    const count = countPhraseOccurrences(text, phrase);
    if (count > BANNED_PHRASE_MAX_COUNT) {
      violations.push({
        code: 'banned-phrase',
        message: `Cụm "${phrase}" lặp ${count} lần (max ${BANNED_PHRASE_MAX_COUNT})`,
      });
    }
  }
  return violations;
}

export function detectBannedHeadings(markdown: string): BoilerplateViolation[] {
  const violations: BoilerplateViolation[] = [];
  const haystack = `${markdown}\n${extractHeadings(markdown).join('\n')}`;
  for (const { pattern, label } of BANNED_HEADING_PATTERNS) {
    if (pattern.test(haystack)) {
      violations.push({ code: 'banned-heading', message: `Heading cấm: ${label}` });
    }
  }
  return violations;
}

export function detectParagraphSimilarity(markdown: string, threshold = 0.25): BoilerplateViolation[] {
  const paragraphs = extractParagraphs(markdown);
  const violations: BoilerplateViolation[] = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    for (let j = i + 1; j < paragraphs.length; j += 1) {
      const sim = jaccardSimilarity(paragraphs[i], paragraphs[j]);
      if (sim >= threshold) {
        violations.push({
          code: 'paragraph-similarity',
          message: `2 đoạn giống nhau ~${Math.round(sim * 100)}%`,
          detail: `Đoạn ${i + 1} ↔ ${j + 1}`,
        });
      }
    }
  }
  return violations;
}

export function detectHeadingSimilarity(markdown: string): BoilerplateViolation[] {
  const headings = extractHeadings(markdown).filter(h => !/^faq$/i.test(h));
  const violations: BoilerplateViolation[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    for (let j = i + 1; j < headings.length; j += 1) {
      const sim = jaccardSimilarity(headings[i], headings[j]);
      const samePrefix =
        headings[i].split(/\s+/).slice(0, 2).join(' ') === headings[j].split(/\s+/).slice(0, 2).join(' ');
      if (sim >= 0.55 || (samePrefix && headings[i].length > 8)) {
        violations.push({
          code: 'heading-similarity',
          message: `H2 cấu trúc giống: "${headings[i]}" / "${headings[j]}"`,
        });
      }
    }
  }
  return violations;
}

export function detectDuplicateSentences(markdown: string): BoilerplateViolation[] {
  const body = markdown.replace(/^---[\s\S]*?---/m, '');
  const sentences = extractSentences(body);
  const seen = new Map<string, number>();
  const violations: BoilerplateViolation[] = [];
  for (const sentence of sentences) {
    const key = normalizeText(sentence);
    if (key.length < 30) continue;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count > 2) {
      violations.push({
        code: 'duplicate-sentence',
        message: `Câu lặp >2 lần: "${sentence.slice(0, 60)}..."`,
      });
    }
  }
  return violations;
}

export function detectBannedEnding(markdown: string): BoilerplateViolation[] {
  const tail = markdown.trim().slice(-600);
  const violations: BoilerplateViolation[] = [];
  for (const pattern of BANNED_ENDING_PATTERNS) {
    if (pattern.test(tail)) {
      violations.push({
        code: 'banned-ending',
        message: `Kết bài kiểu AI/disclaimer: ${pattern}`,
      });
    }
  }
  return violations;
}

export function detectFptDominance(markdown: string, keyword: string): BoilerplateViolation[] {
  const isSunTopic = /sun|symphony|s[\s-]?light|cora|fours|cosmo/i.test(keyword);
  if (!isSunTopic) return [];
  const fptCount = countPhraseOccurrences(markdown, 'fpt');
  const sunCount =
    countPhraseOccurrences(markdown, 'sun') +
    countPhraseOccurrences(markdown, 'symphony') +
    countPhraseOccurrences(markdown, 's light');
  if (fptCount >= 3 && fptCount >= sunCount) {
    return [{
      code: 'fpt-dominance',
      message: `FPT nhắc ${fptCount} lần, lấn át Sun Group (${sunCount})`,
    }];
  }
  return [];
}

export function scanBoilerplate(markdown: string, keyword = ''): BoilerplateViolation[] {
  return [
    ...detectBannedPhrases(markdown),
    ...detectBannedHeadings(markdown),
    ...detectParagraphSimilarity(markdown),
    ...detectHeadingSimilarity(markdown),
    ...detectDuplicateSentences(markdown),
    ...detectBannedEnding(markdown),
    ...detectFptDominance(markdown, keyword),
  ];
}
