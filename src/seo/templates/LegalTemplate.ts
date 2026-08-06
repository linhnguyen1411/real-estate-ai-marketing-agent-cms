import { TEMPLATE_SECTIONS } from '../data/templateSections';
import { escapeHtml } from '../ssr/escapeHtml';
import { renderShell } from './templateParts';
import type { SeoTemplateContext } from './types';

/**
 * Legal / compliance template.
 */
export function renderLegalTemplate(ctx: SeoTemplateContext): string {
  const s = TEMPLATE_SECTIONS.legal;
  const body = ctx.seo.description || ctx.content?.defaultDescription || '';
  const points = ctx.seo.keywords || ctx.cluster?.secondaryKeywords || [];

  const main = `
    <section>
      <h2>${escapeHtml(s.status)}</h2>
      <p>${escapeHtml(body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.ownership)}</h2>
      <p>${escapeHtml(points[0] || ctx.entity?.name || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.construction)}</h2>
      <p>${escapeHtml(points[1] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.planning)}</h2>
      <p>${escapeHtml(points[2] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.timeline)}</h2>
      <p>${escapeHtml(ctx.content?.defaultTitle || ctx.seo.title)}</p>
      <p>${escapeHtml(points[3] || body)}</p>
    </section>
  `;

  return renderShell(ctx, main);
}
