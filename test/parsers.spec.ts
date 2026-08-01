import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyFilters } from '../src/filters';
import { parseDubizzle } from '../src/parsers/dubizzle';
import { parseSylndr } from '../src/parsers/sylndr';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string): string => readFileSync(resolve(fixtures, name), 'utf8');

const LEON_SEARCH_URL =
  'https://www.dubizzle.com.eg/en/vehicles/cars-for-sale/used/seat/model-leon/?filter=mileage_max_90000';

describe('parseDubizzle', () => {
  const listings = parseDubizzle(read('dubizzle.html'), LEON_SEARCH_URL);
  const byKey = (key: string) => listings.find((listing) => listing.key === key);

  it('extracts every matching ad, keyed by the stable numeric id', () => {
    expect(listings.every((listing) => /^dubizzle:\d+$/.test(listing.key))).toBe(true);
    expect(new Set(listings.map((l) => l.key)).size).toBe(listings.length); // deduped
  });

  it('includes an ad present only in the ad_ids backstop (never misses a listing)', () => {
    // 208777777 has a card but no JSON-LD; 208999999 has neither, only the analytics array.
    const keys = listings.map((listing) => listing.key).sort();
    expect(keys).toEqual([
      'dubizzle:208149106',
      'dubizzle:208239498',
      'dubizzle:208274361',
      'dubizzle:208555001',
      'dubizzle:208777777',
      'dubizzle:208999999',
    ]);
  });

  it('reads the asking price out of the structured data', () => {
    expect(byKey('dubizzle:208239498')?.priceEgp).toBe(1225000);
    expect(byKey('dubizzle:208274361')?.priceEgp).toBe(1300000);
    expect(byKey('dubizzle:208555001')?.priceEgp).toBe(2400000);
  });

  it('leaves price null for an ad the structured data missed, so it is surfaced not dropped', () => {
    expect(byKey('dubizzle:208777777')?.priceEgp).toBeNull();
    expect(byKey('dubizzle:208999999')?.priceEgp).toBeNull();
  });

  it('titles every ad in Latin script, including Arabic-headline ads', () => {
    expect(byKey('dubizzle:208239498')?.title).toBe('Seat Leon 2020');
    expect(byKey('dubizzle:208274361')?.title).toBe('Seat Leon 2022'); // headline is Arabic
    expect(byKey('dubizzle:208149106')?.title).toBe('Seat Leon 2020'); // headline is Arabic
    // Falls back to the search URL's make/model when the structured data has nothing.
    expect(byKey('dubizzle:208777777')?.title).toBe('Seat Leon 2019'); // year from the card href
    expect(byKey('dubizzle:208999999')?.title).toBe('Seat Leon');
    // Every title stays matchable by `titleMustInclude: ["leon"]` — an Arabic seller headline
    // would silently fail that filter and the car would never be alerted.
    expect(listings.every((l) => l.title.toLowerCase().includes('leon'))).toBe(true);
  });

  it('captures the thumbnail and a resolvable /ad/<id> link', () => {
    expect(byKey('dubizzle:208239498')?.url).toBe('https://www.dubizzle.com.eg/ad/208239498');
    expect(byKey('dubizzle:208239498')?.imageUrl).toBe(
      'https://images.dubizzle.com.eg/thumbnails/178635000-600x450.webp',
    );
    expect(byKey('dubizzle:208149106')?.imageUrl).toBeNull(); // no image in its entry
  });

  it('survives a malformed JSON-LD block without losing the valid one', () => {
    // The fixture contains a deliberately broken second <script type="application/ld+json">.
    expect(byKey('dubizzle:208239498')?.priceEgp).toBe(1225000);
  });

  it('produces prices the configured band can actually act on', () => {
    // The whole point of parsing price: before this, every Dubizzle listing had priceEgp === null,
    // so priceMin/priceMax in config/searches.json were inert and a 2.4M car would still alert.
    const kept = applyFilters(listings, { priceMin: 900000, priceMax: 1510000 });
    expect(kept.map((l) => l.key)).not.toContain('dubizzle:208555001'); // 2,400,000 — over band
    expect(kept.map((l) => l.key)).toContain('dubizzle:208239498'); // 1,225,000 — in band
    expect(kept.map((l) => l.key)).toContain('dubizzle:208999999'); // unpriced — surfaced, not lost
  });

  it('does not hardcode a make/model — a different search yields that search\'s car', () => {
    const golfPage = `<html><body>
      <a href="ad/vw-golf-2021-ID300111222.html" title="VW Golf 2021"></a>
      <script id="a">window.dataLayer.push({"ad_ids":["300111222"]});</script>
      </body></html>`;
    const parsed = parseDubizzle(
      golfPage,
      'https://www.dubizzle.com.eg/en/vehicles/cars-for-sale/used/volkswagen/model-golf/',
    );
    expect(parsed[0]?.title).toBe('Volkswagen Golf 2021');
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
