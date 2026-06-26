import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import ContentPageHero from '../components/layout/ContentPageHero';
import BlogPostCard from '../components/blog/BlogPostCard';
import { fetchPublicBlogCategories, fetchPublicBlogPosts } from '../services/blogApi';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';
import type { BlogArticle, BlogCategory } from '../types';

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogArticle[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const path = '/tin-tuc';
  const origin = getSiteOrigin();
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức & phân tích', path },
  ];

  useEffect(() => {
    Promise.all([fetchPublicBlogPosts(), fetchPublicBlogCategories()])
      .then(([postData, catData]) => {
        setPosts(postData);
        setCategories(catData);
      })
      .catch(() => {
        setPosts([]);
        setCategories([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredPosts = useMemo(() => {
    if (activeCategory === 'all') return posts;
    return posts.filter(post => post.category?.slug === activeCategory);
  }, [posts, activeCategory]);

  const [featured, ...rest] = filteredPosts;

  return (
    <>
      <SeoHead
        title="Tin Tức & Phân Tích BĐS Đà Nẵng 2026 | Estoria"
        description="Nội dung biên tập bởi Estoria. Phân tích đầu tư, review khu vực và kiến thức BĐS Đà Nẵng."
        path={path}
        keywords={['tin bđs đà nẵng', 'phân tích bđs đà nẵng', 'đầu tư nam đà nẵng']}
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
        ]}
      />

      <ContentPageHero
        breadcrumbs={breadcrumbs}
        title="Tin tức & phân tích BĐS Đà Nẵng"
        description="Bài viết từ CMS Estoria — Sun Group, Nam Đà Nẵng, BĐS nổi bật. Menu chuyên mục tự sinh từ bài published."
      />

      <div className="mx-auto max-w-6xl px-4 py-10">
        {categories.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeCategory === 'all'
                  ? 'bg-invest-blue text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-invest-blue/30'
              }`}
            >
              Tất cả ({posts.length})
            </button>
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/tin-tuc/chuyen-muc/${cat.slug}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeCategory === cat.slug
                    ? 'bg-invest-blue text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-invest-blue/30'
                }`}
                onClick={e => {
                  e.preventDefault();
                  setActiveCategory(cat.slug);
                }}
              >
                {cat.name} ({cat.postCount ?? 0})
              </Link>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="text-slate-600">Chưa có bài published. Tạo bài qua Admin → Nội dung SEO.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {featured && <BlogPostCard post={featured} variant="featured" />}
            {rest.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map(post => (
                  <BlogPostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
