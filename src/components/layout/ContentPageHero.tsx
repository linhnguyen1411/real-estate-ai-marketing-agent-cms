import type { ReactNode } from 'react';
import Breadcrumbs from '../seo/Breadcrumbs';
import type { BreadcrumbItem } from '../../seo/schemas';
import { SITE } from '../../seo/siteConfig';

interface ContentPageHeroProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  description?: string;
  meta?: ReactNode;
  children?: ReactNode;
  showBrand?: boolean;
}

export default function ContentPageHero({
  breadcrumbs,
  title,
  description,
  meta,
  children,
  showBrand = true,
}: ContentPageHeroProps) {
  return (
    <div className="border-b border-invest-border bg-gradient-to-br from-invest-blue-muted via-white to-amber-50/40">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {showBrand && (
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-invest-blue">{SITE.name}</p>
        )}
        <Breadcrumbs items={breadcrumbs} className="mb-5" />
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">{description}</p>
        )}
        {meta && <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">{meta}</div>}
        {children}
      </div>
    </div>
  );
}
