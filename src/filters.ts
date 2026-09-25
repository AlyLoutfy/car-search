import type { Check, Listing, Match, TrackerConfig } from './types';
import { readBatteryHealth, readTaxStatus } from './signals';

const egp = (amount: number): string => `${amount.toLocaleString('en-US')} EGP`;

/** A check that can also change what the listing costs. */
interface CostCheck {
  readonly check: Check;
  readonly extraCostEgp: number;
  readonly possibleExtraCostEgp: number;
}

function taxCheck(listing: Listing, taxEgp: number): CostCheck {
  switch (readTaxStatus(listing.description)) {
    case 'owed':
      return {
        check: { label: 'Tax', status: 'warn', detail: `owed (+${egp(taxEgp)})` },
        extraCostEgp: taxEgp,
        possibleExtraCostEgp: 0,
      };
    case 'clear':
      return {
        check: { label: 'Tax', status: 'pass', detail: 'paid / exempt' },
        extraCostEgp: 0,
        possibleExtraCostEgp: 0,
      };
    default:
      return {
        check: { label: 'Tax', status: 'unknown', detail: 'not mentioned' },
        extraCostEgp: 0,
        possibleExtraCostEgp: taxEgp,
      };
  }
}

function batteryCheck(listing: Listing, minimum: number): Check {
  const reading = readBatteryHealth(listing.description);
  if (!reading) return { label: 'Battery', status: 'unknown', detail: 'not mentioned' };
  // Only a reading tied to the word "battery" can fail an ad; a bare "90%" might mean condition.
  if (reading.percent < minimum) {
    return reading.confidence === 'explicit'
      ? { label: 'Battery', status: 'fail', detail: `${reading.percent}%` }
      : { label: 'Battery', status: 'unknown', detail: `${reading.percent}%?` };
  }
  return { label: 'Battery', status: 'pass', detail: `${reading.percent}%` };
}

/**
 * Run a listing through a tracker's filters. Returns the match — with its checks and any extra
 * cost the ad says is owed — or null when the listing should be dropped.
 *
 * Anything the ad doesn't say passes: a missing price, an unmentioned battery. A listing you didn't
 * want costs one message; a listing you missed can't be recovered.
 */
export function evaluate(listing: Listing, tracker: TrackerConfig): Match | null {
  const filters = tracker.filters ?? {};
  const checks: Check[] = [];
  let extraCostEgp = 0;
  let possibleExtraCostEgp = 0;

  if (filters.titleMustInclude?.length) {
    const haystack = `${listing.title} ${listing.description ?? ''}`.toLowerCase();
    if (!filters.titleMustInclude.every((needle) => haystack.includes(needle.toLowerCase()))) {
      return null;
    }
  }

  if (tracker.phoneTaxEgp != null) {
    const tax = taxCheck(listing, tracker.phoneTaxEgp);
    checks.push(tax.check);
    extraCostEgp += tax.extraCostEgp;
    possibleExtraCostEgp += tax.possibleExtraCostEgp;
  }

  if (filters.minBatteryHealth != null) {
    const battery = batteryCheck(listing, filters.minBatteryHealth);
    if (battery.status === 'fail') return null;
    checks.push(battery);
  }

  // The price band applies to what you'd actually pay, tax included.
  if (listing.priceEgp != null) {
    const total = listing.priceEgp + extraCostEgp;
    if (filters.priceMin != null && total < filters.priceMin) return null;
    if (filters.priceMax != null && total > filters.priceMax) return null;
  }

  return { listing, checks, extraCostEgp, possibleExtraCostEgp };
}

export function applyFilters(listings: readonly Listing[], tracker: TrackerConfig): Match[] {
  return listings
    .map((listing) => evaluate(listing, tracker))
    .filter((match): match is Match => match !== null);
}

/** What the listing will cost in total, tax included — null when the ad has no price. */
export function totalCost(match: Match): number | null {
  return match.listing.priceEgp == null ? null : match.listing.priceEgp + match.extraCostEgp;
}
