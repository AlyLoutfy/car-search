import type { Listing } from '../types';

// Dubizzle's listing grid is Algolia-backed and only ~3 cards survive a markdown render, so we
// read the full HTML instead. Two complementary signals live in that HTML:
//
// 1. Ad cards — <a ... href="ad/<slug>-ID<id>.html" title="<title>"> — one per visible listing,
//    carrying the title (and usually a Western-digit year in the slug).
// 2. The analytics arrays "ad_ids":[...] and "ad_ids_set_2":[...] — the COMPLETE, ordered list of
//    every matching ad id, even ones whose card didn't fully render. This is the safety net that
//    guarantees we never miss a listing.
//
// We build one listing per id from the union of both, keyed on the stable numeric id.

const AD_CARD = /\bad\/[^"']*?-ID(\d+)\.html"\s+title="([^"]*)"/gi;
const AD_CARD_HREF = /\bad\/([^"']*?-ID(\d+)\.html)/gi;
const AD_IDS_ARRAY = /"ad_ids(?:_set_2)?":\[([^\]]*)\]/gi;

function egPrice(): number | null {
  // Price is deliberately not parsed here: Dubizzle's URL already filters by mileage, and its price
  // element is structurally detached from the card, so a parsed number would be unreliable — and a
  // wrong price could filter out a real listing. We surface every match and let the user check.
  return null;
}

/** Build a clean "Seat Leon <year>" title from a card title or slug (handles Arabic titles). */
function titleFor(id: string, cardTitle: string | undefined, href: string | undefined): string {
  const yearFromHref = href?.match(/-(\d{4})-ID/);
  const yearFromTitle = cardTitle?.match(/\b(19|20)\d{2}\b/);
  const year = yearFromHref?.[1] ?? yearFromTitle?.[0];
  return year ? `Seat Leon ${year}` : 'Seat Leon';
}

/** Parse Dubizzle listings from the full page HTML. */
export function parseDubizzle(html: string): Listing[] {
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

  // Union of every id: card ids first (ordered as shown), then any id only in the analytics arrays.
  const ids = new Set<string>(cardHrefById.keys());
  for (const arrayMatch of html.matchAll(AD_IDS_ARRAY)) {
    const body = arrayMatch[1] ?? '';
    for (const idMatch of body.matchAll(/"(\d+)"/g)) {
      if (idMatch[1]) ids.add(idMatch[1]);
    }
  }

  const listings: Listing[] = [];
  for (const id of ids) {
    const href = cardHrefById.get(id);
    listings.push({
      key: `dubizzle:${id}`,
      title: titleFor(id, cardTitleById.get(id), href),
      priceEgp: egPrice(),
      // The numeric ad URL reliably 301-redirects to the canonical listing — short and encoding-safe.
      url: `https://www.dubizzle.com.eg/ad/${id}`,
      imageUrl: null,
      site: 'dubizzle',
    });
  }

  return listings;
}
