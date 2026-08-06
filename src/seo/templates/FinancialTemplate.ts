import { TEMPLATE_SECTIONS } from '../data/templateSections';
import { escapeHtml } from '../ssr/escapeHtml';
import { renderShell } from './templateParts';
import type { SeoTemplateContext } from './types';

/**
 * Financial / investment analysis template.
 */
export function renderFinancialTemplate(ctx: SeoTemplateContext): string {
  const s = TEMPLATE_SECTIONS.financial;
  const body = ctx.seo.description || ctx.content?.defaultDescription || '';
  const points = ctx.cluster?.secondaryKeywords || ctx.seo.keywords || [];

  const main = `
    <section>
      <h2>${escapeHtml(s.analysis)}</h2>
      <p>${escapeHtml(body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.roi)}</h2>
      <p>${escapeHtml(ctx.cluster?.primaryKeyword || body)}</p>
      ${points[0] ? `<p>${escapeHtml(points[0])}</p>` : ''}
    </section>
    <section>
      <h2>${escapeHtml(s.payment)}</h2>
      <p>${escapeHtml(points[1] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.loan)}</h2>
      <p>${escapeHtml(points[2] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.cashflow)}</h2>
      <p>${escapeHtml(points[3] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.media)}</h2>
      <ul>
        ${ctx.moneyPages.map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('')
          || ctx.relatedPages.slice(0, 3).map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('')}
      </ul>
    </section>
  `;

  return renderShell(ctx, main);
}
