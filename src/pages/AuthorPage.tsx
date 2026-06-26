import { Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadCaptureForm from '../components/LeadCaptureForm';
import { AUTHOR, CONTACT, PRIMARY_CTA } from '../seo/siteConfig';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildPersonSchema,
} from '../seo/schemas';
import { getPageMetaByPath } from '../seo/pageMeta';
import { getSiteOrigin } from '../seo/siteConfig';
import { SEO_LANDING_SLUGS } from '../seo/routes';

export default function AuthorPage() {
  const path = `/tac-gia/${AUTHOR.slug}`;
  const meta = getPageMetaByPath(path);
  const origin = getSiteOrigin();
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tác giả', path: '/kien-thuc-dau-tu' },
    { name: AUTHOR.name, path },
  ];

  return (
    <>
      <SeoHead
        title={meta?.title || AUTHOR.name}
        description={AUTHOR.bio}
        path={path}
        ogType="article"
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
          buildPersonSchema(origin),
          buildArticleSchema({
            title: `Hồ sơ ${AUTHOR.name}`,
            description: AUTHOR.bio,
            path,
            origin,
          }),
        ]}
      />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-invest-gold-muted text-2xl font-extrabold text-invest-blue">
            NL
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-950">{AUTHOR.name}</h1>
            <p className="mt-1 text-lg font-semibold text-invest-blue">{AUTHOR.title}</p>
            <p className="mt-4 leading-7 text-slate-700">{AUTHOR.bio}</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-slate-950">Chuyên môn</h2>
          <ul className="mt-4 list-inside list-disc space-y-1 text-slate-700">
            {AUTHOR.expertise.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-slate-950">Bài viết & hướng dẫn</h2>
          <ul className="mt-4 space-y-2">
            {SEO_LANDING_SLUGS.map(slug => (
              <li key={slug}>
                <Link to={`/${slug}`} className="text-invest-blue hover:underline">
                  {slug.replace(/-/g, ' ')}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="font-bold text-slate-950">Liên hệ tác giả</h2>
          <p className="mt-2 text-sm text-slate-600">
            Hotline:{' '}
            <a href={`tel:${CONTACT.phoneTel}`} className="text-invest-blue">
              {CONTACT.phoneDisplay}
            </a>
            {' · '}
            <a href={`mailto:${CONTACT.email}`} className="text-invest-blue">
              {CONTACT.email}
            </a>
          </p>
        </section>

        <div className="mt-10">
          <LeadCaptureForm source="author-page" submitLabel={PRIMARY_CTA} />
        </div>
      </div>
    </>
  );
}
