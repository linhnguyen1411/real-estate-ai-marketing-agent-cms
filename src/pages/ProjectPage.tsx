import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadCaptureForm from '../components/LeadCaptureForm';
import FaqSection from '../components/FaqSection';
import PaginationBar from '../components/common/PaginationBar';
import {
  LEGACY_PROJECT_REDIRECTS,
  PROJECTS,
  isSunGroupPortfolioSlug,
} from '../seo/portfolioHub';
import {
  isNamDaNangPortfolioSlug,
  isNoiBatPortfolioSlug,
} from '../seo/portfolioPropertyMatch';
import { getPageMetaByPath } from '../seo/pageMeta';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
} from '../seo/schemas';
import { PRIMARY_CTA, getSiteOrigin } from '../seo/siteConfig';
import { SEO_LANDING_SLUGS } from '../seo/routes';
import { getPropertyProjectLabel } from '../seo/propertyCatalog';
import { useListingPageSize } from '../features/listings';
import { fetchPublicProperties } from '../services/propertyService';
import { getPublicPropertySlug } from '../utils/propertyShare';
import { getPropertyThumbnailUrl } from '../utils/propertyImage';
import type { Property } from '../types';

const HUB_LABEL = 'Danh mục BĐS';

function formatPrice(price: number) {
  return `${price} tỷ`;
}

export default function ProjectPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const legacyTarget = projectSlug ? LEGACY_PROJECT_REDIRECTS[projectSlug] : undefined;

  if (legacyTarget) {
    return <Navigate to={legacyTarget} replace />;
  }

  const project = projectSlug ? PROJECTS[projectSlug] : undefined;
  const path = `/du-an/${projectSlug}`;
  const meta = getPageMetaByPath(path);
  const origin = getSiteOrigin();
  const isSegment = project?.pillar === 'nam-da-nang' || project?.pillar === 'noi-bat';
  const isSunGroupHub = isSunGroupPortfolioSlug(projectSlug);
  const shouldLoadProperties =
    Boolean(projectSlug) &&
    (isSunGroupHub ||
      project?.pillar === 'sun-group' ||
      isNamDaNangPortfolioSlug(projectSlug) ||
      isNoiBatPortfolioSlug(projectSlug));

  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(shouldLoadProperties);
  const [page, setPage] = useState(1);
  const pageSize = useListingPageSize(3);

  useEffect(() => {
    if (!shouldLoadProperties || !projectSlug) {
      setProperties([]);
      setLoadingProperties(false);
      return;
    }
    let cancelled = false;
    setLoadingProperties(true);
    fetchPublicProperties({ portfolioSlug: projectSlug })
      .then(list => {
        if (!cancelled) {
          setProperties(list);
          setPage(1);
        }
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProperties(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectSlug, shouldLoadProperties]);

  const totalPages = Math.max(1, Math.ceil(properties.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedProperties = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return properties.slice(start, start + pageSize);
  }, [properties, safePage, pageSize]);

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Không tìm thấy nội dung</h1>
        <Link to="/du-an" className="mt-4 inline-block text-invest-blue hover:underline">
          Về danh mục BĐS
        </Link>
      </div>
    );
  }

  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: HUB_LABEL, path: '/du-an' },
    { name: project.name, path },
  ];

  const landingMap: Record<string, string> = {
    'du-an-sun-group-da-nang': 'can-ho-dau-tu-da-nang',
    'sun-cosmo': 'can-ho-dau-tu-da-nang',
    'sun-symphony': 'can-ho-dau-tu-da-nang',
    'sun-ponte': 'can-ho-dau-tu-da-nang',
    'bat-dong-san-nam-da-nang': 'dau-tu-nam-da-nang',
    'bat-dong-san-da-nang-noi-bat': 'dau-tu-da-nang',
  };
  const relatedLanding = landingMap[project.slug];
  const ctaHref = project.ctaHref || '/bat-dong-san';

  return (
    <>
      <SeoHead
        title={meta?.title || project.name}
        description={meta?.description || project.summary}
        path={path}
        ogType="article"
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
          buildArticleSchema({ title: project.name, description: project.summary, path, origin }),
          buildFaqSchema(project.faqs),
        ]}
      />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <p className="text-xs font-bold uppercase tracking-wide text-invest-blue">
          {isSegment ? 'Phân khúc' : 'Sun Group Đà Nẵng'}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950 sm:text-4xl">{project.name}</h1>
        <p className="mt-2 font-semibold text-invest-blue">{project.location}</p>
        <p className="mt-6 text-lg leading-8 text-slate-700">{project.summary}</p>

        {project.productTypes && project.productTypes.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-500">Loại hình</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {project.productTypes.map(item => (
                <li
                  key={item}
                  className="rounded-full bg-invest-blue-muted px-4 py-1.5 text-sm font-semibold text-invest-blue"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="mt-6 flex flex-wrap gap-2">
          {project.highlights.map(h => (
            <li key={h} className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-700">
              {h}
            </li>
          ))}
        </ul>

        {shouldLoadProperties && (
          <section className="mt-12">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-invest-blue">
                  Quỹ hàng đang mở
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  {isSunGroupHub ? 'BĐS Sun Group Đà Nẵng' : `BĐS ${project.name}`}
                </h2>
              </div>
              <Link to={ctaHref} className="text-sm font-semibold text-invest-blue hover:underline">
                Xem toàn bộ danh mục →
              </Link>
            </div>

            {loadingProperties ? (
              <p className="text-sm text-slate-500">Đang tải danh sách BĐS…</p>
            ) : properties.length === 0 ? (
              <p className="text-sm text-slate-500">
                Chưa có sản phẩm phù hợp trong quỹ hàng công khai. Liên hệ để nhận danh sách riêng.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedProperties.map(property => (
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
                        <h3 className="line-clamp-2 font-bold text-slate-950">{property.title}</h3>
                        <p className="mt-1 text-sm text-slate-500">{property.location}</p>
                        <p className="mt-2 font-bold text-invest-gold">{formatPrice(property.price)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
                <PaginationBar
                  className="mt-8"
                  page={safePage}
                  pageSize={pageSize}
                  totalItems={properties.length}
                  onPageChange={setPage}
                />
              </>
            )}
          </section>
        )}

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <FaqSection
            faqs={project.faqs}
            title={isSegment ? 'Câu hỏi thường gặp' : 'FAQ về dự án'}
          />
          <LeadCaptureForm source={`project-${project.slug}`} submitLabel={PRIMARY_CTA} />
        </div>

        {relatedLanding && SEO_LANDING_SLUGS.includes(relatedLanding as never) && (
          <p className="mt-10">
            <Link to={`/${relatedLanding}`} className="font-semibold text-invest-blue hover:underline">
              Đọc thêm phân tích liên quan →
            </Link>
          </p>
        )}

        <p className="mt-6">
          <Link to={ctaHref} className="font-semibold text-invest-blue hover:underline">
            {isSegment ? 'Xem danh sách BĐS đang mở →' : 'Xem BĐS đang mở bán →'}
          </Link>
        </p>
      </div>
    </>
  );
}
