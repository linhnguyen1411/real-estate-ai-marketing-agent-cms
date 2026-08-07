import React, { Suspense } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
  Outlet,
} from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ListingsPage from './ListingsPage.tsx';
import PublicSiteLayout from './components/layout/PublicSiteLayout.tsx';
import type { Property } from './types.ts';
import LeadGenProvider from './components/leadGen/LeadGenProvider.tsx';
import { isPropertySlugCandidate } from './seo/routes.ts';
import { captureShortLinkFromUrl } from './utils/shortLinkAttribution.ts';
import { HashListingsRedirect, LEGACY_LISTING_REDIRECTS, LISTING_CATALOG_ROOT, SEO_CATEGORY_PATHS } from './features/listings';
import './index.css';

const AboutPage = React.lazy(() => import('./pages/AboutPage.tsx'));
const ContactPage = React.lazy(() => import('./pages/ContactPage.tsx'));
const LegalPage = React.lazy(() => import('./pages/LegalPage.tsx'));
const LandingPageView = React.lazy(() => import('./pages/LandingPageView.tsx'));
const ProjectPage = React.lazy(() => import('./pages/ProjectPage.tsx'));
const ContentHubPage = React.lazy(() => import('./pages/ContentHubPage.tsx'));
const CategoryListingsPage = React.lazy(() => import('./pages/CategoryListingsPage.tsx'));
const AuthorPage = React.lazy(() => import('./pages/AuthorPage.tsx'));
const LeadMagnetsHubPage = React.lazy(() => import('./pages/LeadMagnetsPage.tsx').then(m => ({ default: m.LeadMagnetsHubPage })));
const LeadMagnetDetailPage = React.lazy(() => import('./pages/LeadMagnetsPage.tsx').then(m => ({ default: m.LeadMagnetDetailPage })));
const BlogListPage = React.lazy(() => import('./pages/BlogListPage.tsx'));
const BlogPostPage = React.lazy(() => import('./pages/BlogPostPage.tsx'));
const BlogCategoryPage = React.lazy(() => import('./pages/BlogCategoryPage.tsx'));
const BlogTagPage = React.lazy(() => import('./pages/BlogTagPage.tsx'));
const InvestorDashboardPage = React.lazy(() => import('./pages/InvestorDashboardPage.tsx'));
const AgentProfilePage = React.lazy(() => import('./pages/AgentProfilePage.tsx'));
const AgentsDirectoryPage = React.lazy(() => import('./pages/AgentsDirectoryPage.tsx'));
const AdminApp = React.lazy(() => import('./App.tsx'));

function AdminRoute() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AdminApp />
    </Suspense>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-invest-blue/20 border-t-invest-blue" />
    </div>
  );
}

import { getEffectiveProjectDisplayOrder } from './seo/propertyCatalog.ts';

type PublicPropertiesPayload = {
  properties: Property[];
  projectDisplayOrder: string[];
};

async function fetchPublicProperties(): Promise<PublicPropertiesPayload> {
  try {
    const response = await fetch('/api/public/properties');
    if (!response.ok) throw new Error('Failed to fetch properties');
    const json = await response.json();
    const properties = Array.isArray(json.data) ? json.data : [];
    const projectDisplayOrder = getEffectiveProjectDisplayOrder({
      project_display_order: Array.isArray(json.meta?.projectDisplayOrder)
        ? json.meta.projectDisplayOrder
        : undefined,
    });
    return { properties, projectDisplayOrder };
  } catch (error) {
    console.error('Error fetching properties:', error);
    return { properties: [], projectDisplayOrder: getEffectiveProjectDisplayOrder() };
  }
}

let cachedPublicProperties: PublicPropertiesPayload | null = null;
let publicPropertiesPromise: Promise<PublicPropertiesPayload> | null = null;

function loadPublicProperties(): Promise<PublicPropertiesPayload> {
  if (cachedPublicProperties) return Promise.resolve(cachedPublicProperties);
  if (!publicPropertiesPromise) {
    publicPropertiesPromise = fetchPublicProperties().then(data => {
      cachedPublicProperties = data;
      return data;
    });
  }
  return publicPropertiesPromise;
}

function PublicListingsShell() {
  const { propertySlug } = useParams();
  const [properties, setProperties] = React.useState<Property[]>(cachedPublicProperties?.properties ?? []);
  const [projectDisplayOrder, setProjectDisplayOrder] = React.useState<string[]>(
    cachedPublicProperties?.projectDisplayOrder ?? getEffectiveProjectDisplayOrder(),
  );
  const [loading, setLoading] = React.useState(!cachedPublicProperties);

  React.useEffect(() => {
    captureShortLinkFromUrl();
    loadPublicProperties().then(data => {
      setProperties(data.properties);
      setProjectDisplayOrder(data.projectDisplayOrder);
      setLoading(false);
    });
  }, []);

  if (loading && properties.length === 0) {
    return <PageLoader />;
  }

  return (
    <>
      <ListingsPage
        properties={properties}
        propertySlug={propertySlug}
        projectDisplayOrder={projectDisplayOrder}
      />
      <Outlet />
    </>
  );
}

function PropertySlugOutlet() {
  const { propertySlug } = useParams();
  if (propertySlug && !isPropertySlugCandidate(propertySlug)) {
    return <Navigate to="/" replace />;
  }
  return null;
}

function LegacyPropertyRedirect() {
  const { propertySlug } = useParams();
  return <Navigate to={propertySlug ? `/${propertySlug}` : '/'} replace />;
}

function SuspensePage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LeadGenProvider>
    <Router>
      <HelmetProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminRoute />} />
          <Route path="/admin/dashboard" element={<AdminRoute />} />
          <Route path="/admin/ai-content" element={<Navigate to="/admin/seo/posts" replace />} />
          <Route path="/admin/seo/posts" element={<AdminRoute />} />
          <Route path="/admin/seo/categories" element={<AdminRoute />} />
          <Route path="/admin/seo/tags" element={<AdminRoute />} />
          <Route path="/admin/seo/audit" element={<AdminRoute />} />
          <Route path="/admin/agents" element={<AdminRoute />} />
          <Route path="/admin/agents/campaign-center" element={<AdminRoute />} />
          <Route path="/admin/agents/marketing-center" element={<AdminRoute />} />
          <Route path="/admin/agents/decision-center" element={<AdminRoute />} />
          <Route path="/admin/agents/knowledge-center" element={<AdminRoute />} />
          <Route path="/admin/agents/knowledge-analytics" element={<AdminRoute />} />
          <Route path="/admin/agents/feedback-center" element={<AdminRoute />} />
          <Route path="/admin/agents/ai-providers" element={<AdminRoute />} />
          <Route path="/admin/agents/lead-center" element={<AdminRoute />} />
          <Route path="/admin/agents/sources" element={<AdminRoute />} />
          <Route path="/admin/agents/missions" element={<AdminRoute />} />
          <Route path="/admin/agents/jobs" element={<AdminRoute />} />
          <Route path="/admin/agents/publishing" element={<AdminRoute />} />
          <Route path="/admin/agents/publishing/drafts" element={<AdminRoute />} />
          <Route path="/admin/agents/publishing/channels" element={<AdminRoute />} />
          <Route path="/admin/agents/publishing/history" element={<AdminRoute />} />
          <Route path="/admin/agents/publishing/campaigns" element={<AdminRoute />} />
          <Route path="/admin/agents/contents" element={<AdminRoute />} />
          <Route path="/admin/agents/findings" element={<AdminRoute />} />
          <Route path="/admin/agents/external-inventory" element={<AdminRoute />} />
          <Route path="/admin/agents/proposals" element={<AdminRoute />} />
          <Route path="/admin/agents/spam" element={<AdminRoute />} />
          <Route path="/admin/agents/notifications" element={<AdminRoute />} />
          <Route path="/admin/agents/sessions" element={<AdminRoute />} />
          <Route path="/admin/agents/runtime" element={<AdminRoute />} />
          <Route path="/admin/agents/reports" element={<AdminRoute />} />
          <Route path="/bds-da-nang" element={<Navigate to="/" replace />} />
          <Route path="/bds-da-nang/:propertySlug" element={<LegacyPropertyRedirect />} />
          <Route path="/listings" element={<Navigate to={LISTING_CATALOG_ROOT} replace />} />
          {Object.entries(LEGACY_LISTING_REDIRECTS)
            .filter(([from]) => from !== '/listings')
            .map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}

          <Route element={<PublicSiteLayout />}>
            <Route
              path="/tin-tuc"
              element={<SuspensePage><BlogListPage /></SuspensePage>}
            />
            <Route
              path="/tin-tuc/chuyen-muc/:categorySlug"
              element={<SuspensePage><BlogCategoryPage /></SuspensePage>}
            />
            <Route
              path="/tin-tuc/:slug"
              element={<SuspensePage><BlogPostPage /></SuspensePage>}
            />
            <Route
              path="/tag/:tagSlug"
              element={<SuspensePage><BlogTagPage /></SuspensePage>}
            />
            <Route
              path="/gioi-thieu"
              element={<SuspensePage><AboutPage /></SuspensePage>}
            />
            <Route
              path="/lien-he"
              element={<SuspensePage><ContactPage /></SuspensePage>}
            />
            <Route
              path="/chinh-sach-bao-mat"
              element={<SuspensePage><LegalPage /></SuspensePage>}
            />
            <Route
              path="/dieu-khoan-su-dung"
              element={<SuspensePage><LegalPage /></SuspensePage>}
            />
            <Route
              path="/chinh-sach-cookie"
              element={<SuspensePage><LegalPage /></SuspensePage>}
            />
            <Route
              path="/mien-tru-trach-nhiem"
              element={<SuspensePage><LegalPage /></SuspensePage>}
            />
            <Route
              path="/tac-gia/nguyen-phan-hoang-linh"
              element={<SuspensePage><AuthorPage /></SuspensePage>}
            />
            <Route
              path="/bat-dong-san"
              element={
                <SuspensePage>
                  <CategoryListingsPage />
                </SuspensePage>
              }
            />
            <Route
              path="/bat-dong-san/:facet"
              element={
                <SuspensePage>
                  <CategoryListingsPage />
                </SuspensePage>
              }
            />
            {Object.entries({
              [SEO_CATEGORY_PATHS.canHo]: 'can-ho',
              [SEO_CATEGORY_PATHS.datNen]: 'dat-nen',
              [SEO_CATEGORY_PATHS.namDaNang]: 'nam-da-nang',
              [SEO_CATEGORY_PATHS.shophouse]: 'shophouse',
              [SEO_CATEGORY_PATHS.bdsDauTu]: 'bds-dau-tu',
            }).map(([hubPath, facetSlug]) => (
              <Route
                key={hubPath}
                path={hubPath}
                element={
                  <SuspensePage>
                    <CategoryListingsPage forcedFacetSlug={facetSlug} />
                  </SuspensePage>
                }
              />
            ))}
            <Route
              path="/du-an"
              element={
                <SuspensePage>
                  <ContentHubPage hubPath="/du-an" />
                </SuspensePage>
              }
            />
            <Route
              path="/du-an/:projectSlug"
              element={<SuspensePage><ProjectPage /></SuspensePage>}
            />
            <Route path="/kien-thuc-dau-tu" element={<Navigate to="/tin-tuc/chuyen-muc/kien-thuc-dau-tu" replace />} />
            <Route path="/tin-thi-truong" element={<Navigate to="/tin-tuc/chuyen-muc/tin-thi-truong" replace />} />
            <Route path="/phan-tich" element={<Navigate to="/tin-tuc/chuyen-muc/phan-tich-du-an" replace />} />
            <Route path="/review-khu-vuc" element={<Navigate to="/tin-tuc/chuyen-muc/review-khu-vuc" replace />} />
            <Route
              path="/nha-dau-tu"
              element={<SuspensePage><InvestorDashboardPage /></SuspensePage>}
            />
            <Route
              path="/dau-tu-da-nang"
              element={<SuspensePage><LandingPageView /></SuspensePage>}
            />
            <Route
              path="/dau-tu-nam-da-nang"
              element={<SuspensePage><LandingPageView /></SuspensePage>}
            />
            <Route
              path="/dau-tu-fpt-city"
              element={<SuspensePage><LandingPageView /></SuspensePage>}
            />
            <Route
              path="/can-ho-da-nang-cho-thue"
              element={<SuspensePage><LandingPageView /></SuspensePage>}
            />
            <Route
              path="/can-ho-dau-tu-da-nang"
              element={<SuspensePage><LandingPageView /></SuspensePage>}
            />
            <Route
              path="/nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang"
              element={<SuspensePage><LandingPageView /></SuspensePage>}
            />
            <Route
              path="/dat-nen-nam-da-nang"
              element={<SuspensePage><LandingPageView /></SuspensePage>}
            />
            <Route
              path="/tai-lieu-dau-tu"
              element={<SuspensePage><LeadMagnetsHubPage /></SuspensePage>}
            />
            <Route
              path="/tai-lieu-dau-tu/:magnetSlug"
              element={<SuspensePage><LeadMagnetDetailPage /></SuspensePage>}
            />
            <Route
              path="/moi-gioi"
              element={<SuspensePage><AgentsDirectoryPage /></SuspensePage>}
            />
            <Route
              path="/moi-gioi/:agentSlug"
              element={<SuspensePage><AgentProfilePage /></SuspensePage>}
            />
          </Route>

          <Route path="/" element={<PublicListingsShell />}>
            <Route index element={null} />
            <Route path=":propertySlug" element={<PropertySlugOutlet />} />
          </Route>
        </Routes>
        <HashListingsRedirect />
      </HelmetProvider>
    </Router>
    </LeadGenProvider>
  </StrictMode>,
);
