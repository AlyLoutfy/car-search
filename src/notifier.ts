import type { AppEnv } from './config';
import type { Listing, SearchConfig, SiteId } from './types';
import { sendTelegramMessage } from './telegram';

const SITE_LABELS: Record<SiteId, string> = {
  contactcars: 'ContactCars',
  dubizzle: 'Dubizzle',
  sylndr: 'Sylndr',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(priceEgp: number | null): string {
  return priceEgp == null ? 'Price N/A' : `${priceEgp.toLocaleString('en-US')} EGP`;
}

/** Build the Telegram HTML message for a newly-found listing. */
export function formatListingMessage(search: SearchConfig, listing: Listing): string {
  return [
    `🚗 <b>New match — ${escapeHtml(search.label)}</b>`,
    `<b>${escapeHtml(listing.title)}</b>`,
    `💰 ${formatPrice(listing.priceEgp)}  ·  📍 ${SITE_LABELS[listing.site]}`,
    `🔗 <a href="${escapeHtml(listing.url)}">View listing</a>`,
  ].join('\n');
}

export async function notifyListing(
  env: AppEnv,
  search: SearchConfig,
  listing: Listing,
): Promise<void> {
  const message = formatListingMessage(search, listing);
  if (env.dryRun) {
    console.log(`[dry-run] would send:\n${message}\n`);
    return;
  }
  await sendTelegramMessage(env, message);
}
