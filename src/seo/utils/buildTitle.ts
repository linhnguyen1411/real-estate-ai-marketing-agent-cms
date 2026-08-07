import { PageType } from '../types/PageType';

export type BuildTitleOptions = {
  /**
   * When true, append ` | Estoria` if missing (matches historical `formatPageTitle`).
   * SSR / share-meta paths pass false to preserve exact historical titles.
   */
  appendBrand?: boolean;
  brand?: string;
  /**
   * When set, generate an intent-driven title from page type + primary keyword
   * instead of using the raw `title` string as the body.
   */
  pattern?: IntentTitlePattern;
};

/** Intent-driven title pattern input (one primary keyword per page). */
export type IntentTitlePattern = {
  pageType: PageType;
  primaryKeyword: string;
  /** Project / area name for FINANCIAL / PROJECT patterns */
  project?: string;
  /** Second project for COMPARISON */
  projectB?: string;
  /** Comparison intent phrase (e.g. "giá & yield") */
  comparisonIntent?: string;
  year?: number;
  brand?: string;
};

const DEFAULT_BRAND = 'Estoria';

/**
 * Build title from investor-intent patterns.
 *
 * FINANCIAL  — {Primary} | Phân tích đầu tư {Project} | Estoria
 * COMPARISON — So sánh {A} và {B}: {Intent} | Estoria
 * LEGAL      — {Primary} | Cập nhật {Year}
 * LOCATION   — {Primary} | Phân tích khu vực | Estoria
 * CATALOG    — {Primary} | Danh sách cập nhật
 * PROJECT    — {Primary} | Phân tích đầu tư {Project} | Estoria
 */
export function buildIntentTitle(pattern: IntentTitlePattern): string {
  const primary = String(pattern.primaryKeyword || '').trim();
  if (!primary) return '';

  const brand = pattern.brand || DEFAULT_BRAND;
  const year = pattern.year ?? new Date().getFullYear();
  const project = String(pattern.project || '').trim();
  const projectB = String(pattern.projectB || '').trim();
  const comparisonIntent = String(pattern.comparisonIntent || primary).trim();

  switch (pattern.pageType) {
    case PageType.FINANCIAL:
    case PageType.PROJECT:
      return formatAnalysisTitle(primary, project, brand);
    case PageType.COMPARISON:
      if (project && projectB) {
        return `So sánh ${project} và ${projectB}: ${comparisonIntent} | ${brand}`;
      }
      return `${primary} | So sánh đầu tư | ${brand}`;
    case PageType.LEGAL:
      return `${primary} | Cập nhật ${year}`;
    case PageType.LOCATION:
      return `${primary} | Phân tích khu vực | ${brand}`;
    case PageType.CATALOG:
      return `${primary} | Danh sách cập nhật`;
    default:
      return `${primary} | ${brand}`;
  }
}

/** Avoid “Phân tích đầu tư X | Phân tích đầu tư X | Brand” when primary already carries the intent. */
function formatAnalysisTitle(primary: string, project: string, brand: string): string {
  const lower = primary.toLowerCase();
  const alreadyIntent =
    lower.includes('phân tích đầu tư') ||
    lower.includes('roi ') ||
    lower.startsWith('roi ') ||
    lower.includes('dữ liệu thị trường') ||
    lower.includes('tài liệu');
  if (alreadyIntent || !project) {
    return `${primary} | ${brand}`;
  }
  return `${primary} | Phân tích đầu tư ${project} | ${brand}`;
}

/**
 * Single entry for page title generation.
 * Prefer `options.pattern` for intent-driven titles; otherwise trim + optional brand suffix.
 */
export function buildTitle(title: string, options: BuildTitleOptions = {}): string {
  const fromPattern = options.pattern ? buildIntentTitle(options.pattern) : '';
  const trimmed = String(fromPattern || title || '').trim();
  if (!trimmed) return '';

  if (!options.appendBrand) return trimmed;

  const brand = options.brand || DEFAULT_BRAND;
  const brandSuffix = new RegExp(`\\|\\s*${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  if (brandSuffix.test(trimmed)) return trimmed;
  return `${trimmed} | ${brand}`;
}
