import type { Listing, TrackerConfig } from './types';
import { applyFilters } from './filters';
import { marketPeers } from './market';
import { formatDigestMessage, formatListingMessage } from './notifier';
import { keysToPersist, reconcile } from './reconcile';
import { getSeen, mergeSeen, setSeen, type SeenState } from './state';

/** The I/O one tracker run needs, injected so the bookkeeping below can be tested offline. */
export interface TrackDeps {
  readonly collect: (url: string) => Promise<Listing[]>;
  readonly send: (html: string, options?: { preview?: boolean }) => Promise<void>;
}

export interface TrackOutcome {
  /** `failed` — the link couldn't be read this run; its state was left untouched. */
  readonly kind: 'failed' | 'seed' | 'resync' | 'diff';
  readonly matches: number;
  readonly sent: number;
  readonly sendFailures: number;
}

/**
 * Check one tracked link: fetch it, filter, work out what's new, message about it, and record in
 * `state` exactly what was handled. Never throws — a failure is reported in the outcome.
 */
export async function trackLink(
  tracker: TrackerConfig,
  state: SeenState,
  deps: TrackDeps,
): Promise<TrackOutcome> {
  let matches;
  try {
    matches = applyFilters(await deps.collect(tracker.url), tracker);
  } catch (error) {
    // Fetch/parse/validation failure: leave this tracker's state untouched and retry next run.
    console.warn(`⚠️  ${tracker.id}: ${(error as Error).message}`);
    return { kind: 'failed', matches: 0, sent: 0, sendFailures: 0 };
  }

  const currentKeys = matches.map((match) => match.listing.key);
  const previous = getSeen(state, tracker.id, tracker.url);
  const plan = reconcile(previous, matches);
  const peers = marketPeers(matches);

  if (plan.kind === 'seed') {
    // A new (or edited) link: one digest of what's on the market now, not an alert per ad.
    // Recorded even if the digest fails to send — retrying it would mean alerting every ad.
    setSeen(state, tracker.id, tracker.url, currentKeys);
    try {
      await deps.send(formatDigestMessage(tracker, matches, peers), { preview: false });
      console.log(`🌱 seeded ${tracker.id} with ${matches.length} match(es)`);
      return { kind: 'seed', matches: matches.length, sent: 1, sendFailures: 0 };
    } catch (error) {
      console.warn(`⚠️  digest failed for ${tracker.id}: ${(error as Error).message}`);
      return { kind: 'seed', matches: matches.length, sent: 0, sendFailures: 1 };
    }
  }

  if (plan.kind === 'resync') {
    // The whole page suddenly looks new (state loss / parser recovery): record silently.
    setSeen(state, tracker.id, tracker.url, mergeSeen(previous ?? [], currentKeys));
    console.warn(
      `🔁 resynced ${tracker.id}: all ${matches.length} match(es) looked new — ` +
        're-recorded without alerting',
    );
    return { kind: 'resync', matches: matches.length, sent: 0, sendFailures: 0 };
  }

  // Normal diff: alert the fresh matches, but only mark one seen once its alert has actually been
  // delivered — a failed send is retried on the next run, never lost.
  const freshKeys = new Set(plan.toAlert.map((match) => match.listing.key));
  const delivered = new Set<string>();
  let sendFailures = 0;
  for (const match of plan.toAlert) {
    try {
      await deps.send(formatListingMessage(tracker, match, peers));
      delivered.add(match.listing.key);
      console.log(`🔔 NEW ${tracker.id}: ${match.listing.title} — ${match.listing.url}`);
    } catch (error) {
      sendFailures += 1;
      console.warn(
        `⚠️  alert failed for ${tracker.id} (${match.listing.title}): ${(error as Error).message}`,
      );
    }
  }

  const persistable = keysToPersist(currentKeys, freshKeys, delivered);
  setSeen(state, tracker.id, tracker.url, mergeSeen(previous ?? [], persistable));
  console.log(`✓ ${tracker.id}: ${matches.length} match(es), ${delivered.size} alerted`);
  return { kind: 'diff', matches: matches.length, sent: delivered.size, sendFailures };
}

/**
 * Why this run should fail the job, if it should. A failed job is how GitHub tells you (by email)
 * that something is broken; a run that quietly logs warnings every hour tells you nothing.
 */
export function failureReason(outcomes: readonly TrackOutcome[]): string | undefined {
  if (outcomes.length > 0 && outcomes.every((outcome) => outcome.kind === 'failed')) {
    return 'no tracked link could be read — the site may be blocking requests or have changed';
  }
  const attempted = outcomes.reduce((sum, outcome) => sum + outcome.sent + outcome.sendFailures, 0);
  const failed = outcomes.reduce((sum, outcome) => sum + outcome.sendFailures, 0);
  if (failed > 0 && failed === attempted) {
    return 'every Telegram message failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID';
  }
  return undefined;
}
