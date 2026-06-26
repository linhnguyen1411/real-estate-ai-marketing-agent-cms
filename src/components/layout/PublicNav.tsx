import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { MAIN_NAV } from '../../seo/routes';

interface PublicNavProps {
  onItemClick?: () => void;
  className?: string;
}

const linkClass =
  'whitespace-nowrap text-invest-muted transition-colors hover:text-invest-blue';

const childLinkClass =
  'block rounded-lg px-3 py-2 text-invest-muted transition-colors hover:bg-invest-blue-muted hover:text-invest-blue';

const mobileLinkClass =
  'rounded-lg px-2 py-2 text-invest-text transition-colors hover:bg-invest-blue-muted hover:text-invest-blue';

export default function PublicNav({ onItemClick, className = '' }: PublicNavProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const handleClick = () => {
    setOpenDropdown(null);
    onItemClick?.();
  };

  return (
    <nav className={`relative flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold lg:gap-x-5 ${className}`}>
      {MAIN_NAV.map(item => {
        if (item.children?.length) {
          const isOpen = openDropdown === item.href;
          return (
            <div
              key={item.href}
              className={`relative ${isOpen ? 'z-50' : ''}`}
              onMouseEnter={() => setOpenDropdown(item.href)}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1 ${linkClass}`}
                aria-expanded={isOpen}
                aria-haspopup="true"
                onClick={() => setOpenDropdown(prev => (prev === item.href ? null : item.href))}
              >
                {item.label}
                <ChevronDown className={`h-4 w-4 opacity-70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="absolute left-0 top-full z-50 pt-2">
                  <div className="min-w-[220px] rounded-xl border border-invest-border bg-white p-2 shadow-lg">
                    {item.children.map(child => (
                      <Link key={child.href} to={child.href} onClick={handleClick} className={childLinkClass}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <Link key={item.href} to={item.href} onClick={handleClick} className={linkClass}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PublicNavMobile({ onItemClick }: PublicNavProps) {
  const handleClick = () => onItemClick?.();

  return (
    <div className="grid gap-1 text-sm font-semibold">
      {MAIN_NAV.map(item => (
        <div key={item.href}>
          <Link to={item.href} onClick={handleClick} className={`block ${mobileLinkClass}`}>
            {item.label}
          </Link>
          {item.children?.map(child => (
            <Link
              key={child.href}
              to={child.href}
              onClick={handleClick}
              className={`ml-3 block text-xs ${mobileLinkClass}`}
            >
              — {child.label}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
