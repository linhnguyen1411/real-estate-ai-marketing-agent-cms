export function getRecordSortTime(record: { created_at?: string; id?: string }): number {
  const parsed = record.created_at ? new Date(record.created_at).getTime() : Number.NaN;
  if (!Number.isNaN(parsed)) return parsed;
  const match = String(record.id || '').match(/-(\d{10,})$/);
  return match ? Number(match[1]) : 0;
}

export function sortByCreatedAtDesc<T extends { created_at?: string; id?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => getRecordSortTime(b) - getRecordSortTime(a));
}
