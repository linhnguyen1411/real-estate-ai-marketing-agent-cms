import { useLocation, Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadCaptureForm from '../components/LeadCaptureForm';
import FaqSection from '../components/FaqSection';
import { getLandingPage } from '../seo/landingPages';
import { getPageMetaByPath } from '../seo/pageMeta';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
} from '../seo/schemas';
import { AUTHOR, PRIMARY_CTA, getSiteOrigin } from '../seo/siteConfig';

export default function LandingPageView() {
  const { pathname } = useLocation();
  const landingSlug = pathname.replace(/^\//, '');
  const data = landingSlug ? getLandingPage(landingSlug) : undefined;
  const path = pathname;
  const meta = getPageMetaByPath(path);
  const origin = getSiteOrigin();

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Không tìm thấy trang</h1>
        <Link to="/" className="mt-4 inline-block text-invest-blue">
          Về trang chủ
        </Link>
      </div>
    );
  }

  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: data.breadcrumbLabel ?? data.h1, path },
  ];

  const schemas = [
    ...buildDefaultPageSchemas(breadcrumbs, origin),
    buildBreadcrumbSchema(breadcrumbs, origin),
    buildArticleSchema({
      title: data.h1,
      description: data.heroSubtitle,
      path,
      origin,
    }),
    buildFaqSchema(data.faqs),
  ];

  return (
    <>
      <SeoHead
        title={meta?.title || data.h1}
        description={meta?.description || data.heroSubtitle}
        path={path}
        ogType="article"
        schemas={schemas}
      />

      <div className="section-alt border-b border-invest-border">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
          <Breadcrumbs items={breadcrumbs} className="mb-6" />
          <p className="label-section">Cẩm nang đầu tư thực chiến</p>
          <h1 className="heading-page mt-3">{data.h1}</h1>
          <p className="text-body-lg mt-5 max-w-2xl text-invest-muted">{data.heroSubtitle}</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.marketPoints.map(point => (
              <div key={point.label} className="invest-card p-4">
                <div className="text-xs text-invest-muted">{point.label}</div>
                <div className="mt-1 font-bold text-invest-text">{point.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="text-body-lg">
            {data.sections.map(section => (
              <section key={section.id} id={section.id} className="mb-10">
                <h2 className="heading-section">{section.title}</h2>
                <div className="mt-4 space-y-4 text-invest-muted">
                  {section.content.map((para, i) => (
                    <p key={i}>{para.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                  ))}
                </div>
              </section>
            ))}

            <section className="mt-12">
              <h2 className="heading-section">Lợi ích khi làm việc với Estoria</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {data.benefits.map(b => (
                  <div key={b.title} className="invest-card p-5">
                    <h3 className="font-bold text-slate-950">{b.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{b.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <FaqSection faqs={data.faqs} />

            <p className="mt-8 text-sm text-slate-500">
              Tác giả:{' '}
              <Link to="/tac-gia/nguyen-phan-hoang-linh" className="text-invest-blue hover:underline">
                {AUTHOR.name}
              </Link>
            </p>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <LeadCaptureForm source={`landing-${data.slug}`} submitLabel={PRIMARY_CTA} />
          </aside>
        </div>
      </div>
    </>
  );
}
