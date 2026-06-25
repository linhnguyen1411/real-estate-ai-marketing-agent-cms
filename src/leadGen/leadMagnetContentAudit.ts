import {
  INVESTMENT_MAP_ZONES,
  MARKET_REPORT_SECTIONS,
  OPPORTUNITY_GROUPS,
} from './leadMagnetFramework';
import type { OpportunityGroup, ReportSection } from '../types/leadMagnetContent';
import { formatOpportunityGroupLabel } from '../types/leadMagnetContent';

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

function flattenReportSection(section: ReportSection): TextBlock[] {
  const base = { magnet: 'bao-cao-nam-da-nang-2026', section: section.title };
  const blocks: TextBlock[] = [];

  if (section.kind === 'market-insight') {
    blocks.push(
      { ...base, id: `${section.id}:summary`, text: section.summary },
      {
        ...base,
        id: `${section.id}:fit`,
        text: [section.investorFit, ...section.keyDrivers, ...section.watchPoints, ...section.risks].join(' '),
      }
    );
  } else {
    blocks.push({ ...base, id: `${section.id}:intro`, text: section.intro });
  }

  if (section.kind === 'budget-framework') {
    section.tiers.forEach((tier, index) => {
      blocks.push({
        ...base,
        id: `${section.id}:tier-${index}`,
        text: [tier.range, ...tier.assetTypes, ...tier.advantages, ...tier.limitations].join(' '),
      });
    });
  } else if (section.kind === 'remote-ops-risk') {
    section.items.forEach((item, index) => {
      blocks.push({
        ...base,
        id: `${section.id}:risk-${index}`,
        text: [item.topic, item.description, item.mitigation].join(' '),
      });
    });
  } else if (section.kind === 'pre-purchase-checklist') {
    section.phases.forEach((phase, index) => {
      blocks.push({
        ...base,
        id: `${section.id}:phase-${index}`,
        text: [phase.label, ...phase.items].join(' '),
      });
    });
  }

  return blocks;
}

function flattenOpportunityGroup(group: OpportunityGroup): TextBlock[] {
  const base = {
    magnet: 'top-20-co-hoi-dau-tu',
    section: formatOpportunityGroupLabel(group.rank),
  };
  return [
    { ...base, id: `group-${group.rank}:why`, text: group.whyWatch },
    { ...base, id: `group-${group.rank}:risk`, text: group.risks },
  ];
}

export function collectLeadMagnetTextBlocks(): TextBlock[] {
  const blocks: TextBlock[] = [];

  MARKET_REPORT_SECTIONS.forEach(section => {
    blocks.push(...flattenReportSection(section));
  });

  OPPORTUNITY_GROUPS.forEach(group => {
    blocks.push(...flattenOpportunityGroup(group));
  });

  INVESTMENT_MAP_ZONES.forEach(zone => {
    blocks.push({
      id: `map:${zone.id}`,
      magnet: 'ban-do-dau-tu-nam-da-nang',
      section: zone.label,
      text: zone.note,
    });
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

  OPPORTUNITY_GROUPS.forEach(group => {
    parts.push(
      group.name,
      group.area,
      group.assetType,
      group.whyWatch,
      group.risks,
      group.suitableBudget
    );
  });

  MARKET_REPORT_SECTIONS.forEach(section => {
    if (section.kind === 'market-insight') {
      parts.push(
        section.title,
        section.summary,
        ...section.keyDrivers,
        ...section.watchPoints,
        section.investorFit,
        ...section.risks
      );
    } else if (section.kind === 'budget-framework') {
      parts.push(section.title, section.intro);
      section.tiers.forEach(tier => {
        parts.push(tier.range, ...tier.assetTypes, ...tier.advantages, ...tier.limitations);
      });
    } else if (section.kind === 'remote-ops-risk') {
      parts.push(section.title, section.intro);
      section.items.forEach(item => {
        parts.push(item.topic, item.description, item.mitigation);
      });
    } else if (section.kind === 'pre-purchase-checklist') {
      parts.push(section.title, section.intro);
      section.phases.forEach(phase => {
        parts.push(phase.label, ...phase.items);
      });
    }
  });

  INVESTMENT_MAP_ZONES.forEach(zone => {
    parts.push(zone.label, zone.note);
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
