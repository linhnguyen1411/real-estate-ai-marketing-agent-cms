import React, { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Bot, Facebook, Home, Menu, MessageCircle, Phone, X } from 'lucide-react';
import { CONTACT, PRIMARY_CTA, SITE } from '../../seo/siteConfig';
import { FOOTER_LEGAL } from '../../seo/routes';
import PublicNav, { PublicNavMobile } from './PublicNav';
import { trackMessengerClick, trackPhoneClick, trackZaloClick } from '../../leadGen/analytics';

export default function PublicSiteLayout({ children }: { children?: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="public-shell min-h-screen">
      <header className="public-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white">
              <Home className="h-5 w-5" />
            </span>
            <span className="text-sm font-extrabold tracking-wide text-invest-text">{SITE.name}</span>
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center lg:flex">
            <PublicNav />
          </div>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <a
              href={`tel:${CONTACT.phoneTel}`}
              className="btn-outline px-3 py-2 text-xs"
            >
              {CONTACT.phoneDisplay}
            </a>
            <Link to="/lien-he" className="btn-cta px-3 py-2 text-xs">
              Nhận danh sách đầu tư
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(v => !v)}
            className="rounded-lg border border-invest-border p-2 text-invest-text lg:hidden"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-invest-border px-4 py-3 lg:hidden">
            <PublicNavMobile onItemClick={() => setMobileMenuOpen(false)} />
            <Link
              to="/lien-he"
              onClick={() => setMobileMenuOpen(false)}
              className="btn-cta mt-3 block w-full text-center text-sm"
            >
              {PRIMARY_CTA}
            </Link>
          </div>
        )}
      </header>

      <main>{children ?? <Outlet />}</main>

      <footer className="mt-16 border-t border-invest-border bg-invest-blue py-12 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-3">
          <div>
            <div className="text-sm font-extrabold text-white">{SITE.name}</div>
            <p className="mt-2 text-sm leading-6">{SITE.defaultDescription.slice(0, 120)}...</p>
            <p className="mt-3 text-sm">
              <strong className="text-white">{CONTACT.representative}</strong>
              <br />
              {CONTACT.title}
            </p>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-invest-gold">Liên hệ</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href={`tel:${CONTACT.phoneTel}`} className="hover:text-white">
                  Hotline: {CONTACT.phoneDisplay}
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT.email}`} className="hover:text-white">
                  {CONTACT.email}
                </a>
              </li>
              <li>
                <a href={CONTACT.facebook} target="_blank" rel="noreferrer" className="hover:text-white">
                  Facebook
                </a>
              </li>
              <li>
                <a href={CONTACT.zalo} target="_blank" rel="noreferrer" className="hover:text-white">
                  Zalo
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-invest-gold">Pháp lý</div>
            <ul className="mt-3 space-y-2 text-sm">
              {FOOTER_LEGAL.map(link => (
                <li key={link.href}>
                  <Link to={link.href} className="hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/gioi-thieu" className="hover:text-white">
                  Giới thiệu
                </Link>
              </li>
              <li>
                <Link to="/tac-gia/nguyen-phan-hoang-linh" className="hover:text-white">
                  Tác giả
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl border-t border-white/10 px-4 pt-6 text-center text-xs">
          © {new Date().getFullYear()} {SITE.brand}. Mọi quyền được bảo lưu.
        </div>
      </footer>

      <div
        className="pointer-events-none fixed right-3 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2.5 lg:hidden"
        style={{ paddingRight: 'env(safe-area-inset-right)' }}
      >
        <a
          href={`tel:${CONTACT.phoneTel}`}
          onClick={() => trackPhoneClick('layout_floating')}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-invest-success text-white shadow-lg ring-2 ring-white/80 active:scale-95"
          aria-label="Gọi điện"
        >
          <Phone className="h-5 w-5" />
        </a>
        <a
          href={CONTACT.zalo}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackZaloClick('layout_floating')}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-2 ring-white/80 active:scale-95"
          aria-label="Zalo"
        >
          <MessageCircle className="h-5 w-5" />
        </a>
        <a
          href={CONTACT.messenger}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackMessengerClick('layout_floating')}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg ring-2 ring-white/80 active:scale-95"
          aria-label="Messenger"
        >
          <Facebook className="h-5 w-5" />
        </a>
        <Link
          to="/lien-he"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-invest-cta text-white shadow-lg ring-2 ring-white/80 active:scale-95"
          aria-label="Nhận danh sách đầu tư"
        >
          <Bot className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
