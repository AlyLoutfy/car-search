import type { Listing } from '../types';
import { slugToTitle } from './helpers';

// Sylndr car-detail URLs look like:
//   https://sylndr.com/en/car-details/used-cars/seat/leon/6ed95b26-a5c7-41e6-bc42-74c4a86626f4
// Captured groups: 1 = make, 2 = model, 3 = stable UUID (the dedup key).
const CAR_URL =
  /https:\/\/(?:www\.)?sylndr\.com\/en\/car-details\/[a-z0-9-]+\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-f0-9-]{20,})\b/gi;

/**
 * Parse Sylndr listings from Jina-reader markdown.
 *
 * Price is deliberately left null: Sylndr's reader output interleaves financing/down-payment
 * figures with asking prices, so a parsed number would be unreliable — and a wrong price could
 * cause a real listing to be filtered out and missed. We surface the car and let the user check
 * the linked page. (Sylndr's own search URL does not price-filter either, so this is consistent.)
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
