import { Link } from 'react-router-dom';
import { Building2, Phone, MessageCircle } from 'lucide-react';
import { PublicAgentProfile } from '../../types';
import AgentTierBadge from './AgentTierBadge';

interface AgentPublicCardProps {
  agent: PublicAgentProfile;
  compact?: boolean;
  className?: string;
}

export default function AgentPublicCard({ agent, compact = false, className = '' }: AgentPublicCardProps) {
  const initials = agent.name.trim().charAt(0).toUpperCase() || 'A';
  const cleanPhone = agent.phone ? agent.phone.replace(/\D/g, '') : '';
  const formattedPhone = cleanPhone.length === 10
    ? `${cleanPhone.slice(0, 4)} ${cleanPhone.slice(4, 7)} ${cleanPhone.slice(7)}`
    : agent.phone || cleanPhone;
  const zaloUrl = cleanPhone ? `https://zalo.me/${cleanPhone}` : undefined;

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <div className="flex items-start gap-3">
        {agent.avatar_url ? (
          <img
            src={agent.avatar_url}
            alt={agent.name}
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-invest-gold/30"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-invest-gold-muted text-lg font-extrabold text-invest-blue ring-2 ring-invest-gold/20">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-slate-950">{agent.name}</h3>
            <AgentTierBadge tier={agent.agent_tier} variant="light" />
          </div>
          {agent.company_name && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Building2 className="h-3.5 w-3.5" />
              {agent.company_name}
            </p>
          )}
          {!compact && agent.bio && (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{agent.bio}</p>
          )}
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {agent.property_count} tin BĐS đang quản lý
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {cleanPhone && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${cleanPhone}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-invest-gold-muted px-2.5 py-2 text-xs sm:text-sm font-semibold text-invest-blue transition hover:bg-invest-gold-muted/80"
            >
              <Phone className="h-4 w-4 shrink-0 text-invest-gold" />
              <span className="truncate">{formattedPhone}</span>
            </a>
            {zaloUrl && (
              <a
                href={zaloUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-xs sm:text-sm font-bold text-white transition hover:bg-blue-700"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>Nhắn Zalo</span>
              </a>
            )}
          </div>
        )}
        <Link
          to={agent.profile_url}
          className="inline-flex items-center justify-center rounded-lg bg-invest-blue px-3 py-2 text-sm font-bold text-white transition hover:bg-invest-blue/90"
        >
          Xem hồ sơ môi giới
        </Link>
      </div>
    </div>
  );
}
