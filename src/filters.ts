import type { Listing, SearchFilters } from './types';

/** Narrow a source's listings by the search's client-side filters (price band, title keywords). */
export function applyFilters(listings: readonly Listing[], filters?: SearchFilters): Listing[] {
  if (!filters) return [...listings];

  return listings.filter((listing) => {
    if (filters.titleMustInclude?.length) {
      const haystack = `${listing.title} ${listing.url}`.toLowerCase();
      const matchesAll = filters.titleMustInclude.every((needle) =>
        haystack.includes(needle.toLowerCase()),
      );
      if (!matchesAll) return false;
    }

    // Only price-filter when we actually parsed a price; a null price passes through
    // rather than being silently dropped.
    if (listing.priceEgp != null) {
      if (filters.priceMin != null && listing.priceEgp < filters.priceMin) return false;
      if (filters.priceMax != null && listing.priceEgp > filters.priceMax) return false;
    }

    return true;
  });
}
