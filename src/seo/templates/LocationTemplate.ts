import { TEMPLATE_SECTIONS } from '../data/templateSections';
import { escapeHtml } from '../ssr/escapeHtml';
import { renderShell } from './templateParts';
import type { SeoTemplateContext } from './types';

/**
 * Location / area hub template.
 */
export function renderLocationTemplate(ctx: SeoTemplateContext): string {
  const s = TEMPLATE_SECTIONS.location;
  const body = ctx.seo.description || ctx.content?.defaultDescription || '';
  const points = ctx.cluster?.secondaryKeywords || ctx.seo.keywords || [];
  const nearby = ctx.internalLinks.related
    .filter(item => item.relation === 'location' || item.relation === 'project' || item.relation === 'related')
    .map(item => ({ href: item.slug, label: item.label || item.slug }));

  const main = `
    <section>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.overview)}</h2>
      <p>${escapeHtml(body)}</p>
      ${ctx.entity ? `<p><strong>${escapeHtml(ctx.entity.name)}</strong></p>` : ''}
    </section>
    <section>
      <h2>${escapeHtml(s.infrastructure)}</h2>
      <p>${escapeHtml(points[0] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.population)}</h2>
      <p>${escapeHtml(points[1] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.commercial)}</h2>
      <p>${escapeHtml(points[2] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.connectivity)}</h2>
      <p>${escapeHtml(points[3] || body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.nearby)}</h2>
      <ul>
        ${(nearby.length ? nearby : ctx.relatedPages).slice(0, 8)
          .map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`)
          .join('') || `<li>${escapeHtml(ctx.entity?.name || body)}</li>`}
      </ul>
    </section>
  `;

  return renderShell(ctx, main);
}
