import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, MapPin } from 'lucide-react';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import AgentTierBadge from '../components/agent/AgentTierBadge';
import { fetchPublicAgentBySlug } from '../services/agentApi';
import { getPublicPropertySlug } from '../utils/propertyShare';
import type { Property } from '../types';

function formatPrice(price: number) {
  return `${price} tỷ`;
}

export default function AgentProfilePage() {
  const { agentSlug = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<Awaited<ReturnType<typeof fetchPublicAgentBySlug>>>(null);

  useEffect(() => {
    fetchPublicAgentBySlug(agentSlug).then(data => {
      setAgent(data);
      setLoading(false);
    });
  }, [agentSlug]);

  const path = `/moi-gioi/${agentSlug}`;
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Môi giới', path: '/moi-gioi' },
    { name: agent?.name || 'Agent', path },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-950">Không tìm thấy hồ sơ môi giới</h1>
        <Link to="/" className="mt-4 inline-block text-invest-blue hover:underline">Về trang chủ</Link>
      </div>
    );
  }

  const properties = (agent.properties || []) as Property[];
  const initials = agent.name.trim().charAt(0).toUpperCase() || 'A';

  return (
    <>
      <SeoHead
        title={`${agent.name} | Môi giới BĐS Estoria`}
        description={agent.bio || `Hồ sơ môi giới bất động sản ${agent.name} tại Estoria.`}
        path={path}
        ogType="profile"
        ogImage={agent.avatar_url}
      />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-invest-blue via-slate-900 to-invest-blue px-6 py-8 text-white sm:px-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
              {agent.avatar_url ? (
                <img
                  src={agent.avatar_url}
                  alt={agent.name}
                  className="h-28 w-28 rounded-full border-4 border-white/20 object-cover shadow-lg"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 text-4xl font-extrabold shadow-lg">
                  {initials}
                </div>
              )}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-extrabold">{agent.name}</h1>
                  <AgentTierBadge tier={agent.agent_tier} size="md" variant="light" />
                </div>
                {agent.company_name && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-white/80">
                    <Building2 className="h-4 w-4" />
                    {agent.company_name}
                  </p>
                )}
                <p className="mt-3 text-sm text-white/75">
                  {agent.property_count} tin bất động sản · Môi giới chuyên nghiệp Estoria
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_280px]">
            <div className="space-y-6">
              {agent.bio ? (
                <section>
                  <h2 className="text-lg font-bold text-slate-950">Giới thiệu</h2>
                  <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">{agent.bio}</p>
                </section>
              ) : null}

              <section>
                <h2 className="text-lg font-bold text-slate-950">Tin bất động sản đang quản lý</h2>
                {properties.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Chưa có tin công khai.</p>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {properties.map(property => (
                      <Link
                        key={property.id}
                        to={`/${encodeURIComponent(getPublicPropertySlug(property))}`}
                        className="overflow-hidden rounded-xl border border-slate-200 transition hover:border-invest-gold hover:shadow-md"
                      >
                        <img
                          src={property.gallery_images?.[0] || property.images}
                          alt={property.title}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <div className="p-4">
                          <div className="font-bold text-slate-950 line-clamp-2">{property.title}</div>
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="h-3.5 w-3.5" />
                            {property.location}
                          </p>
                          <div className="mt-2 text-sm font-extrabold text-invest-gold">{formatPrice(property.price)}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Liên hệ</h3>
                <div className="mt-3 space-y-2 text-sm">
                  {agent.phone ? (
                    <a href={`tel:${agent.phone.replace(/\s+/g, '')}`} className="block font-bold text-invest-blue hover:underline">
                      {agent.phone}
                    </a>
                  ) : (
                    <p className="text-slate-500">Liên hệ qua form bên dưới.</p>
                  )}
                </div>
              </div>
              <Link to="/lien-he" className="btn-cta block py-3 text-center text-sm">
                Đặt lịch tư vấn
              </Link>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
