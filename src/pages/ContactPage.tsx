import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadCaptureForm from '../components/LeadCaptureForm';
import { CONTACT, PRIMARY_CTA, SITE } from '../seo/siteConfig';
import { buildBreadcrumbSchema, buildDefaultPageSchemas, buildLocalBusinessSchema } from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';

const breadcrumbs = [
  { name: 'Trang chủ', path: '/' },
  { name: 'Liên hệ', path: '/lien-he' },
];

export default function ContactPage() {
  const origin = getSiteOrigin();
  const schemas = [
    ...buildDefaultPageSchemas(breadcrumbs, origin),
    buildBreadcrumbSchema(breadcrumbs, origin),
    buildLocalBusinessSchema(origin),
  ];

  return (
    <>
      <SeoHead
        title="Liên Hệ Tư Vấn BĐS Đà Nẵng | Hotline & Zalo"
        description={`Liên hệ ${CONTACT.representative} — hotline ${CONTACT.phoneDisplay}, Zalo, Messenger. Tư vấn miễn phí BĐS Đà Nẵng.`}
        path="/lien-he"
        schemas={schemas}
      />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <h1 className="text-3xl font-extrabold text-slate-950">Liên hệ tư vấn</h1>
        <p className="mt-3 text-slate-600">
          {PRIMARY_CTA} — điền form hoặc gọi trực tiếp. Thời gian phản hồi: trong ngày làm việc.
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="font-bold text-slate-950">Thông tin liên hệ</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Người phụ trách</dt>
                  <dd className="font-semibold">{CONTACT.representative}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Hotline</dt>
                  <dd>
                    <a href={`tel:${CONTACT.phoneTel}`} className="font-bold text-invest-blue">
                      {CONTACT.phoneDisplay}
                    </a>
                    {' / '}
                    <a href="tel:+84984755258" className="font-bold text-invest-blue">
                      0984 755 258
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Email</dt>
                  <dd>
                    <a href={`mailto:${CONTACT.email}`} className="text-invest-blue">
                      {CONTACT.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Website</dt>
                  <dd>{SITE.brand}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Facebook</dt>
                  <dd>
                    <a href={CONTACT.facebook} target="_blank" rel="noreferrer" className="text-invest-blue">
                      facebook.com/estoria.dn
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Giờ làm việc</dt>
                  <dd>{CONTACT.workingHours}</dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <a href={CONTACT.zalo} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">
                  Chat Zalo
                </a>
                <a href={CONTACT.messenger} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white">
                  Messenger
                </a>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <iframe
                title="Bản đồ Đà Nẵng"
                src={CONTACT.mapEmbed}
                className="h-64 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
          <LeadCaptureForm source="contact-page" />
        </div>
      </div>
    </>
  );
}
