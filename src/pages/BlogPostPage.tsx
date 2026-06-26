import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Facebook, MessageCircle, Phone } from 'lucide-react';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import FaqSection from '../components/FaqSection';
import MultiStepInvestorForm from '../components/leadGen/MultiStepInvestorForm';
import ArticleTableOfContents from '../components/blog/ArticleTableOfContents';
import BlogArticleBody from '../components/blog/BlogArticleBody';
import BlogShareActions, { BlogShareButton } from '../components/blog/BlogShareActions';
import ReadingProgressBar from '../components/blog/ReadingProgressBar';
import { fetchPublicBlogPost, fetchPublicBlogPosts } from '../services/blogApi';
import type { BlogArticle } from '../types';
import { buildPostCta } from '../seo/buildPostCta';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
} from '../seo/schemas';
import { getSiteOrigin, CONTACT } from '../seo/siteConfig';
import { trackMessengerClick, trackPhoneClick, trackZaloClick } from '../leadGen/analytics';
import {
  getRelatedAreaLinksForSlug,
  getRelatedProjectLinksForSlug,
} from '../seo/internalLinkGraph';
import { resolveBlogShareImage } from '../seo/shareImage';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogArticle | null>(null);
  const [allPosts, setAllPosts] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formFocused, setFormFocused] = useState(false);
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

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      setFormFocused(Boolean(t?.closest('form, input, textarea, select')));
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', () => setTimeout(() => setFormFocused(false), 100));
    return () => document.removeEventListener('focusin', onFocusIn);
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
  const shareImage = resolveBlogShareImage({
    coverImage: post.coverImage,
    content: post.content,
    contentHtml: post.contentHtml,
    origin,
  });
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Tin tức', path: '/tin-tuc' },
    ...(post.category
      ? [{ name: post.category.name, path: `/tin-tuc/chuyen-muc/${post.category.slug}` }]
      : []),
    { name: post.title, path },
  ];
  const faqs = post.faqs || [];
  const cta = buildPostCta({
    title: post.title,
    primaryKeyword: post.primaryKeyword,
    tags: (post.tags || []).map(t => t.name),
    categoryName: post.category?.name,
    contentText: post.content || '',
  });

  const storedRelatedIds = post.relatedPostIds || [];
  const relatedPosts =
    storedRelatedIds.length > 0
      ? allPosts.filter(p => storedRelatedIds.includes(p.id) && p.slug !== post.slug)
      : allPosts.filter(p => p.slug !== post.slug).slice(0, 6);

  const relatedProjectLinks = getRelatedProjectLinksForSlug(post.slug);
  const relatedAreaLinks = getRelatedAreaLinksForSlug(post.slug);

  const stickyCta = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <h3 className="text-sm font-extrabold text-slate-950">{cta.title}</h3>
      <p className="mt-2 text-xs text-slate-500">{cta.description}</p>
      <a href="#lead-form" className="btn-cta mt-3 block w-full py-2.5 text-center text-xs">
        {cta.buttonText}
      </a>
    </div>
  );

  return (
    <>
      <ReadingProgressBar />
      <SeoHead
        title={post.metaTitle}
        description={post.metaDescription}
        path={path}
        image={shareImage}
        ogType="article"
        publishedTime={post.publishedAt || undefined}
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
          buildArticleSchema({
            title: post.title,
            description: post.metaDescription,
            path,
            publishedAt: post.publishedAt || undefined,
            updatedAt: post.updatedAt,
            image: shareImage,
            origin,
          }),
          ...(faqs.length ? [buildFaqSchema(faqs)] : []),
        ]}
      />
      <article className="mx-auto max-w-5xl px-4 py-10 pb-24 lg:pb-10">
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
          </div>
          <h1 className="heading-page mt-4">{post.title}</h1>
          <p className="text-body-lg mt-4 text-invest-muted">{post.excerpt}</p>
          <div className="mt-5 flex justify-center lg:justify-start">
            <BlogShareActions slug={post.slug} title={post.title} />
          </div>
        </header>

        {post.coverImage && (
          <figure className="mt-8 flex justify-center">
            <img
              src={post.coverImage}
              alt={post.title}
              className="blog-cover-image"
              loading="eager"
            />
          </figure>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <ArticleTableOfContents content={post.content || ''} stickyCta={stickyCta} />
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

        <section id="lead-form" className="section-alt mt-12 border-t border-invest-border py-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="label-section">Tư vấn theo nội dung bài</p>
              <h2 className="heading-section mt-2">{cta.title}</h2>
              <p className="text-body mt-4 max-w-xl text-invest-muted">{cta.description}</p>
              <Link
                to="/tai-lieu-dau-tu"
                className="mt-4 inline-block text-sm font-bold text-invest-cta hover:underline"
              >
                Xem tài liệu đầu tư →
              </Link>
              <div className="mt-8 grid gap-3 text-sm">
                <a
                  href={`tel:${CONTACT.phone}`}
                  onClick={() => trackPhoneClick('blog_post_cta')}
                  className="flex items-center gap-3 text-invest-text"
                >
                  <Phone className="h-5 w-5 text-invest-blue" />
                  {CONTACT.phoneDisplay}
                </a>
                <a
                  href={CONTACT.zalo}
                  onClick={() => trackZaloClick('blog_post_cta')}
                  className="flex items-center gap-3 text-invest-text"
                >
                  <MessageCircle className="h-5 w-5 text-blue-600" />
                  Zalo tư vấn nhanh
                </a>
                <a
                  href={CONTACT.facebook}
                  onClick={() => trackMessengerClick('blog_post_cta')}
                  className="flex items-center gap-3 text-invest-text"
                >
                  <Facebook className="h-5 w-5 text-sky-600" />
                  Facebook Messenger
                </a>
              </div>
            </div>
            <div className="min-w-0">
              <MultiStepInvestorForm
                source={`blog-${post.slug}-${cta.leadIntent}`}
                submitLabel={cta.buttonText}
              />
            </div>
          </div>
        </section>
      </article>

      {!formFocused && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-4px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto grid max-w-5xl grid-cols-4 gap-2 px-3 pt-2">
            <a
              href={`tel:${CONTACT.phone}`}
              onClick={() => trackPhoneClick('blog_mobile_bar')}
              className="flex min-h-[52px] flex-col items-center justify-center rounded-xl bg-slate-950 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white"
            >
              <Phone className="mb-0.5 h-4 w-4" />
              Gọi
            </a>
            <a
              href={CONTACT.zalo}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackZaloClick('blog_mobile_bar')}
              className="flex min-h-[52px] flex-col items-center justify-center rounded-xl bg-blue-600 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white"
            >
              <MessageCircle className="mb-0.5 h-4 w-4" />
              Zalo
            </a>
            <a
              href="#lead-form"
              className="flex min-h-[52px] flex-col items-center justify-center rounded-xl bg-invest-cta px-2 py-2 text-center text-[11px] font-bold leading-tight text-white"
            >
              Tư vấn
            </a>
            <BlogShareButton slug={post.slug} title={post.title} compact />
          </div>
        </div>
      )}
    </>
  );
}
