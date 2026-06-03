import React from 'react';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import ListingsPage from './ListingsPageNew.tsx';
import './index.css';

// Fetch properties data for public listings
async function fetchPublicProperties() {
  try {
    const response = await fetch('/api/properties');
    if (!response.ok) throw new Error('Failed to fetch properties');
    return await response.json();
  } catch (error) {
    console.error('Error fetching properties:', error);
    return [];
  }
}

function PublicListingsWrapper() {
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

  return <ListingsPage properties={properties} onBack={() => window.location.href = '/'} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <HelmetProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/listings" element={<PublicListingsWrapper />} />
        </Routes>
      </HelmetProvider>
    </Router>
  </StrictMode>,
);
