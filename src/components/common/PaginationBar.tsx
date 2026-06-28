import { ChevronLeft, ChevronRight } from 'lucide-react';

export const DEFAULT_PAGE_SIZE = 10;

interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  variant?: 'light' | 'dark';
  className?: string;
}

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | '…')[] = [1];
  if (current > 3) items.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) {
    items.push(p);
  }
  if (current < total - 2) items.push('…');
  items.push(total);
  return items;
}

export default function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  variant = 'light',
  className = '',
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  const isDark = variant === 'dark';
  const btnBase = isDark
    ? 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white disabled:opacity-40'
    : 'border-slate-200 bg-white text-slate-700 hover:border-invest-gold/40 hover:bg-invest-gold-muted hover:text-invest-blue disabled:opacity-40';
  const activePage = isDark
    ? 'border-rose-500/70 bg-rose-600 text-white'
    : 'border-invest-blue bg-invest-blue text-white';

  if (totalItems === 0) return null;

  return (
    <div
      className={`flex flex-col items-center justify-between gap-3 sm:flex-row ${className}`}
      aria-label="Phân trang"
    >
      <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
        Hiển thị {from}–{to} / {totalItems} sản phẩm
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${btnBase}`}
        >
          <ChevronLeft className="h-4 w-4" />
          Trước
        </button>
        {pageNumbers(safePage, totalPages).map((item, idx) =>
          item === '…' ? (
            <span key={`ellipsis-${idx}`} className={`px-1 text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`min-w-[2.25rem] rounded-lg border px-2.5 py-2 text-xs font-bold transition ${
                item === safePage ? activePage : btnBase
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${btnBase}`}
        >
          Sau
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
