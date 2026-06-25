import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import ContentPageHero from '../components/layout/ContentPageHero';
import BlogPostCard from '../components/blog/BlogPostCard';
import { fetchPublicBlogPosts } from '../services/blogApi';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';
import type { BlogArticle } from '../types';

export default function BlogTagPage() {
  const { tagSlug } = useParams<{ tagSlug: string }>();
  const [posts, setPosts] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const origin = getSiteOrigin();
  const path = `/tag/${tagSlug}`;
  const title = tagSlug?.replace(/-/g, ' ') || 'Tag';
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức', path: '/tin-tuc' },
    { name: `#${title}`, path },
  ];

  useEffect(() => {
    if (!tagSlug) return;
    fetchPublicBlogPosts({ tag: tagSlug })
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [tagSlug]);

  return (
    <>
      <SeoHead
        title={`#${title} | Tin Tức BĐS`}
        description={`Bài viết gắn tag ${title} — Estoria`}
        path={path}
        schemas={[...buildDefaultPageSchemas(breadcrumbs, origin), buildBreadcrumbSchema(breadcrumbs, origin)]}
      />
      <ContentPageHero breadcrumbs={breadcrumbs} title={`Tag: ${title}`} description="Danh sách bài viết theo tag." />
      <div className="mx-auto max-w-6xl px-4 py-10">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="text-slate-600">Chưa có bài với tag này.</p>
            <Link to="/tin-tuc" className="mt-4 inline-block text-invest-blue hover:underline">Về tin tức</Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map(post => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
