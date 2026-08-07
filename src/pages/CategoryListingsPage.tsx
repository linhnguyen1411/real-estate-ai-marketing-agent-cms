import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';

import { Property } from '../types';
import { getPublicPropertySlug } from '../utils/propertyShare';
import { getPropertyThumbnailUrl } from '../utils/propertyImage';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadCaptureForm from '../components/LeadCaptureForm';
import PaginationBar from '../components/common/PaginationBar';
import { getPageMetaByPath } from '../seo/pageMeta';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { PRIMARY_CTA, getSiteOrigin } from '../seo/siteConfig';
import { getPropertyProjectLabel } from '../seo/propertyCatalog';
import {
  AREA_RANGES,
  LISTING_CATALOG_ROOT,
  PRICE_RANGES,
  applyListingFilters,
  buildListingPath,
  getListingCategoryPath,
  getListingFacet,
  getListingFacetFromPath,
  getTransactionType,
  useListingPageSize,
  useListingUrlState,
} from '../features/listings';

function formatPrice(price: number) {
  return `${price} tỷ`;
}

interface CategoryListingsPageProps {
  /** When rendered from a top-level SEO hub route */
  forcedFacetSlug?: string;
}

export default function CategoryListingsPage({ forcedFacetSlug }: CategoryListingsPageProps = {}) {
  const location = useLocation();
  const { facet: facetSlugParam } = useParams<{ facet?: string }>();
  const facetFromPath = getListingFacetFromPath(location.pathname);
  const facetSlug = forcedFacetSlug || facetFromPath?.slug || facetSlugParam;
  const facet = getListingFacet(facetSlug);

  if ((facetSlugParam || forcedFacetSlug) && !facet && !facetFromPath) {
    return <Navigate to={LISTING_CATALOG_ROOT} replace />;
  }

  const categoryPath = getListingCategoryPath(facet, facetSlug);

  // Nested /bat-dong-san/:facet → canonical SEO hub when configured
  if (
    facet?.seoPath &&
    location.pathname.replace(/\/+$/, '') === `${LISTING_CATALOG_ROOT}/${facet.slug}`
  ) {
    return <Navigate to={facet.seoPath} replace />;
  }

  const [properties, setProperties] = useState<Property[]>([]);
  const { filters, setFilters, resetFilters } = useListingUrlState();
  const pageSize = useListingPageSize(3);

  const meta = getPageMetaByPath(categoryPath) || getPageMetaByPath(LISTING_CATALOG_ROOT);
  const origin = getSiteOrigin();
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Bất động sản', path: LISTING_CATALOG_ROOT },
    ...(facet
      ? [{ name: facet.label, path: categoryPath }]
      : []),
  ];

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/properties')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const list: Property[] = Array.isArray(json.data) ? json.data : [];
        setProperties(list);
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const projectOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(properties.map(p => getPropertyProjectLabel(p)).filter(Boolean)),
    ) as string[];
    return fromData.sort((a, b) => a.localeCompare(b, 'vi'));
  }, [properties]);

  const propertyTypes = useMemo(
    () => Array.from(new Set(properties.map(p => p.type).filter(Boolean))).sort(),
    [properties],
  );

  const filtered = useMemo(
    () => applyListingFilters(properties, filters, facet),
    [properties, filters, facet],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(filters.page, totalPages);

  useEffect(() => {
    if (filters.page !== safePage) {
      setFilters({ page: safePage }, { resetPage: false, replace: true });
    }
  }, [filters.page, safePage, setFilters]);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const heading =
    facet?.label
    || meta?.title?.split('|')[0]?.trim()
    || 'Bất động sản Đà Nẵng';

  const isNamDaNang = facet?.slug === 'nam-da-nang' || facet?.marketZone === 'nam-da-nang';

  return (
    <>
      <SeoHead
        title={meta?.title || `${heading} | Estoria`}
        description={meta?.description || ''}
        path={categoryPath}
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
        ]}
      />
      <div className="mx-auto max-w-7xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold text-slate-950">{heading}</h1>
            <p className="mt-3 text-slate-600">{meta?.description}</p>

            <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <input
                type="search"
                value={filters.q}
                onChange={e => setFilters({ q: e.target.value }, { replace: true })}
                placeholder="Từ khóa (dự án, khu vực…)"
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm sm:col-span-2"
              />
              <select
                value={filters.type}
                onChange={e => setFilters({ type: e.target.value })}
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">Tất cả loại hình</option>
                {propertyTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={filters.transaction}
                onChange={e => setFilters({ transaction: e.target.value })}
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">Bán / Cho thuê</option>
                <option value="Bán">Bán</option>
                <option value="Cho thuê">Cho thuê</option>
              </select>
              <select
                value={filters.project}
                onChange={e => setFilters({ project: e.target.value })}
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">{isNamDaNang ? 'Tất cả dự án / khu vực' : 'Tất cả dự án'}</option>
                {projectOptions.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
              <select
                value={filters.price}
                onChange={e => setFilters({ price: e.target.value })}
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                {PRICE_RANGES.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select
                value={filters.area}
                onChange={e => setFilters({ area: e.target.value })}
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                {AREA_RANGES.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={filters.district}
                onChange={e => setFilters({ district: e.target.value }, { replace: true })}
                placeholder="Quận / khu vực"
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
              <button
                type="button"
                onClick={() => resetFilters()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-invest-blue/30"
              >
                Xóa bộ lọc
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              <Link
                to={buildListingPath()}
                className={`rounded-full border px-3 py-1 ${!facetSlug ? 'border-invest-blue bg-invest-blue text-white' : 'border-slate-200 text-slate-600 hover:border-invest-blue/40'}`}
              >
                Tất cả
              </Link>
              {(['can-ho', 'dat-nen', 'shophouse', 'nam-da-nang', 'mai-dang-chon', 'fpt-city', 'sun-symphony'] as const).map(slug => {
                const def = getListingFacet(slug);
                if (!def) return null;
                return (
                  <Link
                    key={slug}
                    to={getListingCategoryPath(def)}
                    className={`rounded-full border px-3 py-1 ${facetSlug === slug ? 'border-invest-blue bg-invest-blue text-white' : 'border-slate-200 text-slate-600 hover:border-invest-blue/40'}`}
                  >
                    {def.label}
                  </Link>
                );
              })}
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-600">
              {filtered.length} sản phẩm phù hợp
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginated.map(property => (
                <Link
                  key={property.id}
                  to={`/${encodeURIComponent(getPublicPropertySlug(property))}`}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:shadow-lg"
                >
                  <img
                    src={getPropertyThumbnailUrl(property)}
                    alt={`${property.title} — ${property.location} — ${property.type}`}
                    width={800}
                    height={600}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="p-4">
                    {getPropertyProjectLabel(property) && (
                      <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">
                        {getPropertyProjectLabel(property)}
                      </p>
                    )}
                    <h2 className="line-clamp-2 font-bold text-slate-950">{property.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {property.location} · {getTransactionType(property)}
                    </p>
                    <p className="mt-2 font-bold text-invest-gold">{formatPrice(property.price)}</p>
                  </div>
                </Link>
              ))}
            </div>

            <PaginationBar
              className="mt-8"
              page={safePage}
              pageSize={pageSize}
              totalItems={filtered.length}
              onPageChange={page => setFilters({ page }, { resetPage: false })}
            />

            {filtered.length === 0 && (
              <p className="mt-8 text-slate-500">Chưa có sản phẩm phù hợp. Liên hệ để nhận danh sách riêng.</p>
            )}
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-80">
            <LeadCaptureForm source={categoryPath} submitLabel={PRIMARY_CTA} compact />
          </aside>
        </div>
      </div>
    </>
  );
}
