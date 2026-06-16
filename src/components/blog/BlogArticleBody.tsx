import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { slugifyHeading } from './slugifyHeading';

interface BlogArticleBodyProps {
  content: string;
}

export default function BlogArticleBody({ content }: BlogArticleBodyProps) {
  return (
    <div className="prose prose-slate max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h2: ({ children }) => {
            const text = String(children);
            const id = slugifyHeading(text);
            return (
              <h2 id={id} className="mb-3 mt-8 scroll-mt-24 text-2xl font-bold text-slate-950 first:mt-0">
                {children}
              </h2>
            );
          },
          h3: ({ children }) => (
            <h3 className="mb-2 mt-6 text-xl font-bold text-slate-900">{children}</h3>
          ),
          p: ({ children }) => <p className="my-4 leading-8 text-slate-700">{children}</p>,
          ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6 text-slate-700">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6 text-slate-700">{children}</ol>,
          strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
          a: ({ children, href }) => (
            <a
              href={href}
              className="font-semibold text-invest-blue underline hover:text-invest-blue-light"
              target={href?.startsWith('/') ? undefined : '_blank'}
              rel={href?.startsWith('/') ? undefined : 'noreferrer'}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
