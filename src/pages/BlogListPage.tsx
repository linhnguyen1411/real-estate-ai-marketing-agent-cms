import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import { fetchPublicBlogPosts } from '../services/blogApi';
import type { BlogArticle } from '../types';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const path = '/tin-tuc';
  const origin = getSiteOrigin();
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức & phân tích', path },
  ];

  useEffect(() => {
    fetchPublicBlogPosts()
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <SeoHead
        title="Tin Tức & Phân Tích BĐS Đà Nẵng 2026 | Estoria"
        description="Cập nhật phân tích đầu tư, review khu vực, tin thị trường và kiến thức BĐS Đà Nẵng dành cho nhà đầu tư trung và dài hạn."
        path={path}
        keywords={['tin bđs đà nẵng', 'phân tích bđs đà nẵng', 'đầu tư nam đà nẵng']}
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
        ]}
      />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <h1 className="text-3xl font-extrabold text-slate-950 sm:text-4xl">Tin tức & phân tích BĐS Đà Nẵng</h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-600">
          Bài viết chuyên sâu về đầu tư Nam Đà Nẵng, FPT City, Mai Đăng Chơn, căn hộ cho thuê và review khu vực — viết cho nhà đầu tư cần thẩm định trước khi xuống tiền.
        </p>

        {loading ? (
          <div className="mt-12 flex justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
          </div>
        ) : posts.length === 0 ? (
          <p className="mt-12 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
            Chưa có bài viết công khai. Chạy <code className="rounded bg-slate-200 px-1">npm run seed:seo-posts</code> để tạo nội dung.
          </p>
        ) : (
          <div className="mt-10 grid gap-6">
            {posts.map(post => (
              <article key={post.id} className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-invest-blue/30 hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {post.category && (
                    <Link to={post.category.hubPath} className="rounded-full bg-invest-gold-muted text-invest-blue hover:bg-invest-blue-muted">
                      {post.category.name}
                    </Link>
                  )}
                  {post.publishedAt && (
                    <time dateTime={post.publishedAt}>
                      {new Date(post.publishedAt).toLocaleDateString('vi-VN')}
                    </time>
                  )}
                </div>
                <h2 className="mt-3 text-2xl font-bold text-slate-950">
                  <Link to={`/tin-tuc/${post.slug}`} className="hover:text-invest-blue">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-3 text-slate-600">{post.excerpt}</p>
                <Link to={`/tin-tuc/${post.slug}`} className="mt-4 inline-block text-sm font-bold text-invest-blue hover:underline">
                  Đọc tiếp →
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
