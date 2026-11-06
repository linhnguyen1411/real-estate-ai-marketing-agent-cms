import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { LogIn, Menu, UserPlus, X } from 'lucide-react';
import { PRIMARY_CTA } from '../../seo/siteConfig';
import PublicNav, { PublicNavMobile } from './PublicNav';
import SiteLogo from './SiteLogo';
import PublicSiteFooter from './PublicSiteFooter';
import FloatingContactRail from './FloatingContactRail';
import { captureShortLinkFromUrl } from '../../utils/shortLinkAttribution';

export default function PublicSiteLayout({ children }: { children?: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    captureShortLinkFromUrl();
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    document.body.classList.add('mobile-menu-open');
    return () => document.body.classList.remove('mobile-menu-open');
  }, [mobileMenuOpen]);

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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-invest-border text-invest-text lg:hidden"
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div
            data-mobile-menu="true"
            className="max-h-[calc(100dvh-4rem)] space-y-3 overflow-y-auto border-t border-invest-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
          >
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

      <FloatingContactRail
        hidden={mobileMenuOpen}
        trackingSource="layout_floating"
        ask={{ label: 'Nhận danh sách đầu tư', href: '/lien-he' }}
      />
    </div>
  );
}
