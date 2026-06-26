import { useEffect, useState } from 'react';
import { extractHeadings } from './slugifyHeading';

interface ArticleTableOfContentsProps {
  content: string;
  stickyCta?: React.ReactNode;
  mobileCollapsible?: boolean;
}

export default function ArticleTableOfContents({
  content,
  stickyCta,
  mobileCollapsible = true,
}: ArticleTableOfContentsProps) {
  const headings = extractHeadings(content);
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (headings.length < 2) return;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] }
    );
    headings.forEach(h => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [content, headings]);

  if (headings.length < 2) return stickyCta ? <div className="space-y-4">{stickyCta}</div> : null;

  const nav = (
    <ol className="mt-3 space-y-2 text-sm">
      {headings.map(item => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={() => mobileCollapsible && setOpen(false)}
            className={`block font-medium hover:underline ${activeId === item.id ? 'text-rose-600' : 'text-slate-600'}`}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="space-y-4">
      <nav
        aria-label="Mục lục bài viết"
        className="rounded-xl border border-slate-200 bg-slate-50 lg:sticky lg:top-24"
      >
        {mobileCollapsible ? (
          <>
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="flex w-full items-center justify-between p-4 text-left lg:hidden"
            >
              <span className="text-sm font-bold uppercase tracking-wide text-slate-500">Mục lục bài viết</span>
              <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
            </button>
            <div className="hidden p-5 lg:block">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Mục lục</h2>
              {nav}
            </div>
            {open && <div className="border-t border-slate-200 p-4 lg:hidden">{nav}</div>}
          </>
        ) : (
          <div className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Mục lục</h2>
            {nav}
          </div>
        )}
      </nav>
      {stickyCta}
    </div>
  );
}
