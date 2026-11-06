export function getRoleLabel(role: string): string {
  if (role === 'owner') return 'Owner';
  if (role === 'company') return 'Company Admin';
  if (role === 'member') return 'Member';
  return role;
}

export function getRoleBadgeClass(role: string): string {
  if (role === 'owner') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  if (role === 'company') return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  return 'border-slate-700 bg-slate-800/60 text-slate-300';
}
