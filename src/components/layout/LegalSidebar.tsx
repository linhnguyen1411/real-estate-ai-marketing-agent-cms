import { Link, useLocation } from 'react-router-dom';
import { FileText, Cookie, Scale, ShieldAlert } from 'lucide-react';
import { FOOTER_LEGAL } from '../../seo/routes';

const ICONS: Record<string, typeof FileText> = {
  '/chinh-sach-bao-mat': ShieldAlert,
  '/dieu-khoan-su-dung': Scale,
  '/chinh-sach-cookie': Cookie,
  '/mien-tru-trach-nhiem': FileText,
};

export default function LegalSidebar() {
  const { pathname } = useLocation();

  return (
    <nav
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6"
      aria-label="Trang pháp lý"
    >
      <p className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">Tài liệu pháp lý</p>
      <ul className="mt-3 space-y-1">
        {FOOTER_LEGAL.map(link => {
          const Icon = ICONS[link.href] || FileText;
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                to={link.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-invest-blue text-white shadow-sm'
                    : 'text-slate-700 hover:bg-invest-blue-muted hover:text-invest-blue'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
