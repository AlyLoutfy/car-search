import type { Listing, SearchConfig, SearchSource, SiteId } from './types';
import { fetchDirect } from './fetchers';
import { parseDubizzle } from './parsers/dubizzle';
import { parseSylndr } from './parsers/sylndr';
import { applyFilters } from './filters';

interface SiteAdapter {
  /** A token that must appear in a genuine results page (used to reject broken/challenge pages). */
  readonly pageMarker: string;
  readonly parse: (content: string) => Listing[];
  /** Override the request timeout — a full listings page can be several MB. */
  readonly timeoutMs?: number;
}

const ADAPTERS: Record<SiteId, SiteAdapter> = {
  // Dubizzle server-renders its ad cards and the complete "ad_ids" arrays into the page HTML,
  // so a plain request returns everything a headless-browser proxy would — at no cost.
  dubizzle: { pageMarker: 'dubizzle.com.eg', parse: parseDubizzle, timeoutMs: 70_000 },
  // Sylndr server-renders one anchor per matching car; the un-hydrated HTML is the full result set.
  sylndr: { pageMarker: 'sylndr.com', parse: parseSylndr },
};

// Markers that mean we got a bot-challenge / error page rather than real content. A page like
// this must NOT be parsed as "zero listings" — that would poison the seen-state.
const CHALLENGE_MARKERS = [
  'just a moment',
  'cf-chl',
  'attention required',
  'enable javascript and cookies',
  'access denied',
];

/**
 * Reject a response that does not look like a real results page, so a broken fetch (truncated
 * reply, Cloudflare challenge, site outage returning HTTP 200) is treated as a failure to retry —
 * never as a legitimately-empty result that would seed an empty set or trigger a mass re-alert.
 */
export function assertResultsPage(site: SiteId, markdown: string): void {
  const lower = markdown.toLowerCase();
  if (markdown.length < 800) {
    throw new Error(`${site}: response too short (${markdown.length} chars) — likely a failed fetch`);
  }
  if (!lower.includes(ADAPTERS[site].pageMarker)) {
    throw new Error(`${site}: response missing expected marker "${ADAPTERS[site].pageMarker}"`);
  }
  const challenge = CHALLENGE_MARKERS.find((marker) => lower.includes(marker));
  if (challenge) {
    throw new Error(`${site}: looks like a bot-challenge page ("${challenge}")`);
  }
}

/** Fetch, validate, parse and filter the listings for one (search, source) pair. */
export async function collectSource(
  search: SearchConfig,
  source: SearchSource,
): Promise<Listing[]> {
  const adapter = ADAPTERS[source.site];
  const content = await fetchDirect(source.url, { timeoutMs: adapter.timeoutMs });
  assertResultsPage(source.site, content);
  const listings = adapter.parse(content);
  return applyFilters(listings, search.filters);
}
