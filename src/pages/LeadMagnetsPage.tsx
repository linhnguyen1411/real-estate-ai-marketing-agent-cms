import { Link, useParams, useSearchParams } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import LeadMagnetGate, { useLeadMagnet } from '../components/leadGen/LeadMagnetGate';
import { LEAD_MAGNETS } from '../leadGen/leadMagnets';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';
import SocialProof from '../components/leadGen/SocialProof';

export function LeadMagnetsHubPage() {
  const origin = getSiteOrigin();
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tài liệu đầu tư', path: '/tai-lieu-dau-tu' },
  ];

  return (
    <>
      <SeoHead
        title="Tài Liệu Đầu Tư Nam Đà Nẵng | Báo Cáo & Khung Phân Tích"
        description="Tải báo cáo thị trường 2026 và bản đồ cơ hội đầu tư — miễn phí cho nhà đầu tư."
        path="/tai-lieu-dau-tu"
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
        ]}
      />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <h1 className="text-3xl font-extrabold text-slate-950">Trung tâm tài liệu đầu tư</h1>
        <p className="mt-3 text-lg text-slate-600">
          Nhận báo cáo và sổ tay đầu tư — đổi lấy thông tin liên hệ. Không spam.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {LEAD_MAGNETS.map(magnet => (
            <Link
              key={magnet.slug}
              to={`/tai-lieu-dau-tu/${magnet.slug}`}
              className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-rose-300 hover:shadow-lg"
            >
              <span className="text-3xl">{magnet.icon}</span>
              <h2 className="mt-3 font-bold text-slate-950">{magnet.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{magnet.subtitle}</p>
              <span className="mt-4 inline-block text-sm font-bold text-rose-600">{magnet.cta} →</span>
            </Link>
          ))}
        </div>
      </div>
      <SocialProof />
    </>
  );
}

export function LeadMagnetDetailPage() {
  const { magnetSlug } = useParams();
  const [searchParams] = useSearchParams();
  const magnet = useLeadMagnet(magnetSlug || '');
  const token = searchParams.get('token');
  const origin = getSiteOrigin();

  if (!magnet) {
    return (
      <div className="p-10 text-center">
        <p>Không tìm thấy tài liệu.</p>
        <Link to="/tai-lieu-dau-tu" className="text-rose-600">Quay lại</Link>
      </div>
    );
  }

  const path = `/tai-lieu-dau-tu/${magnet.slug}`;
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tài liệu đầu tư', path: '/tai-lieu-dau-tu' },
    { name: magnet.title.slice(0, 30), path },
  ];

  return (
    <>
      <SeoHead
        title={`${magnet.title} | Estoria`}
        description={magnet.description}
        path={path}
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
        ]}
      />
      <div className={`mx-auto px-4 py-10 ${magnet.slug === 'bao-cao-nam-da-nang-2026' || magnet.slug === 'top-20-co-hoi-dau-tu' ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <span className="text-3xl">{magnet.icon}</span>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-950 sm:text-3xl">{magnet.title}</h1>
        <p className="mt-2 text-rose-600 font-semibold">{magnet.subtitle}</p>
        <p className="mt-4 text-slate-600">{magnet.description}</p>
        <div className="mt-8">
          <LeadMagnetGate magnet={magnet} token={token} />
        </div>
      </div>
    </>
  );
}
