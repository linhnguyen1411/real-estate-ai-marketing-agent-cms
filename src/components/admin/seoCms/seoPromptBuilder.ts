import { ARTICLE_TYPE_OPTIONS } from './seoCmsConstants';
import { assembleSeoClipboardPrompt } from '../../../../server/ai/prompts/assemblePrompt';

export function buildSeoContentPrompt(input: {
  keyword: string;
  articleType: string;
  cta: string;
}): string {
  const typeLabel =
    ARTICLE_TYPE_OPTIONS.find(o => o.value === input.articleType)?.label || input.articleType;

  return assembleSeoClipboardPrompt({
    keyword: input.keyword,
    articleTypeLabel: typeLabel,
    cta: input.cta,
  });
}
