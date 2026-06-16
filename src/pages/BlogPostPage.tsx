import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import FaqSection from '../components/FaqSection';
import LeadCaptureForm from '../components/LeadCaptureForm';
import ArticleTableOfContents from '../components/blog/ArticleTableOfContents';
import BlogArticleBody from '../components/blog/BlogArticleBody';
import { fetchPublicBlogPost } from '../services/blogApi';
import { fetchPublicBlogPosts } from '../services/blogApi';
import type { BlogArticle } from '../types';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
} from '../seo/schemas';
import { getSiteOrigin } from '../seo/siteConfig';
import {
  getClusterKeyFromSlug,
  getRelatedAreaLinksForSlug,
  getRelatedProjectLinksForSlug,
} from '../seo/internalLinkGraph';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogArticle | null>(null);
  const [allPosts, setAllPosts] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const origin = getSiteOrigin();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchPublicBlogPost(slug)
      .then(setPost)
      .catch(err => {
        setPost(null);
        setError(err instanceof Error ? err.message : 'Không tải được bài viết');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    fetchPublicBlogPosts()
      .then(setAllPosts)
      .catch(() => setAllPosts([]));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Không tìm thấy bài viết</h1>
        <p className="mt-2 text-slate-600">{error}</p>
        <Link to="/tin-tuc" className="mt-4 inline-block text-invest-blue hover:underline">
          Xem tất cả bài viết
        </Link>
      </div>
    );
  }

  const path = `/tin-tuc/${post.slug}`;
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức', path: '/tin-tuc' },
    ...(post.category ? [{ name: post.category.name, path: post.category.hubPath }] : []),
    { name: post.title, path },
  ];
  const faqs = post.faqs || [];
  const postCluster = getClusterKeyFromSlug(post.slug);
  const relatedPosts = allPosts
    .filter(item => item.slug !== post.slug)
    .map(item => {
      let score = 0;
      if (postCluster && getClusterKeyFromSlug(item.slug) === postCluster) score += 100;
      if (post.category?.id && item.category?.id === post.category.id) score += 40;
      const currentTags = new Set((post.tags || []).map(tag => tag.slug));
      const overlapTags = (item.tags || []).filter(tag => currentTags.has(tag.slug)).length;
      score += overlapTags * 10;
      if (
        (post.slug.includes('fpt-city') && item.slug.includes('fpt-city')) ||
        (post.slug.includes('mai-dang-chon') && item.slug.includes('mai-dang-chon')) ||
        (post.slug.includes('can-ho') && item.slug.includes('can-ho'))
      ) {
        score += 20;
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(entry => entry.item);
  const relatedProjectLinks = getRelatedProjectLinksForSlug(post.slug);
  const relatedAreaLinks = getRelatedAreaLinksForSlug(post.slug);

  return (
    <>
      <SeoHead
        title={post.metaTitle}
        description={post.metaDescription}
        path={path}
        image={post.coverImage || undefined}
        ogType="article"
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
          buildArticleSchema({
            title: post.title,
            description: post.metaDescription,
            path,
            publishedAt: post.publishedAt || undefined,
            updatedAt: post.updatedAt,
            image: post.coverImage || undefined,
            origin,
          }),
          ...(faqs.length ? [buildFaqSchema(faqs)] : []),
        ]}
      />
      <article className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={breadcrumbs} className="mb-6" />
        <header className="mx-auto max-w-3xl text-center lg:text-left">
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-invest-muted lg:justify-start">
            {post.category && (
              <Link to={post.category.hubPath} className="rounded-full bg-invest-gold-muted px-3 py-1 font-semibold text-invest-blue">
                {post.category.name}
              </Link>
            )}
            {post.author && <span>Tác giả: {post.author.name}</span>}
            {post.publishedAt && (
              <time dateTime={post.publishedAt}>
                Xuất bản: {new Date(post.publishedAt).toLocaleDateString('vi-VN')}
              </time>
            )}
            <time dateTime={post.updatedAt}>
              Cập nhật: {new Date(post.updatedAt).toLocaleDateString('vi-VN')}
            </time>
          </div>
          <h1 className="heading-page mt-4">{post.title}</h1>
          <p className="text-body-lg mt-4 text-invest-muted">{post.excerpt}</p>
        </header>

        {post.coverImage && (
          <img
            src={post.coverImage}
            alt={post.title}
            className="mt-8 aspect-[16/9] w-full rounded-xl object-cover"
            loading="eager"
          />
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <ArticleTableOfContents content={post.content || ''} />
          </aside>
          <div className="article-prose">
            {post.content && <BlogArticleBody content={post.content} />}
          </div>
        </div>

        {faqs.length > 0 && <FaqSection faqs={faqs} />}

        {(relatedPosts.length > 0 || relatedProjectLinks.length > 0 || relatedAreaLinks.length > 0) && (
          <section className="mt-12 space-y-8">
            {relatedPosts.length > 0 && (
              <div>
                <h2 className="heading-section">Đọc tiếp</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedPosts.map(item => (
                    <Link key={item.slug} to={`/tin-tuc/${item.slug}`} className="invest-card p-4 hover:border-invest-blue/40">
                      <h3 className="line-clamp-2 text-sm font-bold text-invest-text">{item.title}</h3>
                      <p className="mt-2 text-xs text-invest-muted">{item.category?.name || 'Phân tích thị trường'}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {relatedProjectLinks.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-invest-text">Dự án liên quan</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {relatedProjectLinks.map(link => (
                    <Link key={link.href} to={link.href} className="btn-outline text-xs">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {relatedAreaLinks.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-invest-text">Khu vực liên quan</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {relatedAreaLinks.map(link => (
                    <Link key={link.href} to={link.href} className="btn-outline text-xs">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mt-12 invest-card border-invest-gold/30 bg-invest-gold-muted/30 p-6 sm:p-8">
          <h2 className="heading-section">
            Bạn muốn nhận danh sách cơ hội đầu tư Nam Đà Nẵng đang được chọn lọc theo ngân sách?
          </h2>
          <p className="mt-3 text-slate-600">
            Điền thông tin để nhận báo cáo và danh mục phù hợp.
          </p>
          <div className="mt-6">
            <LeadCaptureForm
              source={`blog-${post.slug}`}
              defaultArea="Nam Đà Nẵng"
              submitLabel="Nhận danh sách cơ hội đầu tư"
            />
          </div>
        </section>
      </article>
    </>
  );
}
