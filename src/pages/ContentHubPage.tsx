import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import ContentPageHero from '../components/layout/ContentPageHero';
import BlogPostCard from '../components/blog/BlogPostCard';
import { CONTENT_HUB_CATEGORIES } from '../seo/contentHub';
import {
  PORTFOLIO_PILLARS,
  PORTFOLIO_SLUG_NAM_DA_NANG,
  PORTFOLIO_SLUG_NOI_BAT,
  getSunGroupProjects,
  PROJECTS,
} from '../seo/portfolioHub';
import { SEO_LANDING_SLUGS } from '../seo/routes';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getPageMetaByPath } from '../seo/pageMeta';
import { getSiteOrigin } from '../seo/siteConfig';
import { fetchPublicBlogPosts } from '../services/blogApi';
import type { BlogArticle } from '../types';
import { ArrowRight, Building2, MapPin, Package } from 'lucide-react';

interface ContentHubPageProps {
  hubPath: string;
  title?: string;
}

const HUB_CATEGORY_SLUGS: Record<string, string> = {
  '/kien-thuc-dau-tu': 'kien-thuc-dau-tu',
  '/tin-thi-truong': 'tin-thi-truong',
  '/phan-tich': 'phan-tich',
  '/review-khu-vuc': 'review-khu-vuc',
};

const PILLAR_ICONS = {
  'sun-group': Building2,
  'nam-da-nang': MapPin,
  'noi-bat': Package,
} as const;

export default function ContentHubPage({ hubPath, title }: ContentHubPageProps) {
  const path = hubPath.startsWith('/') ? hubPath : `/${hubPath}`;
  const meta = getPageMetaByPath(path);
  const category = CONTENT_HUB_CATEGORIES.find(c => c.path === path);
  const pageTitle = title || category?.title || meta?.title || 'Kiến thức BĐS';
  const description = category?.description || meta?.description || '';
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: pageTitle, path },
  ];
  const origin = getSiteOrigin();
  const categorySlug = HUB_CATEGORY_SLUGS[path];
  const [posts, setPosts] = useState<BlogArticle[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(Boolean(categorySlug));
  const isProjectsHub = path === '/du-an';
  const sunProjects = getSunGroupProjects();
  const namSegment = PROJECTS[PORTFOLIO_SLUG_NAM_DA_NANG];
  const noiBatSegment = PROJECTS[PORTFOLIO_SLUG_NOI_BAT];

  useEffect(() => {
    if (!categorySlug) return;
    fetchPublicBlogPosts({ category: categorySlug })
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoadingPosts(false));
  }, [categorySlug]);

  return (
    <>
      <SeoHead
        title={meta?.title || pageTitle}
        description={description}
        path={path}
        keywords={category?.keywords}
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
        ]}
      />

      <ContentPageHero breadcrumbs={breadcrumbs} title={pageTitle} description={description} />

      <div className="mx-auto max-w-6xl px-4 py-10">
        {isProjectsHub && (
          <>
            <section className="grid gap-5 lg:grid-cols-3">
              {PORTFOLIO_PILLARS.map(pillar => {
                const Icon = PILLAR_ICONS[pillar.id];
                return (
                  <Link
                    key={pillar.id}
                    to={pillar.href}
                    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-invest-blue/30 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-invest-blue-muted text-invest-blue">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-invest-blue">
                          {pillar.subtitle}
                        </p>
                        <h2 className="mt-1 text-xl font-bold text-slate-950 group-hover:text-invest-blue">
                          {pillar.title}
                        </h2>
                      </div>
                    </div>
                    <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-600">
                      {pillar.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {pillar.productTypes.slice(0, 4).map(item => (
                        <span
                          key={item}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                    <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-invest-blue">
                      Xem chi tiết
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
            </section>

            <section id="sun-group" className="mt-14 scroll-mt-24">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-invest-blue">
                    Thương hiệu chủ lực
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">Sun Group Đà Nẵng</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">
                    Căn hộ cao cấp ven sông Hàn, shophouse, nhà phố thương mại và đất nền trong
                    hệ sinh thái Sun Group tại Đà Nẵng.
                  </p>
                </div>
                <Link
                  to="/can-ho-cao-cap-da-nang"
                  className="text-sm font-semibold text-invest-blue hover:underline"
                >
                  Xem căn hộ Sun Group →
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {sunProjects.map(project => (
                  <Link
                    key={project.slug}
                    to={`/du-an/${project.slug}`}
                    className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-invest-blue/30 hover:shadow-md"
                  >
                    <h3 className="text-lg font-bold text-slate-950 group-hover:text-invest-blue">
                      {project.name}
                    </h3>
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {project.location}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{project.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {project.highlights.slice(0, 3).map(item => (
                        <span
                          key={item}
                          className="rounded-full bg-invest-blue-muted px-2.5 py-1 text-xs font-semibold text-invest-blue"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-14 grid gap-5 lg:grid-cols-2">
              {namSegment && (
                <Link
                  to="/du-an/bat-dong-san-nam-da-nang"
                  className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm transition hover:border-invest-blue/30 hover:shadow-md"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-invest-blue">
                    Mũi nhọn khu vực
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-slate-950 group-hover:text-invest-blue">
                    {namSegment.name}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{namSegment.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {namSegment.productTypes?.map(item => (
                      <span
                        key={item}
                        className="rounded-full bg-invest-blue-muted px-2.5 py-1 text-xs font-semibold text-invest-blue"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-invest-blue">
                    Khám phá Nam Đà Nẵng
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              )}
              {noiBatSegment && (
                <Link
                  to="/du-an/bat-dong-san-da-nang-noi-bat"
                  className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm transition hover:border-invest-blue/30 hover:shadow-md"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-invest-blue">
                    Cơ hội đầu tư
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-slate-950 group-hover:text-invest-blue">
                    {noiBatSegment.name}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{noiBatSegment.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {noiBatSegment.productTypes?.map(item => (
                      <span
                        key={item}
                        className="rounded-full bg-invest-blue-muted px-2.5 py-1 text-xs font-semibold text-invest-blue"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-invest-blue">
                    Xem BĐS nổi bật
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              )}
            </section>
          </>
        )}

        {categorySlug && (
          <section className="mt-2">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Bài viết trong chuyên mục</h2>
                <p className="mt-1 text-sm text-slate-500">{posts.length} bài phân tích & review</p>
              </div>
              <Link to="/tin-tuc" className="text-sm font-semibold text-invest-blue hover:underline">
                Xem tất cả tin tức →
              </Link>
            </div>

            {loadingPosts ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-600">
                Chưa có bài viết trong chuyên mục này.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map(post => (
                  <BlogPostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </section>
        )}

        {!isProjectsHub && !categorySlug && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <p className="text-slate-600">
              Nội dung chuyên mục đang được cập nhật. Trong lúc chờ, anh/chị có thể:
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link to="/bat-dong-san" className="rounded-lg bg-invest-cta px-4 py-2 text-sm font-bold text-white">
                Xem BĐS
              </Link>
              {SEO_LANDING_SLUGS.slice(0, 3).map(slug => (
                <Link
                  key={slug}
                  to={`/${slug}`}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-invest-blue/30"
                >
                  {slug.replace(/-/g, ' ')}
                </Link>
              ))}
            </div>
          </div>
        )}

        <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-slate-950">Chuyên mục liên quan</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CONTENT_HUB_CATEGORIES.filter(c => c.path !== path && !c.path.includes('#')).map(c => (
              <li key={c.slug}>
                <Link
                  to={c.path}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-invest-blue transition hover:border-invest-blue/20 hover:bg-invest-blue-muted"
                >
                  {c.title}
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
