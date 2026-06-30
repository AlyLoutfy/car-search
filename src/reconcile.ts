import type { Listing } from './types';

export type ReconcileKind = 'seed' | 'diff' | 'resync';

export interface ReconcilePlan {
  /**
   * - `seed`   — first time we've ever looked at this (search, site): record silently.
   * - `resync` — the whole page suddenly looks new (state loss / parser recovery / redesign):
   *              re-record silently instead of blasting the user with a page of stale cars.
   * - `diff`   — normal case: alert the genuinely-new listings.
   */
  readonly kind: ReconcileKind;
  /** Listings to alert on (empty for `seed` and `resync`). */
  readonly toAlert: readonly Listing[];
}

export interface ReconcileOptions {
  /**
   * If at least this many listings are present AND every one of them looks new, assume the
   * "new"-ness is an artifact (lost state, recovered parser) rather than reality, and resync
   * silently instead of alerting. Genuine bursts (a few new cars among known ones) are unaffected.
   */
  readonly resyncThreshold?: number;
}

/**
 * Decide what to do for one (search, site) given the previously-seen keys and the listings
 * found this run. Pure function — no I/O — so the alert/seed/resync policy is unit-testable.
 */
export function reconcile(
  previousKeys: readonly string[] | undefined,
  listings: readonly Listing[],
  options: ReconcileOptions = {},
): ReconcilePlan {
  const resyncThreshold = options.resyncThreshold ?? 4;

  if (previousKeys === undefined) {
    return { kind: 'seed', toAlert: [] };
  }

  const previousSet = new Set(previousKeys);
  const fresh = listings.filter((listing) => !previousSet.has(listing.key));

  if (fresh.length >= resyncThreshold && fresh.length === listings.length) {
    return { kind: 'resync', toAlert: [] };
  }

  return { kind: 'diff', toAlert: fresh };
}

/**
 * After alerting, decide which of this run's keys are safe to record as seen. A fresh listing is
 * recorded only if its alert was actually delivered; a fresh-but-failed alert is left unrecorded
 * so it is retried next run. Keys that were already seen (not fresh) are always recorded.
 */
export function keysToPersist(
  currentKeys: readonly string[],
  freshKeys: ReadonlySet<string>,
  deliveredKeys: ReadonlySet<string>,
): string[] {
  return currentKeys.filter((key) => !freshKeys.has(key) || deliveredKeys.has(key));
}
