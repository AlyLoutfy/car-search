import { createHash } from 'node:crypto';

/**
 * Parse an Egyptian price out of free text. Matches "1,350,000 EGP", "EGP 1,350,000",
 * or a bare 6+ digit number. Returns the FIRST price found (the asking price on a card,
 * not the smaller monthly-installment figure that may follow it).
 */
export function parsePriceEgp(text: string): number | null {
  const match = text.match(
    /(\d{1,3}(?:,\d{3})+|\d{6,})\s*EGP|EGP\s*(\d{1,3}(?:,\d{3})+|\d{6,})/i,
  );
  if (!match) return null;
  const digits = (match[1] ?? match[2] ?? '').replace(/,/g, '');
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/** Find the price nearest to a given index by scanning a window around it. */
export function nearestPrice(
  markdown: string,
  index: number,
  before = 220,
  after = 520,
): number | null {
  const window = markdown.slice(Math.max(0, index - before), index + after);
  return parsePriceEgp(window);
}

/** Turn a URL slug ("seat-leon-2020") into a display title ("Seat Leon 2020"). */
export function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Short, stable hash for building a dedup key when no stable listing URL is available. */
export function hashKey(...parts: ReadonlyArray<string | number | null>): string {
  return createHash('sha1').update(parts.map((part) => String(part)).join('|')).digest('hex').slice(0, 16);
}
