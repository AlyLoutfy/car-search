import type { AppEnv } from './config';
import type { Listing, SearchConfig, SearchSource, SiteId } from './types';
import { fetchViaJina } from './fetchers';
import { parseContactCars } from './parsers/contactcars';
import { parseDubizzle } from './parsers/dubizzle';
import { parseSylndr } from './parsers/sylndr';
import { applyFilters } from './filters';

interface SiteAdapter {
  /** A token that must appear in a genuine results page (used to reject broken/challenge pages). */
  readonly pageMarker: string;
  readonly parse: (markdown: string) => Listing[];
}

const ADAPTERS: Record<SiteId, SiteAdapter> = {
  contactcars: { pageMarker: 'contactcars.com', parse: parseContactCars },
  dubizzle: { pageMarker: 'dubizzle.com.eg', parse: parseDubizzle },
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
 * Reject a response that does not look like a real results page, so a broken fetch (empty Jina
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
  env: AppEnv,
): Promise<Listing[]> {
  const markdown = await fetchViaJina(source.url, { jinaApiKey: env.jinaApiKey });
  assertResultsPage(source.site, markdown);
  const listings = ADAPTERS[source.site].parse(markdown);
  return applyFilters(listings, search.filters);
}
