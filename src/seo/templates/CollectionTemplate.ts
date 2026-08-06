import { TEMPLATE_SECTIONS } from '../data/templateSections';
import { escapeHtml } from '../ssr/escapeHtml';
import { renderShell } from './templateParts';
import type { SeoTemplateContext } from './types';

/**
 * Collection / category / catalog template.
 */
export function renderCollectionTemplate(ctx: SeoTemplateContext): string {
  const s = TEMPLATE_SECTIONS.collection;
  const body = ctx.seo.description || ctx.content?.defaultDescription || '';
  const items = ctx.collectionItems?.length
    ? ctx.collectionItems
    : [
        ...ctx.internalLinks.related
          .filter(item => item.relation === 'children' || item.relation === 'related')
          .map(item => ({ href: item.slug, label: item.label || item.slug })),
        ...ctx.relatedPages,
      ];

  const developers = (ctx.relatedEntities || [])
    .filter(e => e.entityType === 'developer' || e.entityType === 'brand' || e.entityType === 'project')
    .map(e => e.name);
  const areas = (ctx.relatedEntities || [])
    .filter(e => e.entityType === 'location' || e.entityType === 'zone')
    .map(e => e.name);

  const main = `
    <section>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.overview)}</h2>
      <p>${escapeHtml(body)}</p>
    </section>
    <section>
      <h2>${escapeHtml(s.items)}</h2>
      <ul>
        ${items.slice(0, 16).map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('')
          || `<li>${escapeHtml(body)}</li>`}
      </ul>
    </section>
    <section>
      <h2>${escapeHtml(s.filters)}</h2>
      <ul>
        ${(ctx.cluster?.secondaryKeywords || ctx.seo.keywords || []).slice(0, 8)
          .map(item => `<li>${escapeHtml(item)}</li>`)
          .join('') || `<li>${escapeHtml(ctx.cluster?.primaryKeyword || body)}</li>`}
      </ul>
    </section>
    ${areas.length ? `
      <section>
        <h2>${escapeHtml(s.areas)}</h2>
        <ul>${areas.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
      </section>
    ` : ''}
    ${developers.length ? `
      <section>
        <h2>${escapeHtml(s.developers)}</h2>
        <ul>${developers.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
      </section>
    ` : ''}
  `;

  return renderShell(ctx, main);
}
