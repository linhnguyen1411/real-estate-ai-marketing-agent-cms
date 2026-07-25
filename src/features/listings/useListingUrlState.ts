import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  EMPTY_LISTING_FILTERS,
  type ListingFilterState,
  parseListingSearchParams,
  serializeListingSearchParams,
} from './listingFilters';

/**
 * Listing filter SSOT = URL search params.
 * Updates use history entries so back/forward restore filters.
 */
export function useListingUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(
    () => parseListingSearchParams(searchParams),
    [searchParams],
  );

  const setFilters = useCallback(
    (patch: Partial<ListingFilterState>, options?: { replace?: boolean; resetPage?: boolean }) => {
      const next: ListingFilterState = {
        ...filters,
        ...patch,
      };
      if (options?.resetPage !== false && patch.page === undefined) {
        const keys = Object.keys(patch) as (keyof ListingFilterState)[];
        if (keys.some(k => k !== 'page')) next.page = 1;
      }
      const params = serializeListingSearchParams(next);
      setSearchParams(params, { replace: options?.replace ?? false });
    },
    [filters, setSearchParams],
  );

  const resetFilters = useCallback(
    (options?: { replace?: boolean }) => {
      setSearchParams(serializeListingSearchParams(EMPTY_LISTING_FILTERS), {
        replace: options?.replace ?? false,
      });
    },
    [setSearchParams],
  );

  return { filters, setFilters, resetFilters, searchParams };
}
