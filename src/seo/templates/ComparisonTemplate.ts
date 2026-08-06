import { TEMPLATE_SECTIONS } from '../data/templateSections';
import { escapeHtml } from '../ssr/escapeHtml';
import { renderShell } from './templateParts';
import type { SeoTemplateContext } from './types';

/**
 * Comparison template — table + pros/cons + recommendation.
 */
export function renderComparisonTemplate(ctx: SeoTemplateContext): string {
  const s = TEMPLATE_SECTIONS.comparison;
  const summary = ctx.seo.description || ctx.content?.defaultDescription || '';
  const columns = ctx.comparisonColumns?.length
    ? ctx.comparisonColumns
    : [
        ctx.entity?.name || TEMPLATE_SECTIONS.shared.entity,
        ...(ctx.relatedEntities || []).slice(0, 2).map(e => e.name),
      ].filter(Boolean);
  const safeColumns = columns.length >= 2
    ? columns
    : [summary.slice(0, 24) || 'A', 'B'];

  const pros = (ctx.cluster?.secondaryKeywords || ctx.seo.keywords || []).slice(0, 4);
  const cons = (ctx.relatedEntities || []).slice(0, 3).map(e => e.name);
  const projectLinks = ctx.internalLinks.related
    .filter(item => item.relation === 'project' || item.relation === 'comparison')
    .map(item => ({ href: item.slug, label: item.label || item.slug }));

  const main = `
    <section>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.overview)}</h2>
      <p>${escapeHtml(summary)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.table)}</h2>
      <table>
        <thead>
          <tr>${safeColumns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          <tr>${safeColumns.map(() => `<td>${escapeHtml(summary.slice(0, 80))}</td>`).join('')}</tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>${escapeHtml(s.pros)}</h2>
      <ul>${(pros.length ? pros : [summary]).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
    <section>
      <h2>${escapeHtml(s.cons)}</h2>
      <ul>${(cons.length ? cons : [ctx.cluster?.primaryKeyword || summary]).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
    <section>
      <h2>${escapeHtml(s.recommendation)}</h2>
      <p>${escapeHtml(ctx.cluster?.primaryKeyword || summary)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.investor)}</h2>
      <p>${escapeHtml(ctx.content?.defaultTitle || ctx.seo.title)}</p>
    </section>
    ${projectLinks.length || ctx.relatedPages.length ? `
      <section>
        <h2>${escapeHtml(s.projects)}</h2>
        <ul>
          ${[...projectLinks, ...ctx.relatedPages].slice(0, 8)
            .map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`)
            .join('')}
        </ul>
      </section>
    ` : ''}
  `;

  return renderShell(ctx, main);
}
