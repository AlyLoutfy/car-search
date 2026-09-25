import { createHash } from 'node:crypto';
import type { Match } from './types';

// Sellers "bump" an ad by posting it again, which gives it a new id — to a tracker keyed on ids,
// a brand-new listing. Recognising a repost needs what the ad offers, not its id: the same seller
// asking about the same price for the same variant (storage, year…) is the same offer. That also
// folds together a dealer's identical units — for a buyer, one alert per offer is the right count.

/** Prices this close (5%) from the same seller for the same variant count as the same offer. */
const SAME_PRICE = 0.05;

/**
 * A compact fingerprint of an ad's offer: "<seller>|<variant>|<price>". Undefined when the page
 * didn't say who posted it. The seller id is hashed — it's only ever compared, and the fingerprint
 * is stored in state/seen.json, which is committed to the repo.
 */
export function offerOf(match: Match, compareBy: readonly string[] = []): string | undefined {
  const seller = match.listing.sellerId;
  if (!seller) return undefined;
  const sellerHash = createHash('sha1').update(seller).digest('hex').slice(0, 12);
  const variant = compareBy.map((attribute) => match.listing.attributes[attribute] ?? '').join('/');
  return `${sellerHash}|${variant}|${match.listing.priceEgp ?? ''}`;
}

interface ParsedOffer {
  readonly seller: string;
  readonly variant: string;
  readonly priceEgp: number | null;
}

function parseOffer(offer: string): ParsedOffer {
  // The seller hash and price never contain "|"; whatever sits between them is the variant.
  const parts = offer.split('|');
  const price = parts.length > 2 ? parts[parts.length - 1] : '';
  return {
    seller: parts[0] ?? '',
    variant: parts.slice(1, -1).join('|'),
    priceEgp: price ? Number(price) : null,
  };
}

function samePrice(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= SAME_PRICE * Math.max(a, b);
}

/** Whether `offer` repeats one already seen: same seller, same variant, price within 5%. */
export function isRepost(offer: string, known: Iterable<string>): boolean {
  const candidate = parseOffer(offer);
  for (const other of known) {
    const seen = parseOffer(other);
    if (
      seen.seller === candidate.seller &&
      seen.variant === candidate.variant &&
      samePrice(seen.priceEgp, candidate.priceEgp)
    ) {
      return true;
    }
  }
  return false;
}
