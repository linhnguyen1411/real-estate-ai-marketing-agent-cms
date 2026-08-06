import { PageType } from '../types/PageType';
import type { BreadcrumbItem } from '../types/SeoMetadata';
import { SITE } from '../siteConfig';
import { normalizePathname } from '../utils/normalizeCanonical';

export type ResolveBreadcrumbInput = {
  route: string;
  pageType: PageType;
  /** Optional leaf label (e.g. property title). */
  leafName?: string;
  breadcrumbs?: BreadcrumbItem[];
};

/**
 * Breadcrumb trail selection — single place only.
 * Does not emit BreadcrumbList JSON.
 */
export function resolveBreadcrumb(input: ResolveBreadcrumbInput): BreadcrumbItem[] {
  if (input.breadcrumbs?.length) return input.breadcrumbs;

  const path = normalizePathname(input.route);
  if (path === '/' || input.pageType === PageType.HOME) {
    return [{ name: SITE.name, path: '/' }];
  }

  const crumbs: BreadcrumbItem[] = [{ name: 'Trang chủ', path: '/' }];
  const segments = path.split('/').filter(Boolean);

  let acc = '';
  for (let i = 0; i < segments.length; i += 1) {
    acc += `/${segments[i]}`;
    const isLast = i === segments.length - 1;
    const name = isLast && input.leafName
      ? input.leafName
      : humanizeSegment(segments[i]);
    crumbs.push({ name, path: acc });
  }

  return crumbs;
}

function humanizeSegment(segment: string): string {
  return decodeURIComponent(segment)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
