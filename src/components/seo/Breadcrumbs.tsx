import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { BreadcrumbItem } from '../../seo/schemas';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-1 text-slate-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.path} className="inline-flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />}
              {isLast ? (
                <span className="font-semibold text-slate-800" aria-current="page">
                  {index === 0 ? <Home className="inline h-3.5 w-3.5" aria-label={item.name} /> : item.name}
                  {index === 0 && <span className="sr-only">{item.name}</span>}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="font-medium text-invest-blue hover:text-invest-blue-light hover:underline"
                >
                  {index === 0 ? <Home className="h-3.5 w-3.5" aria-label={item.name} /> : item.name}
                  {index === 0 && <span className="sr-only">{item.name}</span>}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
