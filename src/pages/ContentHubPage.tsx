import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import SeoHead from '../components/seo/SeoHead';

import Breadcrumbs from '../components/seo/Breadcrumbs';

import { CONTENT_HUB_CATEGORIES, PROJECTS } from '../seo/contentHub';

import { SEO_LANDING_SLUGS } from '../seo/routes';

import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';

import { getPageMetaByPath } from '../seo/pageMeta';

import { getSiteOrigin } from '../seo/siteConfig';

import { fetchPublicBlogPosts } from '../services/blogApi';

import type { BlogArticle } from '../types';



interface ContentHubPageProps {

  hubPath: string;

  title?: string;

}



const HUB_CATEGORY_SLUGS: Record<string, string> = {

  '/kien-thuc-dau-tu': 'kien-thuc-dau-tu',

  '/tin-thi-truong': 'tin-thi-truong',

  '/phan-tich': 'phan-tich',

  '/review-khu-vuc': 'review-khu-vuc',

};



export default function ContentHubPage({ hubPath, title }: ContentHubPageProps) {

  const path = hubPath.startsWith('/') ? hubPath : `/${hubPath}`;

  const meta = getPageMetaByPath(path);

  const category = CONTENT_HUB_CATEGORIES.find(c => c.path === path);

  const pageTitle = title || category?.title || meta?.title || 'Kiến thức BĐS';

  const description = category?.description || meta?.description || '';

  const breadcrumbs = [

    { name: 'Trang chủ', path: '/' },

    { name: pageTitle, path },

  ];

  const origin = getSiteOrigin();

  const categorySlug = HUB_CATEGORY_SLUGS[path];

  const [posts, setPosts] = useState<BlogArticle[]>([]);

  const [loadingPosts, setLoadingPosts] = useState(Boolean(categorySlug));



  const isProjectsHub = path === '/du-an';



  useEffect(() => {

    if (!categorySlug) return;

    fetchPublicBlogPosts(categorySlug)

      .then(setPosts)

      .catch(() => setPosts([]))

      .finally(() => setLoadingPosts(false));

  }, [categorySlug]);



  return (

    <>

      <SeoHead

        title={meta?.title || pageTitle}

        description={description}

        path={path}

        keywords={category?.keywords}

        schemas={[

          ...buildDefaultPageSchemas(breadcrumbs, origin),

          buildBreadcrumbSchema(breadcrumbs, origin),

        ]}

      />

      <div className="mx-auto max-w-5xl px-4 py-10">

        <Breadcrumbs items={breadcrumbs} className="mb-6" />

        <h1 className="text-3xl font-extrabold text-slate-950">{pageTitle}</h1>

        <p className="mt-4 text-lg text-slate-600">{description}</p>



        {isProjectsHub && (

          <div className="mt-10 grid gap-4 sm:grid-cols-2">

            {Object.values(PROJECTS).map(project => (

              <Link

                key={project.slug}

                to={`/du-an/${project.slug}`}

                className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-invest-blue/30 hover:shadow-md"

              >

                <h2 className="text-xl font-bold text-slate-950">{project.name}</h2>

                <p className="mt-2 text-sm text-slate-600">{project.summary}</p>

              </Link>

            ))}

          </div>

        )}



        {categorySlug && (

          <div className="mt-10">

            <div className="mb-4 flex items-center justify-between gap-3">

              <h2 className="text-xl font-bold text-slate-950">Bài viết trong chuyên mục</h2>

              <Link to="/tin-tuc" className="text-sm font-semibold text-invest-blue hover:underline">

                Xem tất cả tin tức

              </Link>

            </div>

            {loadingPosts ? (

              <div className="flex justify-center py-10">

                <div className="h-8 w-8 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />

              </div>

            ) : posts.length === 0 ? (

              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">

                Chưa có bài viết trong chuyên mục này.

              </div>

            ) : (

              <div className="grid gap-4">

                {posts.map(post => (

                  <article key={post.id} className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-invest-blue/30">

                    <h3 className="text-lg font-bold text-slate-950">

                      <Link to={`/tin-tuc/${post.slug}`} className="hover:text-invest-blue">

                        {post.title}

                      </Link>

                    </h3>

                    <p className="mt-2 text-sm text-slate-600">{post.excerpt}</p>

                  </article>

                ))}

              </div>

            )}

          </div>

        )}



        {!isProjectsHub && !categorySlug && (

          <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">

            <p className="text-slate-600">

              Nội dung chuyên mục đang được cập nhật. Trong lúc chờ, anh/chị có thể:

            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-3">

              <Link to="/bat-dong-san" className="rounded-lg bg-invest-cta px-4 py-2 text-sm font-bold text-white">

                Xem BĐS

              </Link>

              {SEO_LANDING_SLUGS.slice(0, 3).map(slug => (

                <Link

                  key={slug}

                  to={`/${slug}`}

                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"

                >

                  {slug.replace(/-/g, ' ')}

                </Link>

              ))}

            </div>

          </div>

        )}



        <section className="mt-12">

          <h2 className="text-lg font-bold text-slate-950">Chuyên mục liên quan</h2>

          <ul className="mt-4 grid gap-2 sm:grid-cols-2">

            {CONTENT_HUB_CATEGORIES.filter(c => c.path !== path && !c.path.includes('#')).map(c => (

              <li key={c.slug}>

                <Link to={c.path} className="text-invest-blue hover:underline">

                  {c.title}

                </Link>

              </li>

            ))}

          </ul>

        </section>

      </div>

    </>

  );

}

