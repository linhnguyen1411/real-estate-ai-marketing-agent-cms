import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { LISTING_CATALOG_ROOT } from './listingFilters';

/**
 * `/#listings` is not a valid listing route — redirect to canonical catalog.
 * Preserves any existing query string on the current location.
 */
export function HashListingsRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = (location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash !== 'listings') return;
    const qs = location.search || '';
    navigate(`${LISTING_CATALOG_ROOT}${qs}`, { replace: true });
  }, [location.hash, location.search, navigate]);

  return null;
}
