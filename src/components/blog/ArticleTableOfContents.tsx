import { extractHeadings } from './slugifyHeading';

interface ArticleTableOfContentsProps {
  content: string;
}

export default function ArticleTableOfContents({ content }: ArticleTableOfContentsProps) {
  const headings = extractHeadings(content);
  if (headings.length < 2) return null;

  return (
    <nav aria-label="Mục lục bài viết" className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Mục lục</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {headings.map(item => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="font-medium text-rose-600 hover:underline">
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
