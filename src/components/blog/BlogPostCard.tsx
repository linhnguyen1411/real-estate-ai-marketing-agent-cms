import { Link } from 'react-router-dom';
import { ArrowRight, Calendar } from 'lucide-react';
import type { BlogArticle } from '../../types';

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=800&q=80&fm=webp';

interface BlogPostCardProps {
  post: BlogArticle;
  variant?: 'default' | 'featured' | 'compact';
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('vi-VN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function BlogPostCard({ post, variant = 'default' }: BlogPostCardProps) {
  const cover = post.coverImage || DEFAULT_COVER;
  const date = formatDate(post.publishedAt);
  const href = `/tin-tuc/${post.slug}`;

  if (variant === 'featured') {
    return (
      <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-invest-blue/30 hover:shadow-lg">
        <div className="grid md:grid-cols-2">
          <Link to={href} className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-slate-100 md:aspect-auto md:min-h-[280px]">
            <img
              src={cover}
              alt={post.title}
              className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent md:hidden" />
          </Link>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="rounded-full bg-invest-gold/20 px-2.5 py-1 text-invest-blue">Nổi bật</span>
              {post.category && (
                <Link
                  to={post.category.hubPath}
                  className="rounded-full bg-invest-blue-muted px-2.5 py-1 text-invest-blue hover:bg-invest-blue/10"
                >
                  {post.category.name}
                </Link>
              )}
              {date && (
                <span className="inline-flex items-center gap-1 normal-case">
                  <Calendar className="h-3.5 w-3.5" />
                  {date}
                </span>
              )}
            </div>
            <h2 className="mt-4 text-2xl font-extrabold leading-snug text-slate-950 sm:text-3xl">
              <Link to={href} className="hover:text-invest-blue">
                {post.title}
              </Link>
            </h2>
            <p className="mt-3 line-clamp-3 text-slate-600">{post.excerpt}</p>
            <Link
              to={href}
              className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-invest-blue hover:underline"
            >
              Đọc phân tích
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  if (variant === 'compact') {
    return (
      <article className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:border-invest-blue/30 hover:shadow-md">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {post.category && (
            <Link to={post.category.hubPath} className="font-semibold text-invest-blue hover:underline">
              {post.category.name}
            </Link>
          )}
          {date && <span>· {date}</span>}
        </div>
        <h3 className="mt-2 text-lg font-bold text-slate-950">
          <Link to={href} className="hover:text-invest-blue">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{post.excerpt}</p>
      </article>
    );
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-invest-blue/30 hover:shadow-md">
      <Link to={href} className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-slate-100">
        <img
          src={cover}
          alt={post.title}
          className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {post.category && (
            <Link
              to={post.category.hubPath}
              className="rounded-full bg-invest-gold-muted px-2.5 py-1 text-invest-blue hover:bg-invest-blue-muted"
            >
              {post.category.name}
            </Link>
          )}
          {date && (
            <time dateTime={post.publishedAt || undefined} className="normal-case">
              {date}
            </time>
          )}
        </div>
        <h2 className="mt-3 text-xl font-bold leading-snug text-slate-950">
          <Link to={href} className="hover:text-invest-blue">
            {post.title}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-600">{post.excerpt}</p>
        <Link
          to={href}
          className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-invest-blue hover:underline"
        >
          Đọc tiếp
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
