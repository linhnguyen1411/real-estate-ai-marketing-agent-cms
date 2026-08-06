import { TEMPLATE_SECTIONS } from '../data/templateSections';
import { escapeHtml } from '../ssr/escapeHtml';
import { renderShell } from './templateParts';
import type { SeoTemplateContext } from './types';

/**
 * Project / portfolio project page template.
 */
export function renderProjectTemplate(ctx: SeoTemplateContext): string {
  const s = TEMPLATE_SECTIONS.project;
  const overview = ctx.seo.description || ctx.content?.defaultDescription || '';
  const towers = (ctx.relatedEntities || []).filter(e => e.entityType === 'tower' || e.entityType === 'project');
  const childTowers = towers.length
    ? towers
    : (ctx.relatedEntities || []);

  const main = `
    <section>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.overview)}</h2>
      <p>${escapeHtml(overview)}</p>
      ${ctx.entity ? `<p><strong>${escapeHtml(ctx.entity.name)}</strong></p>` : ''}
    </section>
    <section>
      <h2>${escapeHtml(s.highlights)}</h2>
      <ul>
        ${(ctx.cluster?.secondaryKeywords || ctx.seo.keywords || [])
          .slice(0, 6)
          .map(item => `<li>${escapeHtml(item)}</li>`)
          .join('') || `<li>${escapeHtml(overview)}</li>`}
      </ul>
    </section>
    ${childTowers.length ? `
      <section>
        <h2>${escapeHtml(s.towers)}</h2>
        <ul>
          ${childTowers.map(e => `<li>${escapeHtml(e.name)}</li>`).join('')}
        </ul>
      </section>
    ` : ''}
    ${renderRelatedProjects(ctx, s.nearby)}
  `;

  return renderShell(ctx, main);
}

function renderRelatedProjects(ctx: SeoTemplateContext, title: string): string {
  const links = ctx.internalLinks.related
    .filter(item => item.relation === 'project' || item.relation === 'related' || item.relation === 'comparison')
    .map(item => ({ href: item.slug, label: item.label || item.slug }));
  if (!links.length && !ctx.relatedPages.length) return '';
  const merged = [...links, ...ctx.relatedPages].slice(0, 8);
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <ul>
        ${merged.map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('')}
      </ul>
    </section>
  `;
}
