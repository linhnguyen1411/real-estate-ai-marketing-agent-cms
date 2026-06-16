import { Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadCaptureForm from '../components/LeadCaptureForm';
import { AUTHOR, CONTACT, PRIMARY_CTA, SITE } from '../seo/siteConfig';
import { buildArticleSchema, buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';

const breadcrumbs = [
  { name: 'Trang chủ', path: '/' },
  { name: 'Giới thiệu', path: '/gioi-thieu' },
];

export default function AboutPage() {
  const origin = getSiteOrigin();
  const schemas = [
    ...buildDefaultPageSchemas(breadcrumbs, origin),
    buildBreadcrumbSchema(breadcrumbs, origin),
    buildArticleSchema({
      title: 'Giới thiệu Estoria',
      description: SITE.defaultDescription,
      path: '/gioi-thieu',
      origin,
    }),
  ];

  return (
    <>
      <SeoHead
        title="Giới Thiệu Estoria | Trung Tâm Thông Tin & Đầu Tư Nam Đà Nẵng"
        description="Estoria cung cấp dữ liệu và phân tích bất động sản Đà Nẵng cho nhà đầu tư trung và dài hạn. Minh bạch pháp lý, dữ liệu thực tế."
        path="/gioi-thieu"
        ogType="article"
        schemas={schemas}
      />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <h1 className="text-3xl font-extrabold text-slate-950 sm:text-4xl">
          Giới thiệu {SITE.name}
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          {SITE.name} ({SITE.brand}) là trung tâm thông tin và tư vấn bất động sản tại Đà Nẵng, chuyên hỗ trợ
          nhà đầu tư trung và dài hạn tìm kiếm cơ hội tại Nam Đà Nẵng, FPT City, Sun Cosmo và các phân khúc
          tài sản cho thuê.
        </p>

        <section className="mt-10 space-y-4 text-slate-700 leading-7">
          <h2 className="text-xl font-bold text-slate-950">Sứ mệnh</h2>
          <p>
            Chúng tôi cung cấp thông tin minh bạch — giá thực, pháp lý rõ, hình ảnh thật — để khách hàng ra quyết định
            dựa trên dữ liệu, không dựa trên lời hứa lợi nhuận ảo.
          </p>
          <h2 className="text-xl font-bold text-slate-950">Đội ngũ</h2>
          <p>
            <Link to="/tac-gia/nguyen-phan-hoang-linh" className="font-semibold text-invest-blue hover:underline">
              {AUTHOR.name}
            </Link>
            {' '}— {AUTHOR.title}.
          </p>
          <h2 className="text-xl font-bold text-slate-950">Thông tin liên hệ</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Người đại diện: {CONTACT.representative}</li>
            <li>Hotline: <a href={`tel:${CONTACT.phoneTel}`} className="text-invest-blue">{CONTACT.phoneDisplay}</a></li>
            <li>Email: <a href={`mailto:${CONTACT.email}`} className="text-invest-blue">{CONTACT.email}</a></li>
            <li>Website: <a href={SITE.url} className="text-invest-blue">{SITE.brand}</a></li>
            <li>Facebook: <a href={CONTACT.facebook} className="text-invest-blue" target="_blank" rel="noreferrer">facebook.com/estoria.dn</a></li>
          </ul>
        </section>

        <div className="mt-12">
          <LeadCaptureForm source="about-page" submitLabel={PRIMARY_CTA} />
        </div>
      </div>
    </>
  );
}
