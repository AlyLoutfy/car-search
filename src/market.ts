import type { Match } from './types';
import { totalCost } from './filters';

/** Fewer comparable ads than this and a median says little; widen the comparison instead. */
const MIN_PEERS = 5;

export type Verdict = 'great' | 'good' | 'fair' | 'high';

export interface MarketPosition {
  readonly medianEgp: number;
  /** Signed: -0.08 means 8% below the median. */
  readonly vsMedian: number;
  /** Share of the other comparable ads that cost more than this one (0–1). */
  readonly cheaperThan: number;
  readonly peerCount: number;
  /** What the peers have in common, e.g. "256 GB"; empty when compared against everything. */
  readonly scope: string;
  readonly verdict: Verdict;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function verdictFor(vsMedian: number): Verdict {
  if (vsMedian <= -0.1) return 'great';
  if (vsMedian <= -0.04) return 'good';
  if (vsMedian < 0.04) return 'fair';
  return 'high';
}

/**
 * The comparable market for a tracker: every match whose total cost is known for certain. An ad
 * that doesn't say whether tax is owed is left out — its real cost could be either of two numbers,
 * and letting it in would drag the median towards whichever one it isn't.
 */
export function marketPeers(matches: readonly Match[]): Match[] {
  return matches.filter((match) => match.possibleExtraCostEgp === 0 && totalCost(match) != null);
}

/**
 * Where a price sits among its peers (all compared on total cost, tax included).
 *
 * Peers are narrowed to ads sharing the `compareBy` attributes (a 512 GB phone isn't priced like a
 * 256 GB one) unless that leaves too few to say anything, then the whole market is used. Junk
 * prices — placeholders like "1 EGP", or "wanted" ads — are trimmed before the median is taken.
 */
export function marketPosition(
  priceEgp: number,
  self: Match,
  peers: readonly Match[],
  compareBy: readonly string[] = [],
): MarketPosition | null {
  const others = peers.filter((peer) => peer.listing.key !== self.listing.key);
  const sameVariant = others.filter((peer) =>
    compareBy.every(
      (attribute) => peer.listing.attributes[attribute] === self.listing.attributes[attribute],
    ),
  );
  const narrowed = compareBy.length > 0 && sameVariant.length >= MIN_PEERS;
  const pool = (narrowed ? sameVariant : others)
    .map((peer) => totalCost(peer))
    .filter((price): price is number => price != null);
  if (pool.length < MIN_PEERS) return null;

  const rough = median([...pool].sort((a, b) => a - b));
  const prices = pool
    .filter((price) => price >= rough * 0.5 && price <= rough * 2)
    .sort((a, b) => a - b);
  if (prices.length < MIN_PEERS) return null;

  const medianEgp = median(prices);
  const vsMedian = (priceEgp - medianEgp) / medianEgp;
  return {
    medianEgp,
    vsMedian,
    cheaperThan: prices.filter((price) => price > priceEgp).length / prices.length,
    peerCount: prices.length,
    scope: narrowed
      ? compareBy.map((attribute) => self.listing.attributes[attribute]).join(' · ')
      : '',
    verdict: verdictFor(vsMedian),
  };
}
