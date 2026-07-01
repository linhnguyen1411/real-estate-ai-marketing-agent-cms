export type AgentTier = 'legendary' | 'diamond' | 'gold' | 'silver' | 'bronze' | 'normal';

export interface AgentTierMeta {
  id: AgentTier;
  label: string;
  description: string;
  badgeClassDark: string;
  badgeClassLight: string;
  ringClass: string;
  icon: 'crown' | 'gem' | 'medal';
}

export const AGENT_TIER_ORDER: AgentTier[] = [
  'legendary',
  'diamond',
  'gold',
  'silver',
  'bronze',
  'normal',
];

export const AGENT_TIER_META: Record<AgentTier, AgentTierMeta> = {
  legendary: {
    id: 'legendary',
    label: 'Administrator',
    description: 'Bậc quản trị — dành cho chủ sở hữu',
    badgeClassDark: 'border-amber-400/50 bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-amber-600/20 text-amber-100',
    badgeClassLight: 'border-amber-500 bg-amber-50 text-amber-900',
    ringClass: 'ring-amber-400/60',
    icon: 'crown',
  },
  diamond: {
    id: 'diamond',
    label: 'Kim cương',
    description: 'Môi giới ưu tú hàng đầu',
    badgeClassDark: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100',
    badgeClassLight: 'border-cyan-500 bg-cyan-50 text-cyan-900',
    ringClass: 'ring-cyan-400/50',
    icon: 'gem',
  },
  gold: {
    id: 'gold',
    label: 'Vàng',
    description: 'Môi giới có thành tích tốt',
    badgeClassDark: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-100',
    badgeClassLight: 'border-yellow-600 bg-yellow-50 text-yellow-900',
    ringClass: 'ring-yellow-500/50',
    icon: 'medal',
  },
  silver: {
    id: 'silver',
    label: 'Bạc',
    description: 'Môi giới đang phát triển',
    badgeClassDark: 'border-slate-300/40 bg-slate-300/10 text-slate-100',
    badgeClassLight: 'border-slate-400 bg-slate-100 text-slate-800',
    ringClass: 'ring-slate-300/50',
    icon: 'medal',
  },
  bronze: {
    id: 'bronze',
    label: 'Đồng',
    description: 'Môi giới mới tham gia',
    badgeClassDark: 'border-orange-700/40 bg-orange-800/20 text-orange-100',
    badgeClassLight: 'border-orange-600 bg-orange-50 text-orange-900',
    ringClass: 'ring-orange-600/40',
    icon: 'medal',
  },
  normal: {
    id: 'normal',
    label: 'Tiêu chuẩn',
    description: 'Môi giới tiêu chuẩn',
    badgeClassDark: 'border-slate-600 bg-slate-800/80 text-slate-300',
    badgeClassLight: 'border-slate-300 bg-slate-50 text-slate-700',
    ringClass: 'ring-slate-600',
    icon: 'medal',
  },
};

export function resolveAgentTier(user: {
  role?: string;
  agent_tier?: AgentTier;
}): AgentTier {
  if (user.role === 'owner') return 'legendary';
  const tier = user.agent_tier || 'normal';
  if (tier === 'legendary') return 'normal';
  return tier;
}

export function slugifyAgentProfile(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
