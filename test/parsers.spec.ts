import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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

describe('parseSylndr', () => {
  const listings = parseSylndr(read('sylndr.html'));

  it('reads relative hrefs out of the raw page HTML, deduped by stable UUID', () => {
    // Regression: the parser once required an absolute https://sylndr.com/... URL, which only the
    // old reader-proxy markdown had. Real page HTML links relatively, so it silently found zero.
    const keys = listings.map((listing) => listing.key).sort();
    expect(keys).toEqual([
      'sylndr:25f5aadd-3bf3-4d69-add2-e6380f10daa9',
      'sylndr:6ed95b26-a5c7-41e6-bc42-74c4a86626f4',
      'sylndr:9c1f4b70-2d55-4a18-b0e1-5f3ac2d81e77',
    ]);
  });

  it('still parses absolute URLs, so either page shape works', () => {
    const parsed = parseSylndr(
      'https://sylndr.com/en/car-details/used-cars/seat/leon/6ed95b26-a5c7-41e6-bc42-74c4a86626f4',
    );
    expect(parsed.map((listing) => listing.key)).toEqual([
      'sylndr:6ed95b26-a5c7-41e6-bc42-74c4a86626f4',
    ]);
  });

  it('builds a title from the make/model path and an absolute detail URL', () => {
    const leon = listings.find((l) => l.key === 'sylndr:6ed95b26-a5c7-41e6-bc42-74c4a86626f4');
    expect(leon?.title).toBe('Seat Leon');
    expect(leon?.url).toBe(
      'https://sylndr.com/en/car-details/used-cars/seat/leon/6ed95b26-a5c7-41e6-bc42-74c4a86626f4',
    );
    expect(leon?.priceEgp).toBeNull();
    // Other models on the page are surfaced too — the title filter is what narrows a search.
    expect(listings.find((l) => l.key.endsWith('9c1f4b70-2d55-4a18-b0e1-5f3ac2d81e77'))?.title).toBe(
      'Skoda Octavia',
    );
  });
});
