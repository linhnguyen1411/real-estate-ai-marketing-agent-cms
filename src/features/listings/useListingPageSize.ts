import { useEffect, useState } from 'react';

import { listingPageSizeForWidth } from './listingFilters';

/** Responsive listing page size: columns × rows (default 3 rows). */
export function useListingPageSize(rows = 3): number {
  const [pageSize, setPageSize] = useState(() =>
    typeof window === 'undefined' ? rows * 3 : listingPageSizeForWidth(window.innerWidth, rows),
  );

  useEffect(() => {
    const update = () => setPageSize(listingPageSizeForWidth(window.innerWidth, rows));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [rows]);

  return pageSize;
}
