import { Link, useParams } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadCaptureForm from '../components/LeadCaptureForm';
import FaqSection from '../components/FaqSection';
import { PROJECTS } from '../seo/contentHub';
import { getPageMetaByPath } from '../seo/pageMeta';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
} from '../seo/schemas';
import { PRIMARY_CTA, getSiteOrigin } from '../seo/siteConfig';
import { SEO_LANDING_SLUGS } from '../seo/routes';

export default function ProjectPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const project = projectSlug ? PROJECTS[projectSlug] : undefined;
  const path = `/du-an/${projectSlug}`;
  const meta = getPageMetaByPath(path);
  const origin = getSiteOrigin();

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Không tìm thấy dự án</h1>
        <Link to="/du-an" className="mt-4 inline-block text-rose-600">
          Xem tất cả dự án
        </Link>
      </div>
    );
  }

  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Dự án', path: '/du-an' },
    { name: project.name, path },
  ];

  const landingMap: Record<string, string> = {
    'fpt-city': 'dau-tu-fpt-city',
    'sun-cosmo': 'can-ho-dau-tu-da-nang',
    'sun-symphony': 'can-ho-dau-tu-da-nang',
    'mai-dang-chon': 'dat-nen-nam-da-nang',
  };
  const relatedLanding = landingMap[project.slug];

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
        <h1 className="text-3xl font-extrabold text-slate-950 sm:text-4xl">{project.name}</h1>
        <p className="mt-2 text-rose-600 font-semibold">{project.location}</p>
        <p className="mt-6 text-lg leading-8 text-slate-700">{project.summary}</p>

        <ul className="mt-8 flex flex-wrap gap-2">
          {project.highlights.map(h => (
            <li key={h} className="rounded-full bg-rose-50 px-4 py-1.5 text-sm font-semibold text-rose-700">
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <FaqSection faqs={project.faqs} title="FAQ về dự án" />
          <LeadCaptureForm source={`project-${project.slug}`} submitLabel={PRIMARY_CTA} />
        </div>

        {relatedLanding && SEO_LANDING_SLUGS.includes(relatedLanding as never) && (
          <p className="mt-10">
            <Link to={`/${relatedLanding}`} className="font-semibold text-rose-600 hover:underline">
              Đọc thêm phân tích đầu tư liên quan →
            </Link>
          </p>
        )}

        <p className="mt-6">
          <Link to="/bat-dong-san" className="text-rose-600 hover:underline">
            Xem BĐS đang mở bán →
          </Link>
        </p>
      </div>
    </>
  );
}
