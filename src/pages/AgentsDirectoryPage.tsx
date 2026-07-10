import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import AgentPublicCard from '../components/agent/AgentPublicCard';
import { fetchPublicAgents } from '../services/agentApi';
import { PublicAgentProfile } from '../types';

export default function AgentsDirectoryPage() {
  const [agents, setAgents] = useState<PublicAgentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicAgents().then(data => {
      setAgents(data);
      setLoading(false);
    });
  }, []);

  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Môi giới', path: '/moi-gioi' },
  ];

  return (
    <>
      <SeoHead
        title="Đội ngũ môi giới BĐS | Estoria"
        description="Danh sách môi giới bất động sản chuyên nghiệp của Estoria — hồ sơ, kinh nghiệm và tin đang quản lý."
        path="/moi-gioi"
      />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <h1 className="text-3xl font-extrabold text-slate-950">Đội ngũ môi giới</h1>
        <p className="mt-2 text-slate-600">Chuyên viên tư vấn bất động sản Estoria — minh bạch hồ sơ và thành tích.</p>

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
          </div>
        ) : agents.length === 0 ? (
          <p className="mt-8 text-slate-500">Chưa có hồ sơ môi giới công khai.</p>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {agents.map(agent => (
              <AgentPublicCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
