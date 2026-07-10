import { Crown, Gem, Medal } from 'lucide-react';
import { AgentTier } from '../../types';
import { AGENT_TIER_META } from '../../utils/agentTier';

interface AgentTierBadgeProps {
  tier: AgentTier;
  size?: 'sm' | 'md';
  variant?: 'dark' | 'light';
  className?: string;
}

export default function AgentTierBadge({
  tier,
  size = 'sm',
  variant = 'dark',
  className = '',
}: AgentTierBadgeProps) {
  const meta = AGENT_TIER_META[tier];
  const Icon = meta.icon === 'crown' ? Crown : meta.icon === 'gem' ? Gem : Medal;
  const sizeClass = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-2xs';
  const badgeClass = variant === 'light' ? meta.badgeClassLight : meta.badgeClassDark;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold tracking-wide ${sizeClass} ${badgeClass} ${className}`}
      title={meta.description}
    >
      <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} />
      {meta.label}
    </span>
  );
}
