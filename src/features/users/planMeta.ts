export const PLAN_META: Record<string, { label: string; badgeClass: string }> = {
  trial: { label: 'Premium Trial', badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  premium_trial: { label: 'Premium Trial', badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  pro: { label: 'Pro Agent', badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  enterprise: { label: 'Enterprise', badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  platform_root: { label: 'Root Team', badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
};

export function getPlanMeta(plan?: string | null) {
  return (
    PLAN_META[(plan || '').toLowerCase()] || {
      label: 'Chưa kích hoạt',
      badgeClass: 'border-slate-700 bg-slate-800/60 text-slate-400',
    }
  );
}
