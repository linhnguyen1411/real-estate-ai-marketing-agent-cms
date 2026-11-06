import type { Property } from '../../types';
import { PageType } from '../types/PageType';
import type { SeoMetadata } from '../types/SeoMetadata';
import { CONTACT, PRIMARY_CTA, SITE } from '../siteConfig';
import { MAIN_NAV } from '../routes';
import { escapeHtml, stripTags } from './escapeHtml';
import { renderSeoTemplateFromSeo } from '../templates';

export type SsrFeaturedProperty = {
  href: string;
  title: string;
  price?: number;
  area?: number;
  location?: string;
};

export type SsrBodyInput = {
  seo: SeoMetadata;
  /** Optional path override for template/data lookup */
  path?: string;
  property?: Property;
  /** Listing links rendered in raw HTML so crawlers can reach property pages. */
  featuredProperties?: SsrFeaturedProperty[];
  article?: {
    title: string;
    intro: string;
    summary?: string;
    toc?: { id: string; label: string }[];
  };
  comparison?: {
    title: string;
    summary: string;
    columns?: string[];
  };
  internalLinks?: { href: string; label: string }[];
};

/**
 * Crawlable semantic HTML for `#root` (server string only).
 * Template page types → SEO templates; other types keep legacy SSR bodies.
 * Safe with createRoot: client mount replaces this tree (no hydrateRoot).
 */
export function buildSsrBody(input: SsrBodyInput): string {
  const templated = renderSeoTemplateFromSeo({
    seo: input.seo,
    path: input.path,
  });
  if (templated) return templated + renderFeaturedProperties(input.featuredProperties);

  switch (input.seo.pageType) {
    case PageType.PROPERTY:
      return input.property
        ? renderPropertyBody(input.seo, input.property)
        : renderGenericBody(input.seo, input.internalLinks, input.featuredProperties);
    case PageType.ARTICLE:
      return renderArticleBody(input.seo, input.article, input.internalLinks);
    case PageType.NOT_FOUND:
      return renderNotFoundBody(input.seo);
    case PageType.HOME:
      return renderHomeBody(input.seo, input.internalLinks, input.featuredProperties);
    default:
      return renderGenericBody(input.seo, input.internalLinks, input.featuredProperties);
  }
}

function renderHomeBody(
  seo: SeoMetadata,
  links?: { href: string; label: string }[],
  featuredProperties?: SsrFeaturedProperty[],
): string {
  return wrap(`
    <header>
      <p>${escapeHtml(SITE.name)} · ${escapeHtml(SITE.brand)}</p>
      <h1>${escapeHtml(seo.title)}</h1>
      <p>${escapeHtml(seo.description)}</p>
    </header>
    <section>
      <h2>${escapeHtml(SITE.name)}</h2>
      <p>${escapeHtml(SITE.defaultDescription)}</p>
    </section>
    ${renderFeaturedProperties(featuredProperties)}
    ${renderInternalLinks(links || defaultNavLinks())}
    ${renderCta()}
  `);
}

function renderPropertyBody(seo: SeoMetadata, property: Property): string {
  const summary = stripMarkdown(stripTags(property.rich_description || property.description || seo.description)).slice(0, 500);
  const points = (property.selling_points || []).filter(Boolean).slice(0, 5).map(point => stripMarkdown(point));
  return wrap(`
    <header>
      <h1>${escapeHtml(property.title)}</h1>
      <p><strong>Giá:</strong> ${escapeHtml(property.price)} tỷ</p>
      <p><strong>Vị trí:</strong> ${escapeHtml(property.location)}</p>
      <p><strong>Diện tích:</strong> ${escapeHtml(property.area)} m² · <strong>Pháp lý:</strong> ${escapeHtml(property.legal_status)}</p>
    </header>
    <section>
      <h2>${escapeHtml(seo.title)}</h2>
      <p>${escapeHtml(summary)}</p>
      ${points.length ? `<ul>${points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
    </section>
    ${renderCta(`${PRIMARY_CTA}: ${property.title}`)}
    ${renderInternalLinks([
      { href: '/bat-dong-san', label: SITE.defaultTitle },
      { href: '/lien-he', label: CONTACT.companyName },
      { href: '/', label: SITE.name },
    ])}
  `);
}

function renderArticleBody(
  seo: SeoMetadata,
  article: SsrBodyInput['article'] | undefined,
  links?: { href: string; label: string }[],
): string {
  const title = article?.title || seo.title;
  const intro = article?.intro || seo.description;
  const summary = article?.summary || seo.description;
  const toc = article?.toc?.length
    ? article.toc
    : (seo.keywords || []).slice(0, 3).map((label, index) => ({
        id: `muc-${index + 1}`,
        label,
      }));

  return wrap(`
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(intro)}</p>
    </header>
    ${toc.length ? `
    <nav aria-label="${escapeHtml(seo.title)}">
      <h2>${escapeHtml(seo.title)}</h2>
      <ol>
        ${toc.map(item => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.label)}</a></li>`).join('')}
      </ol>
    </nav>` : ''}
    <section id="${escapeHtml(toc[0]?.id || 'summary')}">
      <h2>${escapeHtml(summary.slice(0, 40) || seo.title)}</h2>
      <p>${escapeHtml(summary)}</p>
    </section>
    ${renderInternalLinks(links || defaultNavLinks())}
    ${renderCta()}
  `);
}

function renderNotFoundBody(seo: SeoMetadata): string {
  return wrap(`
    <header>
      <h1>${escapeHtml(seo.title)}</h1>
      <p>${escapeHtml(seo.description)}</p>
    </header>
    <section>
      <h2>${escapeHtml(seo.title)}</h2>
      <p>${escapeHtml(seo.description)}</p>
    </section>
    ${renderInternalLinks([
      { href: '/', label: SITE.name },
      { href: '/bat-dong-san', label: SITE.defaultTitle },
      { href: '/lien-he', label: CONTACT.companyName },
    ])}
  `);
}

function renderGenericBody(
  seo: SeoMetadata,
  links?: { href: string; label: string }[],
  featuredProperties?: SsrFeaturedProperty[],
): string {
  return wrap(`
    <header>
      <h1>${escapeHtml(seo.title)}</h1>
      <p>${escapeHtml(seo.description)}</p>
    </header>
    <section>
      <h2>${escapeHtml(seo.title)}</h2>
      <p>${escapeHtml(seo.description)}</p>
    </section>
    ${renderFeaturedProperties(featuredProperties)}
    ${renderInternalLinks(links || defaultNavLinks())}
    ${renderCta()}
  `);
}

function renderFeaturedProperties(items?: SsrFeaturedProperty[]): string {
  if (!items?.length) return '';
  return `
    <section>
      <h2>Bất động sản nổi bật tại Đà Nẵng</h2>
      <ul>
        ${items.map(item => {
          const meta = [item.price ? `${item.price} tỷ` : '', item.area ? `${item.area} m²` : '', item.location || '']
            .filter(Boolean)
            .join(' · ');
          return `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>${meta ? ` — ${escapeHtml(meta)}` : ''}</li>`;
        }).join('')}
      </ul>
    </section>
  `;
}

function stripMarkdown(value: unknown): string {
  return String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderCta(label: string = PRIMARY_CTA): string {
  return `
    <section>
      <h2>${escapeHtml(PRIMARY_CTA)}</h2>
      <p><a href="/lien-he">${escapeHtml(label)}</a></p>
      <p>Hotline: <a href="tel:${escapeHtml(CONTACT.phoneTel)}">${escapeHtml(CONTACT.phoneDisplay)}</a></p>
    </section>
  `;
}

function renderInternalLinks(links: { href: string; label: string }[]): string {
  if (!links.length) return '';
  return `
    <section>
      <h2>${escapeHtml(SITE.name)}</h2>
      <ul>
        ${links.map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('')}
      </ul>
    </section>
  `;
}

function defaultNavLinks(): { href: string; label: string }[] {
  return MAIN_NAV.slice(0, 6).map(item => ({ href: item.href, label: item.label }));
}

function wrap(inner: string): string {
  return `<div id="ssr-seo" data-ssr="1">${inner}</div>`;
}
