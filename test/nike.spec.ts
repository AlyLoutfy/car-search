import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildFeedUrl,
  isNewlyInStock,
  parseSizeAvailability,
  type NikeWatch,
} from '../src/nike/product-feed';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const feedJson = readFileSync(resolve(fixtures, 'nike-product-feed.json'), 'utf8');

const watch: NikeWatch = {
  label: 'Nike Dunk Low Retro SE',
  productUrl: 'https://www.nike.com/fr/t/x/IH1942-001',
  styleColor: 'IH1942-001',
  marketplace: 'FR',
  language: 'fr',
  sizes: ['43'],
};

describe('buildFeedUrl', () => {
  it('targets the product-feed API filtered by styleColor + marketplace', () => {
    const url = buildFeedUrl(watch);
    expect(url).toContain('api.nike.com/product_feed/threads/v2/');
    expect(url).toContain('marketplace(FR)');
    expect(url).toContain('styleColor(IH1942-001)');
  });
});

describe('parseSizeAvailability', () => {
  it('reads EU 43 as out of stock from the real captured response', () => {
    const [result] = parseSizeAvailability(feedJson, ['43']);
    expect(result).toEqual({ size: '43', found: true, available: false });
  });

  it('reports an in-stock size as available (EU 39 is in stock in the fixture)', () => {
    const [result] = parseSizeAvailability(feedJson, ['39']);
    expect(result).toEqual({ size: '39', found: true, available: true });
  });

  it('flags a size that is not in the product size run (typo / removed)', () => {
    const [result] = parseSizeAvailability(feedJson, ['99']);
    expect(result).toEqual({ size: '99', found: false, available: false });
  });

  it('throws on a non-feed payload so a blocked fetch is retried, not read as out-of-stock', () => {
    expect(() => parseSizeAvailability('Access Denied', ['43'])).toThrow();
    expect(() => parseSizeAvailability('{"objects":[]}', ['43'])).toThrow(/no productInfo/);
  });
});

describe('isNewlyInStock (rising edge)', () => {
  it('alerts when a size flips from out-of-stock to in-stock', () => {
    expect(isNewlyInStock(false, true)).toBe(true);
  });

  it('alerts on the first-ever run if the size is already in stock', () => {
    expect(isNewlyInStock(undefined, true)).toBe(true);
  });

  it('does not re-alert while a size stays in stock', () => {
    expect(isNewlyInStock(true, true)).toBe(false);
  });

  it('stays silent while out of stock, and re-arms after selling out', () => {
    expect(isNewlyInStock(undefined, false)).toBe(false);
    expect(isNewlyInStock(true, false)).toBe(false); // sold out -> no alert, but now re-armed
  });
});
