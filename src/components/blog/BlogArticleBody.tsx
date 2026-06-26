import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import type { Element } from 'hast';
import { slugifyHeading } from './slugifyHeading';

interface BlogArticleBodyProps {
  content: string;
}

function isImageOnlyParagraph(node: unknown): boolean {
  if (!node || typeof node !== 'object' || !('children' in node)) return false;
  const children = (node as { children?: unknown[] }).children || [];
  const elements = children.filter(
    child =>
      typeof child === 'object' &&
      child !== null &&
      'type' in child &&
      child.type === 'element',
  );
  const text = children.filter(
    child => typeof child === 'object' && child !== null && 'type' in child && child.type === 'text',
  ) as Array<{ value?: string }>;
  const hasText = text.some(item => (item.value || '').trim().length > 0);
  return !hasText && elements.length === 1 && (elements[0] as Element).tagName === 'img';
}

function isImageOnlyParagraphChildren(children: React.ReactNode): boolean {
  const items = React.Children.toArray(children).filter(child => {
    if (typeof child === 'string') return child.trim() !== '';
    return child != null;
  });
  if (items.length !== 1 || !React.isValidElement(items[0])) return false;
  const props = items[0].props as { src?: string };
  return Boolean(props.src);
}

function normalizeBlogImages(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\n\n![$1]($2)\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function BlogArticleBody({ content }: BlogArticleBodyProps) {
  const normalizedContent = normalizeBlogImages(content);
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
          p: ({ children, node }) => {
            if (isImageOnlyParagraph(node) || isImageOnlyParagraphChildren(children)) {
              return <div className="my-6 flex justify-center">{children}</div>;
            }
            return <p className="my-4 leading-8 text-slate-700">{children}</p>;
          },
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
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || ''}
              loading="lazy"
              className="blog-content-image"
            />
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
