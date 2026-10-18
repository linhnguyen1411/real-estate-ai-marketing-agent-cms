import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Bot, Facebook, LogIn, Menu, MessageCircle, Phone, UserPlus, X } from 'lucide-react';
import { CONTACT, PRIMARY_CTA } from '../../seo/siteConfig';
import PublicNav, { PublicNavMobile } from './PublicNav';
import SiteLogo from './SiteLogo';
import PublicSiteFooter from './PublicSiteFooter';
import { trackMessengerClick, trackPhoneClick, trackZaloClick } from '../../leadGen/analytics';
import { captureShortLinkFromUrl } from '../../utils/shortLinkAttribution';

export default function PublicSiteLayout({ children }: { children?: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    captureShortLinkFromUrl();
  }, []);

  return (
    <div className="public-shell min-h-screen">
      <header className="public-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <SiteLogo />

          <div className="hidden min-w-0 flex-1 justify-center lg:flex">
            <PublicNav />
          </div>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <Link
              to="/dang-nhap"
              className="inline-flex items-center gap-1.5 rounded-lg border border-invest-border px-3 py-2 text-xs font-semibold text-invest-text hover:border-invest-blue hover:text-invest-blue transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              Đăng nhập
            </Link>
            <Link
              to="/dang-nhap?mode=register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-invest-blue px-3 py-2 text-xs font-semibold text-white hover:bg-invest-blue/90 transition-colors shadow-sm"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Đăng ký
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
          <div className="border-t border-invest-border px-4 py-3 lg:hidden space-y-3">
            <PublicNavMobile onItemClick={() => setMobileMenuOpen(false)} />
            <Link
              to="/lien-he"
              onClick={() => setMobileMenuOpen(false)}
              className="btn-cta block w-full text-center text-sm"
            >
              {PRIMARY_CTA}
            </Link>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-invest-border">
              <Link
                to="/dang-nhap"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-invest-border py-2 text-center text-xs font-semibold text-invest-text hover:bg-invest-blue-muted hover:text-invest-blue"
              >
                <LogIn className="h-3.5 w-3.5" />
                Đăng nhập
              </Link>
              <Link
                to="/dang-nhap?mode=register"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-invest-blue py-2 text-center text-xs font-semibold text-white hover:bg-invest-blue/90"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Đăng ký
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>{children ?? <Outlet />}</main>

      <PublicSiteFooter />

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
