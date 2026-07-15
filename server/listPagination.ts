/**
 * Shared list pagination / filter helpers for in-memory CMS collections.
 * Used when `?page=` is present so legacy clients still get full arrays.
 */

export interface ListPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedList<T> {
  items: T[];
  pagination: ListPagination;
}

export function parseListQuery(query: Record<string, unknown>) {
  const rawPage = query.page;
  const hasPage = rawPage !== undefined && rawPage !== null && String(rawPage).trim() !== '';
  const page = hasPage ? Math.max(1, Number.parseInt(String(rawPage), 10) || 1) : 0;
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '50'), 10) || 50));
  const search = String(query.search ?? '').trim().toLowerCase();
  const status = String(query.status ?? '').trim();
  const sort = String(query.sort ?? '').trim();
  return { hasPage, page, limit, search, status, sort };
}

export function paginateItems<T>(items: T[], page: number, limit: number): PaginatedList<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    pagination: { page: safePage, limit, total, totalPages },
  };
}

export function matchesSearchText(haystack: string, search: string): boolean {
  if (!search) return true;
  return haystack.toLowerCase().includes(search);
}
