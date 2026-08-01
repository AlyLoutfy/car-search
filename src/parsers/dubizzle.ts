import type { Listing } from '../types';
import { slugToTitle } from './helpers';

// Dubizzle's listing page carries the same result set three times over. We use all three, because
// each covers a gap in the others:
//
// 1. schema.org JSON-LD (<script type="application/ld+json">) — an ItemList of Car objects with
//    the ad's price, brand, model, year and thumbnail. This is the ONLY place the asking price is
//    reliably attached to its own ad, so it drives price filtering.
// 2. Ad cards — <a href="ad/<slug>-ID<id>.html" title="<title>"> — one per visible listing.
// 3. The analytics arrays "ad_ids":[...] and "ad_ids_set_2":[...] — the COMPLETE, ordered list of
//    every matching ad id, even ones whose card didn't render. The safety net that guarantees we
//    never miss a listing.
//
// One listing per id from the union of all three, keyed on the stable numeric id. An id that only
// (2) or (3) knows about still becomes a listing — with a null price, which passes the price filter
// rather than being silently dropped.

const AD_CARD = /\bad\/[^"']*?-ID(\d+)\.html"\s+title="([^"]*)"/gi;
const AD_CARD_HREF = /\bad\/([^"']*?-ID(\d+)\.html)/gi;
const AD_IDS_ARRAY = /"ad_ids(?:_set_2)?":\[([^\]]*)\]/gi;
const JSON_LD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ID_IN_URL = /-ID(\d+)\.html/;

/** What the JSON-LD knows about one ad. Any field may be missing on a malformed entry. */
interface StructuredAd {
  readonly title?: string;
  readonly priceEgp?: number;
  readonly imageUrl?: string;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isCar(node: Record<string, unknown>): boolean {
  return asArray(node['@type']).includes('Car');
}

/**
 * Build a Latin display title from the structured brand/model/year.
 *
 * Deliberately NOT the seller's own headline: roughly a third of Egyptian listings are titled in
 * Arabic ("سيات ليون 2024"), and `titleMustInclude: ["leon"]` would drop every one of them. Brand
 * and model are Latin in the JSON-LD even on Arabic-titled ads, so this stays filterable while
 * still reflecting the actual car — unlike a hardcoded make/model, which silently mislabels every
 * listing the moment a second search is added.
 */
function structuredTitle(node: Record<string, unknown>): string | undefined {
  const brand = (node.brand as Record<string, unknown> | undefined)?.name;
  const parts = [brand, node.model, node.vehicleModelDate]
    .map((part) => (typeof part === 'string' || typeof part === 'number' ? String(part).trim() : ''))
    .filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/** Walk every JSON-LD block and index the Car entries by their numeric ad id. */
function parseStructuredAds(html: string): Map<string, StructuredAd> {
  const byId = new Map<string, StructuredAd>();

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;

    if (isCar(record)) {
      const offers = (asArray(record.offers)[0] ?? {}) as Record<string, unknown>;
      const url = typeof offers.url === 'string' ? offers.url : String(record.url ?? '');
      const id = url.match(ID_IN_URL)?.[1];
      if (id && !byId.has(id)) {
        const price = Number(offers.price);
        const image = record.image;
        byId.set(id, {
          title: structuredTitle(record),
          priceEgp: Number.isFinite(price) && price > 0 ? price : undefined,
          imageUrl: typeof image === 'string' ? image : undefined,
        });
      }
    }

    Object.values(record).forEach(visit);
  };

  for (const match of html.matchAll(JSON_LD)) {
    try {
      visit(JSON.parse(match[1] ?? ''));
    } catch {
      // A single malformed block must not lose the other blocks (or the regex backstops below).
    }
  }

  return byId;
}

/**
 * Fallback title for an ad the JSON-LD didn't describe, derived from the search URL we fetched
 * (".../used/seat/model-leon/" → "Seat Leon"). The page is already narrowed to one make/model, so
 * this is accurate — and it keeps the make/model Latin for ads with an Arabic slug.
 */
function titleFromSourceUrl(sourceUrl: string | undefined): string | undefined {
  const match = sourceUrl?.match(/\/cars-for-sale\/[a-z-]+\/([a-z0-9-]+)\/model-([a-z0-9-]+)/i);
  const make = match?.[1];
  const model = match?.[2];
  return make && model ? slugToTitle(`${make} ${model}`) : undefined;
}

/** Last-resort title: the year out of the ad slug or card title, appended to whatever we know. */
function fallbackTitle(
  base: string | undefined,
  cardTitle: string | undefined,
  href: string | undefined,
): string {
  const year = href?.match(/-(\d{4})-ID/)?.[1] ?? cardTitle?.match(/\b(?:19|20)\d{2}\b/)?.[0];
  if (base) return year ? `${base} ${year}` : base;
  // Nothing structured and no source URL — the seller's own headline beats an empty string.
  return cardTitle?.trim() || 'Listing';
}

/**
 * Parse Dubizzle listings from the full page HTML.
 *
 * `sourceUrl` is the search URL this HTML came from; it supplies the make/model for any ad the
 * structured data missed. Optional so the parser stays usable on a bare fixture.
 */
export function parseDubizzle(html: string, sourceUrl?: string): Listing[] {
  const structured = parseStructuredAds(html);
  const cardTitleById = new Map<string, string>();
  const cardHrefById = new Map<string, string>();

  for (const match of html.matchAll(AD_CARD)) {
    const id = match[1];
    const title = match[2];
    if (id && title && !cardTitleById.has(id)) cardTitleById.set(id, title);
  }
  for (const match of html.matchAll(AD_CARD_HREF)) {
    const href = match[1];
    const id = match[2];
    if (id && href && !cardHrefById.has(id)) cardHrefById.set(id, href);
  }

  // Union of every id: structured entries and card ids first (ordered as shown), then any id known
  // only to the analytics arrays.
  const ids = new Set<string>([...structured.keys(), ...cardHrefById.keys()]);
  for (const arrayMatch of html.matchAll(AD_IDS_ARRAY)) {
    for (const idMatch of (arrayMatch[1] ?? '').matchAll(/"(\d+)"/g)) {
      if (idMatch[1]) ids.add(idMatch[1]);
    }
  }

  const urlTitle = titleFromSourceUrl(sourceUrl);

  return [...ids].map((id) => {
    const ad = structured.get(id);
    return {
      key: `dubizzle:${id}`,
      title: ad?.title ?? fallbackTitle(urlTitle, cardTitleById.get(id), cardHrefById.get(id)),
      // Null when the structured data didn't cover this ad. applyFilters lets a null price through,
      // so an unpriced ad is surfaced for you to check rather than silently filtered away.
      priceEgp: ad?.priceEgp ?? null,
      url: `https://www.dubizzle.com.eg/ad/${id}`,
      imageUrl: ad?.imageUrl ?? null,
      site: 'dubizzle',
    };
  });
}
