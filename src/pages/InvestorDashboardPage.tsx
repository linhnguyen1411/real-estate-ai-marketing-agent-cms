import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Building2, FileText, MapPin, TrendingUp } from 'lucide-react';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getSiteOrigin, PRIMARY_CTA } from '../seo/siteConfig';
import { fetchPublicBlogPosts } from '../services/blogApi';
import type { BlogArticle } from '../types';

const breadcrumbs = [
  { name: 'Trang chủ', path: '/' },
  { name: 'Dữ liệu thị trường', path: '/nha-dau-tu' },
];

const TOP_AREAS = [
  { name: 'Nam Đà Nẵng', href: '/nam-da-nang', note: 'Đất nền, nhà phố ven sông' },
  { name: 'FPT City', href: '/du-an/fpt-city', note: 'Công nghệ & cho thuê' },
  { name: 'Sun Cosmo', href: '/du-an/sun-cosmo', note: 'Căn hộ cao cấp' },
  { name: 'Sun Symphony', href: '/du-an/sun-symphony', note: 'Phân khúc premium' },
];

const TOP_PROJECTS = [
  { name: 'FPT City', href: '/du-an/fpt-city' },
  { name: 'Sun Cosmo', href: '/du-an/sun-cosmo' },
  { name: 'Sun Symphony', href: '/du-an/sun-symphony' },
  { name: 'Mai Đăng Chơn', href: '/du-an/mai-dang-chon' },
];

export default function InvestorDashboardPage() {
  const origin = getSiteOrigin();
  const [posts, setPosts] = useState<BlogArticle[]>([]);

  useEffect(() => {
    fetchPublicBlogPosts()
      .then(data => setPosts(Array.isArray(data) ? data : []))
      .catch(() => setPosts([]));
  }, []);

  const analysisPosts = posts.filter(p => {
    const slug = p.category?.slug || '';
    return slug === 'phan-tich' || slug === 'review-khu-vuc';
  }).slice(0, 4);
  const displayPosts = analysisPosts.length > 0 ? analysisPosts : posts.slice(0, 4);

  const schemas = [
    ...buildDefaultPageSchemas(breadcrumbs, origin),
    buildBreadcrumbSchema(breadcrumbs, origin),
  ];

  return (
    <>
      <SeoHead
        title="Dữ Liệu Thị Trường BĐS Nam Đà Nẵng | Bảng Tin Đầu Tư 2026"
        description="Bảng tin dữ liệu đầu tư Nam Đà Nẵng: cơ hội nổi bật, khu vực, dự án và phân tích dành cho nhà đầu tư trung và dài hạn."
        path="/nha-dau-tu"
        schemas={schemas}
      />

      <div className="section-alt border-b border-invest-border">
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <Breadcrumbs items={breadcrumbs} className="mb-6" />
          <p className="label-section">Research dashboard</p>
          <h1 className="heading-page mt-2">Dữ liệu & cơ hội đầu tư Nam Đà Nẵng</h1>
          <p className="text-body-lg mt-4 max-w-2xl text-invest-muted">
            Tổng hợp khu vực, dự án và bài phân tích — dành cho nhà đầu tư cần dữ liệu trước khi ra quyết định.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/tai-lieu-dau-tu" className="btn-cta">
              {PRIMARY_CTA}
            </Link>
            <Link to="/bat-dong-san" className="btn-outline">
              Xem cơ hội đầu tư
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="invest-card p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-invest-gold" />
              <h2 className="text-lg font-extrabold text-invest-text">Top cơ hội đầu tư</h2>
            </div>
            <ul className="space-y-3">
              <li>
                <Link to="/bat-dong-san" className="flex items-center justify-between rounded-lg border border-invest-border p-3 text-sm font-semibold text-invest-blue hover:bg-invest-blue-muted">
                  Danh mục BĐS đang giao dịch
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
              <li>
                <Link to="/can-ho" className="flex items-center justify-between rounded-lg border border-invest-border p-3 text-sm font-semibold text-invest-blue hover:bg-invest-blue-muted">
                  Căn hộ cho thuê & đầu tư
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
              <li>
                <Link to="/dat-nen" className="flex items-center justify-between rounded-lg border border-invest-border p-3 text-sm font-semibold text-invest-blue hover:bg-invest-blue-muted">
                  Đất nền Nam Đà Nẵng
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
            </ul>
          </section>

          <section className="invest-card p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-invest-gold" />
              <h2 className="text-lg font-extrabold text-invest-text">Top khu vực nổi bật</h2>
            </div>
            <ul className="space-y-3">
              {TOP_AREAS.map(area => (
                <li key={area.name}>
                  <Link to={area.href} className="block rounded-lg border border-invest-border p-3 hover:bg-invest-blue-muted">
                    <div className="font-semibold text-invest-text">{area.name}</div>
                    <div className="mt-0.5 text-xs text-invest-muted">{area.note}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="invest-card p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-invest-gold" />
              <h2 className="text-lg font-extrabold text-invest-text">Top dự án</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TOP_PROJECTS.map(project => (
                <Link
                  key={project.name}
                  to={project.href}
                  className="rounded-lg border border-invest-border p-4 text-center text-sm font-bold text-invest-blue hover:bg-invest-gold-muted"
                >
                  {project.name}
                </Link>
              ))}
            </div>
            <Link to="/du-an" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-invest-cta">
              Xem tất cả dự án <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          <section className="invest-card p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-invest-gold" />
              <h2 className="text-lg font-extrabold text-invest-text">Top bài phân tích</h2>
            </div>
            {displayPosts.length === 0 ? (
              <p className="text-sm text-invest-muted">Đang tải bài phân tích...</p>
            ) : (
              <ul className="space-y-3">
                {displayPosts.map(post => (
                  <li key={post.slug}>
                    <Link to={`/tin-tuc/${post.slug}`} className="block rounded-lg border border-invest-border p-3 hover:bg-section-alt">
                      <div className="line-clamp-2 text-sm font-semibold text-invest-text">{post.title}</div>
                      <div className="mt-1 text-xs text-invest-muted">{post.category?.name || 'Phân tích'}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/phan-tich" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-invest-cta">
              Xem phân tích <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </div>

        <section className="mt-10 invest-card p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-invest-gold" />
                <h2 className="text-lg font-extrabold text-invest-text">Tài liệu đầu tư</h2>
              </div>
              <p className="mt-2 text-sm text-invest-muted">
                Báo cáo thị trường, checklist thẩm định và danh mục gợi ý — miễn phí sau khi để lại thông tin.
              </p>
            </div>
            <Link to="/tai-lieu-dau-tu" className="btn-cta shrink-0">
              Nhận báo cáo thị trường
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
