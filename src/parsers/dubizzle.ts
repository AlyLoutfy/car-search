import type { Listing } from '../types';
import { nearestPrice, slugToTitle } from './helpers';

// Dubizzle ad URLs look like: https://www.dubizzle.com.eg/en/ad/seat-leon-2020-ID208239498
const AD_URL = /https:\/\/www\.dubizzle\.com\.eg\/en\/ad\/([a-z0-9-]+?-ID(\d+))\b/gi;

/** Parse Dubizzle listings from Jina-reader markdown. The numeric ad ID is a stable dedup key. */
export function parseDubizzle(markdown: string): Listing[] {
  const byKey = new Map<string, Listing>();

  for (const match of markdown.matchAll(AD_URL)) {
    const fullSlug = match[1];
    const id = match[2];
    if (!fullSlug || !id) continue;

    const key = `dubizzle:${id}`;
    if (byKey.has(key)) continue;

    const titleSlug = fullSlug.replace(/-ID\d+$/i, '');
    byKey.set(key, {
      key,
      title: slugToTitle(titleSlug),
      priceEgp: nearestPrice(markdown, match.index ?? 0),
      url: `https://www.dubizzle.com.eg/en/ad/${fullSlug}`,
      imageUrl: null,
      site: 'dubizzle',
    });
  }

  return [...byKey.values()];
}
