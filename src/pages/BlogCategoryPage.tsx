import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import ContentPageHero from '../components/layout/ContentPageHero';
import BlogPostCard from '../components/blog/BlogPostCard';
import { fetchPublicBlogCategories, fetchPublicBlogPosts } from '../services/blogApi';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';
import type { BlogArticle, BlogCategory } from '../types';

export default function BlogCategoryPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const [posts, setPosts] = useState<BlogArticle[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const origin = getSiteOrigin();

  const category = useMemo(
    () => categories.find(c => c.slug === categorySlug),
    [categories, categorySlug]
  );

  useEffect(() => {
    if (!categorySlug) return;
    setLoading(true);
    Promise.all([fetchPublicBlogPosts({ category: categorySlug }), fetchPublicBlogCategories()])
      .then(([postData, catData]) => {
        setPosts(postData);
        setCategories(catData);
      })
      .catch(() => {
        setPosts([]);
        setCategories([]);
      })
      .finally(() => setLoading(false));
  }, [categorySlug]);

  const path = `/tin-tuc/chuyen-muc/${categorySlug}`;
  const title = category?.name || categorySlug || 'Chuyên mục';
  const description = category?.description || `Bài viết chuyên mục ${title} — Estoria`;
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức', path: '/tin-tuc' },
    { name: title, path },
  ];

  return (
    <>
      <SeoHead
        title={`${title} | Tin Tức BĐS Đà Nẵng`}
        description={description}
        path={path}
        schemas={[...buildDefaultPageSchemas(breadcrumbs, origin), buildBreadcrumbSchema(breadcrumbs, origin)]}
      />
      <ContentPageHero breadcrumbs={breadcrumbs} title={title} description={description} />

      <div className="mx-auto max-w-6xl px-4 py-10">
        {categories.length > 1 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <Link
              to="/tin-tuc"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-invest-blue/30"
            >
              Tất cả
            </Link>
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/tin-tuc/chuyen-muc/${cat.slug}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  cat.slug === categorySlug ? 'bg-invest-blue text-white' : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-slate-600">
            Chưa có bài published trong chuyên mục này.
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
