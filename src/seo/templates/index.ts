import { renderProjectTemplate } from './ProjectTemplate';
import { renderFinancialTemplate } from './FinancialTemplate';
import { renderComparisonTemplate } from './ComparisonTemplate';
import { renderLegalTemplate } from './LegalTemplate';
import { renderLocationTemplate } from './LocationTemplate';
import { renderCollectionTemplate } from './CollectionTemplate';
import { buildTemplateContext, type BuildTemplateContextInput } from './buildTemplateContext';
import type { SeoTemplateContext } from './types';

/**
 * Select and render the matching SEO template.
 */
export function renderSeoTemplate(ctx: SeoTemplateContext): string {
  switch (ctx.kind) {
    case 'project':
      return renderProjectTemplate(ctx);
    case 'financial':
      return renderFinancialTemplate(ctx);
    case 'comparison':
      return renderComparisonTemplate(ctx);
    case 'legal':
      return renderLegalTemplate(ctx);
    case 'location':
      return renderLocationTemplate(ctx);
    case 'collection':
      return renderCollectionTemplate(ctx);
    default: {
      const _exhaustive: never = ctx.kind;
      return _exhaustive;
    }
  }
}

/**
 * Build context from SEO metadata + data layer, then render template HTML.
 * Returns null when page type has no dedicated template.
 */
export function renderSeoTemplateFromSeo(input: BuildTemplateContextInput): string | null {
  const ctx = buildTemplateContext(input);
  if (!ctx) return null;
  return renderSeoTemplate(ctx);
}
