import { CONTACT, PRIMARY_CTA, SITE } from '../siteConfig';
import { TEMPLATE_SECTIONS } from '../data/templateSections';
import { escapeHtml } from '../ssr/escapeHtml';
import type { SeoTemplateContext, TemplateLink } from './types';

export function renderBreadcrumbNav(ctx: SeoTemplateContext): string {
  const items = ctx.breadcrumb?.items || ctx.seo.breadcrumb || [];
  if (!items.length) return '';
  return `
    <nav aria-label="${escapeHtml(TEMPLATE_SECTIONS.shared.breadcrumb)}">
      <ol>
        ${items.map(item => `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></li>`).join('')}
      </ol>
    </nav>
  `;
}

export function renderFaqSection(ctx: SeoTemplateContext): string {
  if (!ctx.faqs.length) return '';
  return `
    <section>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.faq)}</h2>
      <dl>
        ${ctx.faqs.map(faq => `
          <dt>${escapeHtml(faq.question)}</dt>
          <dd>${escapeHtml(faq.answer)}</dd>
        `).join('')}
      </dl>
    </section>
  `;
}

export function renderRelatedSection(
  title: string,
  links: TemplateLink[],
): string {
  if (!links.length) return '';
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <ul>
        ${links.map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('')}
      </ul>
    </section>
  `;
}

export function renderKeywordSection(ctx: SeoTemplateContext): string {
  const keywords = [
    ...(ctx.cluster ? [ctx.cluster.primaryKeyword, ...ctx.cluster.secondaryKeywords] : []),
    ...(ctx.seo.keywords || []),
  ].filter(Boolean);
  const unique = Array.from(new Set(keywords)).slice(0, 12);
  if (!unique.length) return '';
  return `
    <aside>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.keywords)}</h2>
      <p>${escapeHtml(unique.join(', '))}</p>
    </aside>
  `;
}

export function renderEntityAside(ctx: SeoTemplateContext): string {
  if (!ctx.entity) return '';
  const related = (ctx.relatedEntities || []).slice(0, 6);
  return `
    <aside>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.entity)}</h2>
      <p><strong>${escapeHtml(ctx.entity.name)}</strong> · ${escapeHtml(ctx.entity.entityType)}</p>
      ${ctx.entity.aliases?.length
        ? `<p>${escapeHtml(ctx.entity.aliases.join(', '))}</p>`
        : ''}
      ${related.length
        ? `<ul>${related.map(e => `<li>${escapeHtml(e.name)}</li>`).join('')}</ul>`
        : ''}
    </aside>
  `;
}

export function renderCtaSection(ctx: SeoTemplateContext): string {
  const label = PRIMARY_CTA;
  const entityHint = ctx.entity?.name ? ` · ${ctx.entity.name}` : '';
  return `
    <section>
      <h2>${escapeHtml(TEMPLATE_SECTIONS.shared.cta)}</h2>
      <p><a href="/lien-he">${escapeHtml(label)}${escapeHtml(entityHint)}</a></p>
      <p><a href="tel:${escapeHtml(CONTACT.phoneTel)}">${escapeHtml(CONTACT.phoneDisplay)}</a></p>
      <p>${escapeHtml(SITE.name)} · ${escapeHtml(SITE.brand)}</p>
    </section>
  `;
}

export function renderPageHeader(ctx: SeoTemplateContext): string {
  const h1 = ctx.seo.title || ctx.content?.defaultTitle || ctx.entity?.name || SITE.name;
  const intro = ctx.seo.description || ctx.content?.defaultDescription || '';
  return `
    <header>
      ${renderBreadcrumbNav(ctx)}
      <h1>${escapeHtml(h1)}</h1>
      <p>${escapeHtml(intro)}</p>
    </header>
  `;
}

export function wrapTemplateDocument(inner: string): string {
  return `<div id="ssr-seo" data-ssr="1" data-template="1">${inner}</div>`;
}

export function renderShell(ctx: SeoTemplateContext, mainInner: string, asideExtra = ''): string {
  return wrapTemplateDocument(`
    ${renderPageHeader(ctx)}
    <main>
      <article>
        ${mainInner}
        ${renderFaqSection(ctx)}
        ${renderRelatedSection(TEMPLATE_SECTIONS.shared.related, [
          ...ctx.relatedPages,
          ...ctx.moneyPages,
        ].filter((link, index, all) => all.findIndex(item => item.href === link.href) === index).slice(0, 10))}
        ${renderCtaSection(ctx)}
      </article>
      ${renderEntityAside(ctx)}
      ${renderKeywordSection(ctx)}
      ${asideExtra}
    </main>
    <footer>
      <p>${escapeHtml(SITE.name)} · ${escapeHtml(SITE.brand)}</p>
    </footer>
  `);
}
