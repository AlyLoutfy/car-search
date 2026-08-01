import type { Listing } from '../types';
import { slugToTitle } from './helpers';

// Sylndr car-detail links appear in two shapes depending on how the page was fetched:
//   absolute (reader markdown): https://sylndr.com/en/car-details/used-cars/seat/leon/6ed95b26-...
//   relative (raw page HTML):                    /en/car-details/used-cars/seat/leon/6ed95b26-...
// The origin is therefore optional. Captured groups: 1 = make, 2 = model, 3 = stable UUID (the key).
const CAR_URL =
  /(?:https:\/\/(?:www\.)?sylndr\.com)?\/en\/car-details\/[a-z0-9-]+\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-f0-9-]{20,})\b/gi;

/**
 * Parse Sylndr listings from the listings page (raw HTML, or reader markdown).
 *
 * Sylndr server-renders one anchor per matching car, so the un-hydrated HTML already carries the
 * complete result set — no browser needed.
 *
 * Price is deliberately left null: Sylndr interleaves financing/down-payment figures with asking
 * prices, so a parsed number would be unreliable — and a wrong price could cause a real listing to
 * be filtered out and missed. We surface the car and let the user check the linked page. (Sylndr's
 * own search URL does not price-filter either, so this is consistent.)
 */
export function parseSylndr(markdown: string): Listing[] {
  const byKey = new Map<string, Listing>();

  for (const match of markdown.matchAll(CAR_URL)) {
    const make = match[1];
    const model = match[2];
    const id = match[3];
    if (!make || !model || !id) continue;

    const key = `sylndr:${id}`;
    if (byKey.has(key)) continue;

    byKey.set(key, {
      key,
      title: slugToTitle(`${make} ${model}`),
      priceEgp: null,
      url: `https://sylndr.com/en/car-details/used-cars/${make}/${model}/${id}`,
      imageUrl: null,
      site: 'sylndr',
    });
  }

  return [...byKey.values()];
}
