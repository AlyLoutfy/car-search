import type { Listing } from '../types';
import { parsePriceEgp } from './helpers';

// In Jina markdown each ContactCars used-car card is an image-link to the car's detail page,
// immediately followed by the price + "## Title" run, e.g.:
//   ...heart.svg)](https://www.contactcars.com/en/used-cars/seat-leon/f9162d70a789 "Used 2018 Seat Leon for Sale in Cairo")[985,000 EGP ## Seat Leon 2018 1.2 A/T H/B Style plus[Seat](...)
//   ...)](https://.../used-cars/seat-leon/5454b65b6687 "...")[1,050,000 EGP~16,986 EGP/ Month ## Seat Leon 2020 1.6 A/T Style plus[Seat](...)
// Groups: 1 = detail URL, 2 = stable hex listing id, 3 = price digits, 4 = title.
// The lazy [^#\n]* skips the optional monthly-installment figure before "##".
const CARD =
  /\]\((https:\/\/www\.contactcars\.com\/en\/used-cars\/[a-z0-9-]+\/([a-f0-9]{6,}))[^)]*\)\s*\[(\d[\d,]{4,})\s*EGP[^#\n]*?##\s*([^[\n]+?)\s*(?:\[|\n|$)/g;

/** Parse ContactCars used-car listings from Jina-reader markdown, keyed by the stable listing id. */
export function parseContactCars(markdown: string): Listing[] {
  const byKey = new Map<string, Listing>();

  for (const match of markdown.matchAll(CARD)) {
    const url = match[1];
    const id = match[2];
    const priceText = match[3];
    const rawTitle = match[4];
    if (!url || !id || !rawTitle) continue;

    const title = rawTitle.replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const key = `contactcars:${id}`;
    if (byKey.has(key)) continue;

    byKey.set(key, {
      key,
      title,
      priceEgp: priceText ? parsePriceEgp(`${priceText} EGP`) : null,
      url,
      imageUrl: null,
      site: 'contactcars',
    });
  }

  return [...byKey.values()];
}
