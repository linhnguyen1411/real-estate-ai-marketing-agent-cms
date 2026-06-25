import { jaccardSimilarity, maxParagraphSimilarity } from '../seed/contentAudit';
import { stripMarkdown } from './textUtils';

export interface DuplicateCheckResult {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  details: {
    duplicateMetaTitle?: string[];
    duplicateMetaDescription?: string[];
    duplicateH1?: string[];
    similarPosts: { slug: string; title: string; similarity: number; paragraphSimilarity: number }[];
    duplicateParagraphs: { text: string; slug: string }[];
    outlineOverlap?: { slug: string; overlap: number }[];
  };
}

const SIMILARITY_THRESHOLD = 0.35;
const OUTLINE_THRESHOLD = 0.6;
const PARAGRAPH_MIN_LEN = 80;

function extractH2Outline(markdown: string): string[] {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim().toLowerCase());
}

function outlineOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const overlap = a.filter(h => setB.has(h)).length;
  return overlap / Math.max(a.length, b.length);
}

function extractParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length >= PARAGRAPH_MIN_LEN);
}

export function runDuplicateCheck(
  candidate: {
    id?: string;
    slug: string;
    title: string;
    metaTitle: string;
    metaDescription: string;
    contentMarkdown: string;
  },
  publishedPosts: {
    id: string;
    slug: string;
    title: string;
    metaTitle: string;
    metaDescription: string;
    content: string;
  }[]
): DuplicateCheckResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const others = publishedPosts.filter(p => p.id !== candidate.id && p.slug !== candidate.slug);

  const duplicateMetaTitle = others
    .filter(p => p.metaTitle.trim().toLowerCase() === candidate.metaTitle.trim().toLowerCase())
    .map(p => p.slug);
  if (duplicateMetaTitle.length) {
    blockers.push(`Meta title trùng với: ${duplicateMetaTitle.join(', ')}`);
  }

  const duplicateMetaDescription = others
    .filter(p => p.metaDescription.trim().toLowerCase() === candidate.metaDescription.trim().toLowerCase())
    .map(p => p.slug);
  if (duplicateMetaDescription.length) {
    blockers.push(`Meta description trùng với: ${duplicateMetaDescription.join(', ')}`);
  }

  const duplicateH1 = others
    .filter(p => p.title.trim().toLowerCase() === candidate.title.trim().toLowerCase())
    .map(p => p.slug);
  if (duplicateH1.length) {
    blockers.push(`H1/title trùng với: ${duplicateH1.join(', ')}`);
  }

  const candidatePlain = stripMarkdown(candidate.contentMarkdown);
  const candidateOutline = extractH2Outline(candidate.contentMarkdown);
  const similarPosts: DuplicateCheckResult['details']['similarPosts'] = [];
  const outlineOverlapList: { slug: string; overlap: number }[] = [];
  const duplicateParagraphs: { text: string; slug: string }[] = [];

  for (const post of others) {
    const postPlain = stripMarkdown(post.content);
    const sim = jaccardSimilarity(candidatePlain, postPlain);
    const paraSim = maxParagraphSimilarity(candidate.contentMarkdown, post.content);
    if (sim > SIMILARITY_THRESHOLD || paraSim > 0.5) {
      similarPosts.push({
        slug: post.slug,
        title: post.title,
        similarity: Math.round(sim * 100) / 100,
        paragraphSimilarity: Math.round(paraSim * 100) / 100,
      });
    }

    const overlap = outlineOverlap(candidateOutline, extractH2Outline(post.content));
    if (overlap > OUTLINE_THRESHOLD) {
      outlineOverlapList.push({ slug: post.slug, overlap: Math.round(overlap * 100) / 100 });
    }

    for (const para of extractParagraphs(candidate.contentMarkdown)) {
      for (const otherPara of extractParagraphs(post.content)) {
        if (para.slice(0, 80) === otherPara.slice(0, 80) && para.length >= PARAGRAPH_MIN_LEN) {
          duplicateParagraphs.push({ text: para.slice(0, 100) + '…', slug: post.slug });
        }
      }
    }
  }

  if (similarPosts.length) {
    blockers.push(
      `Nội dung tương tự > ${SIMILARITY_THRESHOLD * 100}%: ${similarPosts.map(s => `${s.slug} (${s.similarity})`).join(', ')}`
    );
  }

  if (outlineOverlapList.length) {
    warnings.push(
      `Outline H2 trùng > ${OUTLINE_THRESHOLD * 100}%: ${outlineOverlapList.map(o => `${o.slug} (${o.overlap})`).join(', ')}`
    );
  }

  if (duplicateParagraphs.length) {
    blockers.push(`Có đoạn văn trùng ≥ ${PARAGRAPH_MIN_LEN} ký tự với bài khác`);
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    details: {
      duplicateMetaTitle: duplicateMetaTitle.length ? duplicateMetaTitle : undefined,
      duplicateMetaDescription: duplicateMetaDescription.length ? duplicateMetaDescription : undefined,
      duplicateH1: duplicateH1.length ? duplicateH1 : undefined,
      similarPosts,
      duplicateParagraphs: duplicateParagraphs.slice(0, 10),
      outlineOverlap: outlineOverlapList.length ? outlineOverlapList : undefined,
    },
  };
}
