import React from 'react';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import ListingsPage from './ListingsPage.tsx';
import CrawlerJobsPage from './CrawlerJobsPage.tsx';
import CrawlerHealthPage from './CrawlerHealthPage.tsx';
import LeadImportPage from './LeadImportPage.tsx';
import './index.css';

// Fetch properties data for public listings
async function fetchPublicProperties() {
  try {
    const response = await fetch('/api/public/properties');
    if (!response.ok) throw new Error('Failed to fetch properties');
    const json = await response.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    console.error('Error fetching properties:', error);
    return [];
  }
}

function PublicListingsWrapper() {
  const { propertySlug } = useParams();
  const [properties, setProperties] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchPublicProperties().then(data => {
      setProperties(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return <ListingsPage properties={properties} propertySlug={propertySlug} />;
}

function LegacyPropertyRedirect() {
  const { propertySlug } = useParams();
  return <Navigate to={propertySlug ? `/${propertySlug}` : '/'} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <HelmetProvider>
        <Routes>
          <Route path="/admin/login" element={<App />} />
          <Route path="/admin/dashboard" element={<App />} />
          <Route path="/admin/crawler-jobs" element={<CrawlerJobsPage />} />
          <Route path="/admin/crawler-health" element={<CrawlerHealthPage />} />
          <Route path="/admin/lead-import" element={<LeadImportPage />} />
          <Route path="/bds-da-nang" element={<Navigate to="/" replace />} />
          <Route path="/bds-da-nang/:propertySlug" element={<LegacyPropertyRedirect />} />
          <Route path="/listings" element={<Navigate to="/" replace />} />
          <Route path="/" element={<PublicListingsWrapper />} />
          <Route path="/:propertySlug" element={<PublicListingsWrapper />} />
        </Routes>
      </HelmetProvider>
    </Router>
  </StrictMode>,
);
