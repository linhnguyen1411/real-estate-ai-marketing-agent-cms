import { Link } from 'react-router-dom';
import { Building2, Phone } from 'lucide-react';
import { PublicAgentProfile } from '../../types';
import AgentTierBadge from './AgentTierBadge';

interface AgentPublicCardProps {
  agent: PublicAgentProfile;
  compact?: boolean;
  className?: string;
}

export default function AgentPublicCard({ agent, compact = false, className = '' }: AgentPublicCardProps) {
  const initials = agent.name.trim().charAt(0).toUpperCase() || 'A';

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

      <div className={`mt-4 grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {agent.phone && (
          <a
            href={`tel:${agent.phone.replace(/\s+/g, '')}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-invest-gold-muted px-3 py-2 text-sm font-semibold text-invest-blue transition hover:bg-invest-gold-muted/80"
          >
            <Phone className="h-4 w-4" />
            {agent.phone}
          </a>
        )}
        <Link
          to={agent.profile_url}
          className={`inline-flex items-center justify-center rounded-lg bg-invest-blue px-3 py-2 text-sm font-bold text-white transition hover:bg-invest-blue/90 ${compact ? '' : 'sm:col-span-2'}`}
        >
          Xem hồ sơ môi giới
        </Link>
      </div>
    </div>
  );
}
