import type { ArticleType } from '../../blog/categorySuggest';
import { categorySlugForArticleType } from '../../blog/categorySuggest';
import { BRAND_PROMPT_LAYER } from './brandPrompt';
import { BANNED_HEADING_LABELS, BANNED_PHRASES } from './contentRules';
import { SEO_CLIPBOARD_OUTPUT_FORMAT, SEO_PROMPT_LAYER } from './seoPrompt';
import { buildSectionOutlineInstruction } from './sectionTypes';
import { STYLE_PROMPT_LAYER } from './stylePrompt';
import { SYSTEM_PROMPT_LAYER } from './systemPrompt';
import { VALIDATOR_AUDIT_CHECKLIST } from './validatorPrompt';

export interface BlogDraftUserInput {
  keyword: string;
  focusProducts?: string;
  area?: string;
  goal?: string;
  audience?: string;
  tone?: string;
  usePersonalExperience?: boolean;
  internalLinks?: string[];
  cta?: string;
  articleType: ArticleType;
  bannedViolations?: string[];
  validationViolations?: string[];
}

export function assembleBlogSystemPrompt(): string {
  return [
    SYSTEM_PROMPT_LAYER,
    STYLE_PROMPT_LAYER,
    BRAND_PROMPT_LAYER,
    SEO_PROMPT_LAYER,
    VALIDATOR_AUDIT_CHECKLIST,
    `CẤM CỤM (xuất hiện > ${2} lần = FAIL): ${BANNED_PHRASES.join(' | ')}`,
    `CẤM HEADING: ${BANNED_HEADING_LABELS.join(', ')}`,
    `Cấu trúc output:
---
title:
slug:
category:
tags:
metaTitle:
metaDescription:
primaryKeyword:
targetIntent:
excerpt:
status: draft
---

(Nội dung H2/H3)

## FAQ
(≥2 cặp)

## Liên hệ thẩm định
(CTA theo yêu cầu)`,
  ].join('\n\n');
}

export function assembleBlogUserPrompt(input: BlogDraftUserInput): string {
  const categorySlug = categorySlugForArticleType(input.articleType) || 'phan-tich-du-an';
  const sectionPlan = buildSectionOutlineInstruction(input.articleType);
  const retryNotes = [
    input.bannedViolations?.length ?
      `LẦN TRƯỚC VI PHẠM HEADING: ${input.bannedViolations.join(', ')}. Đổi tiêu đề H2.`
    : '',
    input.validationViolations?.length ?
      `LẦN TRƯỚC VI PHẠM NỘI DUNG: ${input.validationViolations.join('; ')}. Viết lại tránh lặp.`
    : '',
  ].filter(Boolean).join('\n');

  return `USER PROMPT — Tạo bài SEO draft (status=draft, KHÔNG publish).

Từ khóa & trục nội dung:
${input.keyword}
${input.keyword.includes(',') ? '→ Tách từng ý trong cụm; mỗi đặc điểm có đoạn hoặc bullet riêng.' : '→ Mở rộng: vị trí, sản phẩm, đối tượng, thanh khoản, điểm cần đối chiếu.'}

Loại bài: ${input.articleType}
Category (frontmatter): ${categorySlug}
Sản phẩm trọng tâm: ${input.focusProducts || 'Sun Group Đà Nẵng'}
Khu vực: ${input.area || 'Đà Nẵng'}
Mục tiêu: ${input.goal || 'Hỗ trợ thẩm định trước quyết định'}
Đối tượng: ${input.audience || 'Người mua ở & nhà đầu tư'}
Giọng: ${input.tone || 'Phân tích chuyên môn, bình tĩnh'}
Trải nghiệm cá nhân: ${input.usePersonalExperience ? 'Có thể dùng góc tư vấn, không bịa case' : 'Không dùng case giả'}
Internal links (2–4): ${(input.internalLinks || []).join(', ') || '/du-an, /bat-dong-san, /tai-lieu-dau-tu'}
CTA: ${input.cta || 'Liên hệ Zalo để thẩm định trước khi xuống tiền.'}
${retryNotes}

${sectionPlan}

Độ dài: 900–1400 từ.`;
}

export function assembleSeoClipboardPrompt(input: {
  keyword: string;
  articleTypeLabel: string;
  cta: string;
}): string {
  return [
    assembleBlogSystemPrompt(),
    assembleBlogUserPrompt({
      keyword: input.keyword.trim(),
      articleType: 'review-project',
      cta: input.cta.trim(),
      goal: `Loại bài: ${input.articleTypeLabel}`,
    }),
    SEO_CLIPBOARD_OUTPUT_FORMAT,
    `Loại bài (nhãn): ${input.articleTypeLabel}`,
    'Bài tối thiểu 1200 từ.',
  ].join('\n\n');
}

export function assembleAssistSystemPrompt(): string {
  return [SYSTEM_PROMPT_LAYER, STYLE_PROMPT_LAYER, BRAND_PROMPT_LAYER].join('\n\n');
}
