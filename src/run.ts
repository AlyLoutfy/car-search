import 'dotenv/config'; // load .env when running locally (no-op in CI, which sets real env vars)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, loadSearches } from './config';
import { collectSource } from './sources';
import { notifyListing } from './notifier';
import { keysToPersist, reconcile } from './reconcile';
import { getSeen, loadState, mergeSeen, saveState, setSeen } from './state';

const STATE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'seen.json');

async function main(): Promise<void> {
  const env = loadEnv();
  const searches = loadSearches();
  const state = loadState(STATE_PATH);

  let alertsSent = 0;
  let seeded = 0;
  let resynced = 0;
  let sendFailures = 0;

  try {
    for (const search of searches) {
      for (const source of search.sources) {
        let listings;
        try {
          listings = await collectSource(search, source);
        } catch (error) {
          // Fetch/parse/validation failure: leave this source's state untouched and retry next run.
          console.warn(`⚠️  ${search.id}/${source.site}: ${(error as Error).message}`);
          continue;
        }

        const currentKeys = listings.map((listing) => listing.key);
        const previous = getSeen(state, search.id, source.site);
        const plan = reconcile(previous, listings);

        // First-ever look, or the whole page suddenly looks new (state loss / parser recovery):
        // record silently, never alert.
        if (plan.kind !== 'diff') {
          const persisted =
            previous === undefined ? currentKeys : mergeSeen(previous, currentKeys);
          setSeen(state, search.id, source.site, persisted);
          if (plan.kind === 'seed') {
            seeded += listings.length;
            console.log(
              `🌱 seeded ${search.id}/${source.site} with ${listings.length} listing(s) (no alerts on first run)`,
            );
          } else {
            resynced += 1;
            console.warn(
              `🔁 resynced ${search.id}/${source.site}: all ${listings.length} listing(s) looked new — re-recorded without alerting`,
            );
          }
          continue;
        }

        // Normal diff: alert the fresh listings, but only mark a listing seen once its alert
        // has actually been delivered — a failed send is retried on the next run, never lost.
        const freshKeys = new Set(plan.toAlert.map((listing) => listing.key));
        const delivered = new Set<string>();
        for (const listing of plan.toAlert) {
          try {
            await notifyListing(env, search, listing);
            delivered.add(listing.key);
            alertsSent += 1;
            console.log(`🔔 NEW ${search.id}/${source.site}: ${listing.title} — ${listing.url}`);
          } catch (error) {
            sendFailures += 1;
            console.warn(
              `⚠️  alert failed for ${search.id}/${source.site} (${listing.title}): ${(error as Error).message}`,
            );
          }
        }

        const persistable = keysToPersist(currentKeys, freshKeys, delivered);
        setSeen(state, search.id, source.site, mergeSeen(previous ?? [], persistable));
        console.log(
          `✓ ${search.id}/${source.site}: ${listings.length} listing(s), ${delivered.size} alerted`,
        );
      }
    }
  } finally {
    // Persist whatever progress we made, even if something above threw — never lose bookkeeping.
    if (!env.dryRun) saveState(STATE_PATH, state);
  }

  console.log(
    `\nDone. ${alertsSent} alert(s) sent, ${seeded} seeded, ${resynced} resynced, ${sendFailures} send failure(s).`,
  );
}

main().catch((error: unknown) => {
  console.error('Fatal:', error);
  process.exit(1);
});
