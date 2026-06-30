export type SiteId = 'contactcars' | 'dubizzle' | 'sylndr';

/** A single car listing, normalised across every source site. */
export interface Listing {
  /** Stable key used to detect whether we have already alerted on this listing. */
  readonly key: string;
  readonly title: string;
  readonly priceEgp: number | null;
  readonly url: string;
  readonly imageUrl: string | null;
  readonly site: SiteId;
}

/** Client-side narrowing applied after a source returns its listings. */
export interface SearchFilters {
  readonly priceMin?: number;
  readonly priceMax?: number;
  /** Every entry must appear (case-insensitively) in the listing title or URL. */
  readonly titleMustInclude?: readonly string[];
}

export interface SearchSource {
  readonly site: SiteId;
  readonly url: string;
}

/** One saved search the user wants to be alerted about, spanning several sites. */
export interface SearchConfig {
  readonly id: string;
  readonly label: string;
  readonly sources: readonly SearchSource[];
  readonly filters?: SearchFilters;
}
