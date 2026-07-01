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
  const listings = parseDubizzle(read('dubizzle.html'));
  const byKey = (key: string) => listings.find((listing) => listing.key === key);

  it('extracts every matching ad, keyed by the stable numeric id', () => {
    expect(listings.every((listing) => /^dubizzle:\d+$/.test(listing.key))).toBe(true);
    expect(new Set(listings.map((l) => l.key)).size).toBe(listings.length); // deduped
  });

  it('includes an ad present only in the ad_ids backstop (never misses a listing)', () => {
    // 208999999 has no card, only appears in the analytics ad_ids array.
    const keys = listings.map((listing) => listing.key).sort();
    expect(keys).toEqual([
      'dubizzle:208149106',
      'dubizzle:208239498',
      'dubizzle:208274361',
      'dubizzle:208999999',
    ]);
  });

  it('builds a "Seat Leon <year>" title and a resolvable /ad/<id> link', () => {
    expect(byKey('dubizzle:208239498')?.title).toBe('Seat Leon 2020'); // year from href
    expect(byKey('dubizzle:208274361')?.title).toBe('Seat Leon 2022'); // year from encoded href
    expect(byKey('dubizzle:208149106')?.title).toBe('Seat Leon'); // Arabic-numeral year -> no year
    expect(byKey('dubizzle:208999999')?.title).toBe('Seat Leon'); // backstop-only, no card
    expect(byKey('dubizzle:208239498')?.url).toBe('https://www.dubizzle.com.eg/ad/208239498');
    // Titles always contain "Leon" so the keyword filter keeps Arabic-listed ads.
    expect(listings.every((l) => l.title.toLowerCase().includes('leon'))).toBe(true);
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
