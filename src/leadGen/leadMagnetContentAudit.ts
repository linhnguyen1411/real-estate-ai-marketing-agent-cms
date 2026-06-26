import { buildInvestmentPlaybook } from './buildInvestmentPlaybook';
import { INVESTMENT_REPORT_2026 } from './investmentReport2026';
import type {
  PlaybookChapter,
  PlaybookSubsection,
  ReportChapterBlock,
} from '../types/leadMagnetContent';

export interface TextBlock {
  id: string;
  magnet: string;
  section: string;
  text: string;
}

export interface SimilarityPair {
  a: string;
  b: string;
  similarity: number;
}

const SIMILARITY_THRESHOLD = 0.25;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach(word => {
    if (setB.has(word)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function flattenReportBlock(block: ReportChapterBlock, chapterTitle: string): TextBlock[] {
  const base = { magnet: 'bao-cao-nam-da-nang-2026', section: chapterTitle };

  if (block.kind === 'prose') {
    return [
      {
        ...base,
        id: block.id,
        text: [block.heading, ...block.paragraphs].filter(Boolean).join(' '),
      },
    ];
  }

  if (block.kind === 'zone-focus') {
    return [{ ...base, id: block.id, text: [block.zone, ...block.paragraphs].join(' ') }];
  }

  if (block.kind === 'product-segment') {
    return [
      {
        ...base,
        id: block.id,
        text: [
          block.name,
          block.buyerProfile,
          block.renterProfile,
          block.liquidity,
          block.strengths,
          block.limitations,
          block.strategyFit,
        ].join(' '),
      },
    ];
  }

  if (block.kind === 'factor') {
    return [{ ...base, id: block.id, text: `${block.factor} ${block.analysis}` }];
  }

  return [{ ...base, id: block.id, text: `${block.topic} ${block.guidance}` }];
}

function flattenPlaybookSubsection(chapter: PlaybookChapter, subsection: PlaybookSubsection): TextBlock[] {
  const base = {
    magnet: 'top-20-co-hoi-dau-tu',
    section: `${chapter.title} · ${subsection.title}`,
  };

  return [
    {
      ...base,
      id: `${chapter.id}:${subsection.id}:summary`,
      text: [chapter.executiveSummary, ...subsection.analysis].join(' '),
    },
    {
      ...base,
      id: `${chapter.id}:${subsection.id}:insight`,
      text: [subsection.keyInsight, subsection.whoFits, ...subsection.watchPoints].join(' '),
    },
  ];
}

function flattenPlaybookChapter(chapter: PlaybookChapter): TextBlock[] {
  return chapter.subsections.flatMap(subsection => flattenPlaybookSubsection(chapter, subsection));
}

export function collectLeadMagnetTextBlocks(): TextBlock[] {
  const blocks: TextBlock[] = [];

  INVESTMENT_REPORT_2026.chapters.forEach(chapter => {
    chapter.blocks.forEach(block => {
      blocks.push(...flattenReportBlock(block, chapter.title));
    });
  });

  buildInvestmentPlaybook().chapters.forEach(chapter => {
    blocks.push(...flattenPlaybookChapter(chapter));
  });

  return blocks;
}

function blockSectionKey(id: string): string {
  return id.split(':')[0];
}

export function findHighSimilarityPairs(blocks: TextBlock[]): SimilarityPair[] {
  const pairs: SimilarityPair[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (blockSectionKey(blocks[i].id) === blockSectionKey(blocks[j].id)) continue;
      const similarity = jaccardSimilarity(blocks[i].text, blocks[j].text);
      if (similarity > SIMILARITY_THRESHOLD) {
        pairs.push({
          a: blocks[i].id,
          b: blocks[j].id,
          similarity: Math.round(similarity * 1000) / 1000,
        });
      }
    }
  }

  return pairs.sort((left, right) => right.similarity - left.similarity);
}

export interface CommercialMentionCounts {
  sunGroup: number;
  maiDangChon: number;
  fpt: number;
  namDaNang: number;
}

const SUN_PATTERNS = [
  /\bsun group\b/i,
  /\bsun symphony\b/i,
  /\bsun fours\b/i,
  /\bfours\b/i,
  /\bs light\b/i,
  /\bcora\b/i,
  /\bsun spana\b/i,
  /\bspana\b/i,
];

const MAI_DANG_CHON_PATTERN = /mai\s*đăng\s*chơn|mai\s*dang\s*chon/i;
const FPT_PATTERN = /\bfpt\b|fpt city|fpt digital/i;
const NAM_DA_NANG_PATTERN = /nam\s*đà\s*nẵng|nam\s*da\s*nang/i;

function countPatternMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  patterns.forEach(pattern => {
    const matches = text.match(new RegExp(pattern.source, pattern.flags + 'g'));
    if (matches) count += matches.length;
  });
  return count;
}

function countSinglePattern(text: string, pattern: RegExp): number {
  const matches = text.match(new RegExp(pattern.source, pattern.flags + 'g'));
  return matches ? matches.length : 0;
}

export function collectLeadMagnetPlainText(): string {
  const parts: string[] = [];

  buildInvestmentPlaybook().chapters.forEach(chapter => {
    parts.push(chapter.title, chapter.executiveSummary);
    chapter.subsections.forEach(subsection => {
      parts.push(
        subsection.title,
        ...subsection.analysis,
        subsection.keyInsight,
        subsection.whoFits,
        ...subsection.watchPoints
      );
    });
  });

  INVESTMENT_REPORT_2026.chapters.forEach(chapter => {
    parts.push(chapter.title);
    chapter.blocks.forEach(block => {
      if (block.kind === 'prose') {
        parts.push(...block.paragraphs);
      } else if (block.kind === 'zone-focus') {
        parts.push(block.zone, ...block.paragraphs);
      } else if (block.kind === 'product-segment') {
        parts.push(
          block.name,
          block.buyerProfile,
          block.renterProfile,
          block.liquidity,
          block.strengths,
          block.limitations,
          block.strategyFit
        );
      } else if (block.kind === 'factor') {
        parts.push(block.factor, block.analysis);
      } else {
        parts.push(block.topic, block.guidance);
      }
    });
  });

  return parts.join('\n');
}

export function countCommercialMentions(text: string): CommercialMentionCounts {
  return {
    sunGroup: countPatternMatches(text, SUN_PATTERNS),
    maiDangChon: countSinglePattern(text, MAI_DANG_CHON_PATTERN),
    fpt: countSinglePattern(text, FPT_PATTERN),
    namDaNang: countSinglePattern(text, NAM_DA_NANG_PATTERN),
  };
}

export interface CommercialBalanceResult {
  passed: boolean;
  counts: CommercialMentionCounts;
  priorityOrderPassed: boolean;
  message: string;
}

export function auditCommercialBalance(): CommercialBalanceResult {
  const text = collectLeadMagnetPlainText();
  const counts = countCommercialMentions(text);
  const sunPlusMai = counts.sunGroup + counts.maiDangChon;
  const fptNotDominant = counts.fpt <= sunPlusMai;

  const sunIndex = text.search(/sun group|sun symphony/i);
  const maiIndex = text.search(MAI_DANG_CHON_PATTERN);
  const namIndex = text.search(NAM_DA_NANG_PATTERN);
  const fptIndex = text.search(FPT_PATTERN);
  const priorityOrderPassed =
    fptIndex === -1 ||
    (sunIndex !== -1 &&
      maiIndex !== -1 &&
      namIndex !== -1 &&
      sunIndex < fptIndex &&
      maiIndex < fptIndex &&
      namIndex < fptIndex);

  const passed = fptNotDominant && priorityOrderPassed;
  const message = passed
    ? `Sun ${counts.sunGroup} + Mai ${counts.maiDangChon} ≥ FPT ${counts.fpt}; KPI thứ tự nhớ: Sun → Mai → Nam trước FPT.`
    : !fptNotDominant
      ? `FAIL: FPT (${counts.fpt}) > Sun+Mai (${sunPlusMai}).`
      : 'FAIL: FPT xuất hiện trước Sun Group, Mai Đăng Chơn hoặc Nam Đà Nẵng trong corpus.';

  return { passed, counts, priorityOrderPassed, message };
}

export function auditLeadMagnetContent() {
  const blocks = collectLeadMagnetTextBlocks();
  const failures = findHighSimilarityPairs(blocks);
  const commercial = auditCommercialBalance();
  return {
    blockCount: blocks.length,
    threshold: SIMILARITY_THRESHOLD,
    passed: failures.length === 0 && commercial.passed,
    failures,
    commercial,
  };
}
