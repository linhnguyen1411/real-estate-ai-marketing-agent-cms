import { Link } from 'react-router-dom';
import { CONTACT, SITE, getFooterBrandLine } from '../../seo/siteConfig';
import { FOOTER_LEGAL } from '../../seo/routes';
import SiteLogo from './SiteLogo';

export default function PublicSiteFooter() {
  return (
    <footer className="mt-16 border-t border-invest-border bg-invest-blue py-12 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-3">
        <div>
          <SiteLogo
            linkTo={false}
            showName
            showTagline
            nameClassName="text-sm font-extrabold text-white"
            taglineClassName="mt-0.5 text-xs italic leading-snug text-invest-gold/90"
            imageClassName="h-8 w-auto max-w-[120px] object-contain"
          />
          <p className="mt-3 text-sm leading-6 text-slate-300">{SITE.taglineVi}</p>
          <p className="mt-2 text-sm leading-6">{SITE.defaultDescription}</p>
          <p className="mt-3 text-sm">
            <strong className="text-white">{CONTACT.representative}</strong>
            <br />
            {CONTACT.title}
          </p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-invest-gold">Liên hệ</div>
          <ul className="mt-3 space-y-3 text-sm">
            {CONTACT.hotlines.map(line => (
              <li key={line.tel}>
                <a href={`tel:${line.tel}`} className="block hover:text-white">
                  <span className="font-semibold text-white">Hotline: {line.display}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">({line.label})</span>
                </a>
              </li>
            ))}
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
        © {new Date().getFullYear()} {getFooterBrandLine()}. {SITE.brand}
      </div>
    </footer>
  );
}
