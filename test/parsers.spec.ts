import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseContactCars } from '../src/parsers/contactcars';
import { parseDubizzle } from '../src/parsers/dubizzle';
import { parseSylndr } from '../src/parsers/sylndr';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string): string => readFileSync(resolve(fixtures, name), 'utf8');

describe('parseDubizzle', () => {
  const listings = parseDubizzle(read('dubizzle.jina.md'));

  it('extracts listings keyed by the stable ad ID', () => {
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((listing) => /^dubizzle:\d+$/.test(listing.key))).toBe(true);
  });

  it('finds a known SEAT Leon ad and builds its canonical URL', () => {
    const known = listings.find((listing) => listing.key === 'dubizzle:208239498');
    expect(known).toBeDefined();
    expect(known?.url).toBe('https://www.dubizzle.com.eg/en/ad/seat-leon-2020-ID208239498');
    expect(known?.title.toLowerCase()).toContain('leon');
  });

  it('deduplicates repeated occurrences of the same ad', () => {
    const keys = listings.map((listing) => listing.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('parseContactCars', () => {
  const listings = parseContactCars(read('contactcars.jina.md'));

  it('extracts price + title cards', () => {
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((listing) => listing.key.startsWith('contactcars:'))).toBe(true);
  });

  it('parses the asking price and a Leon title', () => {
    const withPrice = listings.filter((listing) => listing.priceEgp != null);
    expect(withPrice.length).toBeGreaterThan(0);
    expect(listings.some((listing) => listing.title.toLowerCase().includes('leon'))).toBe(true);
    // Asking prices for this search live in a sane band, never the tiny installment figure.
    expect(withPrice.every((listing) => (listing.priceEgp ?? 0) > 100000)).toBe(true);
  });

  it('keys on the stable per-listing id and links to the actual car detail page', () => {
    expect(listings.every((listing) => /^contactcars:[a-f0-9]{6,}$/.test(listing.key))).toBe(true);
    expect(
      listings.every((listing) =>
        /\/en\/used-cars\/[a-z0-9-]+\/[a-f0-9]{6,}$/.test(listing.url),
      ),
    ).toBe(true);
    // Distinct per-car ids — no two real cars collapse onto one key.
    expect(new Set(listings.map((listing) => listing.key)).size).toBe(listings.length);
  });
});

describe('parseSylndr', () => {
  const listings = parseSylndr(read('sylndr.jina.md'));

  it('extracts in-stock SEAT Leons keyed by their stable UUID', () => {
    const keys = listings.map((listing) => listing.key).sort();
    expect(keys).toEqual([
      'sylndr:25f5aadd-3bf3-4d69-add2-e6380f10daa9',
      'sylndr:6ed95b26-a5c7-41e6-bc42-74c4a86626f4',
    ]);
  });

  it('builds a title from the make/model path and a clean detail URL', () => {
    const first = listings[0];
    expect(first?.title).toBe('Seat Leon');
    expect(first?.url).toContain('/en/car-details/used-cars/seat/leon/');
    expect(first?.priceEgp).toBeNull();
  });
});
