import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  className?: string;
  compact?: boolean;
}

export default function MarkdownContent({ content, className = '', compact = false }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => <h1 className={compact ? 'my-1 font-bold' : 'mb-3 mt-5 text-2xl font-extrabold first:mt-0'}>{children}</h1>,
          h2: ({ children }) => <h2 className={compact ? 'my-1 font-bold' : 'mb-2 mt-4 text-xl font-bold first:mt-0'}>{children}</h2>,
          h3: ({ children }) => <h3 className={compact ? 'my-1 font-bold' : 'mb-2 mt-3 text-lg font-bold first:mt-0'}>{children}</h3>,
          p: ({ children }) => <p className={compact ? 'my-1' : 'my-3 leading-8'}>{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-rose-500 bg-rose-500/5 px-4 py-2 italic">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          a: ({ children, href }) => (
            <a
              href={href}
              target={href?.startsWith('/') ? undefined : '_blank'}
              rel={href?.startsWith('/') ? undefined : 'noreferrer'}
              className="font-semibold text-rose-500 underline"
            >
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
