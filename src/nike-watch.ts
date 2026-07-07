import 'dotenv/config'; // load .env when running locally (no-op in CI, which sets real env vars)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, loadNikeWatches } from './config';
import { fetchSizeAvailability, isNewlyInStock, type NikeWatch } from './nike/product-feed';
import { sendTelegramMessage } from './telegram';

const STATE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'nike.json');

/** nike.json shape: { "<styleColor>:<size>": { available: boolean } } */
type NikeState = Record<string, { available: boolean }>;

function loadState(): NikeState {
  if (!existsSync(STATE_PATH)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as NikeState) : {};
  } catch {
    return {};
  }
}

function saveState(state: NikeState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInStockMessage(watch: NikeWatch, size: string): string {
  return [
    `👟 <b>In stock!</b> ${escapeHtml(watch.label)}`,
    `Size <b>EU ${escapeHtml(size)}</b> is now available.`,
    `🔗 <a href="${escapeHtml(watch.productUrl)}">Buy on Nike</a>`,
  ].join('\n');
}

async function main(): Promise<void> {
  const env = loadEnv();
  const watches = loadNikeWatches();
  const state = loadState();

  let alerts = 0;

  for (const watch of watches) {
    let results;
    try {
      results = await fetchSizeAvailability(watch);
    } catch (error) {
      // Transient/blocked fetch: leave state untouched and retry next run.
      console.warn(`⚠️  ${watch.styleColor}: ${(error as Error).message}`);
      continue;
    }

    for (const result of results) {
      if (!result.found) {
        console.warn(
          `⚠️  ${watch.styleColor}: size EU ${result.size} is not in this product's size run — check the config`,
        );
        continue;
      }

      const key = `${watch.styleColor}:${result.size}`;
      const previous = state[key]?.available;

      if (isNewlyInStock(previous, result.available)) {
        const message = formatInStockMessage(watch, result.size);
        if (env.dryRun) {
          console.log(`[dry-run] would send:\n${message}\n`);
        } else {
          await sendTelegramMessage(env, message);
        }
        alerts += 1;
        console.log(`🔔 IN STOCK: ${watch.label} — EU ${result.size}`);
      }

      state[key] = { available: result.available };
      console.log(`✓ ${watch.label} EU ${result.size}: available=${result.available}`);
    }
  }

  if (!env.dryRun) saveState(state);
  console.log(`\nDone. ${alerts} in-stock alert(s).`);
}

main().catch((error: unknown) => {
  console.error('Fatal:', error);
  process.exit(1);
});
