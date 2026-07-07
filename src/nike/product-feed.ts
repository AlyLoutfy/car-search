import { z } from 'zod';
import { fetchViaJina } from '../fetchers';

// The Nike.com consumer channel id — constant across products/markets.
const NIKE_CHANNEL_ID = 'd9a5bc42-4b9c-4976-858a-f159cf99c647';

export interface NikeWatch {
  readonly label: string;
  /** Product page URL — used only as the "buy" link in the alert. */
  readonly productUrl: string;
  /** Style-colour code from the URL, e.g. "IH1942-001". Drives the API lookup. */
  readonly styleColor: string;
  readonly marketplace: string; // e.g. "FR"
  readonly language: string; // e.g. "fr"
  /** Localised sizes to watch, as shown on the site, e.g. ["43", "43.5"]. */
  readonly sizes: readonly string[];
}

export interface SizeAvailability {
  readonly size: string;
  /** Whether this size exists in the product's size run at all (guards typos / removed sizes). */
  readonly found: boolean;
  readonly available: boolean;
}

// Nike's product-feed response is huge; validate only the slice we depend on.
const feedSchema = z.object({
  objects: z
    .array(
      z.object({
        productInfo: z
          .array(
            z.object({
              skus: z
                .array(
                  z.object({
                    id: z.string(),
                    nikeSize: z.string().optional(),
                    countrySpecifications: z
                      .array(z.object({ country: z.string().optional(), localizedSize: z.string().optional() }))
                      .optional(),
                  }),
                )
                .optional(),
              availableSkus: z
                .array(z.object({ id: z.string(), available: z.boolean().optional() }))
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export function buildFeedUrl(watch: NikeWatch): string {
  return (
    'https://api.nike.com/product_feed/threads/v2/' +
    `?filter=marketplace(${watch.marketplace})` +
    `&filter=language(${watch.language})` +
    `&filter=channelId(${NIKE_CHANNEL_ID})` +
    `&filter=productInfo.merchProduct.styleColor(${watch.styleColor})`
  );
}

/**
 * Parse Nike's product-feed JSON into per-size availability.
 *
 * A size is `available` when its SKU is listed in `availableSkus` with `available: true`.
 * Throws if the payload isn't a valid, non-empty feed (so a transient/blocked fetch is retried
 * next run rather than being read as "out of stock").
 */
export function parseSizeAvailability(rawJson: string, sizes: readonly string[]): SizeAvailability[] {
  const start = rawJson.indexOf('{');
  if (start < 0) throw new Error('Nike feed: no JSON found in response');

  const feed = feedSchema.parse(JSON.parse(rawJson.slice(start)));
  const productInfo = feed.objects?.[0]?.productInfo?.[0];
  if (!productInfo) {
    throw new Error('Nike feed: no productInfo (empty result — wrong styleColor/marketplace, or blocked)');
  }

  const skus = productInfo.skus ?? [];
  const availableById = new Map(
    (productInfo.availableSkus ?? []).map((sku) => [sku.id, sku.available === true]),
  );

  return sizes.map((size) => {
    const sku = skus.find((candidate) =>
      (candidate.countrySpecifications ?? []).some((spec) => spec.localizedSize === size),
    );
    if (!sku) return { size, found: false, available: false };
    return { size, found: true, available: availableById.get(sku.id) === true };
  });
}

/** Fetch Nike's product feed through Jina (keyless — free, and bypasses Nike's Akamai block). */
export async function fetchSizeAvailability(watch: NikeWatch): Promise<SizeAvailability[]> {
  const raw = await fetchViaJina(buildFeedUrl(watch), {
    returnFormat: 'text',
    noCache: true,
    timeoutMs: 60_000,
  });
  return parseSizeAvailability(raw, watch.sizes);
}

/** Rising-edge test: alert only when a size flips into stock (or is already in stock on first run). */
export function isNewlyInStock(
  previousAvailable: boolean | undefined,
  currentAvailable: boolean,
): boolean {
  return currentAvailable && previousAvailable !== true;
}
