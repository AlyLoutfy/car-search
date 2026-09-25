import { describe, expect, it } from 'vitest';
import { assertResultsPage, siteFor } from '../src/sources';

const dubizzle = siteFor('https://www.dubizzle.com.eg/en/vehicles/cars-for-sale/');

const padded = (marker: string, extra = ''): string =>
  `${marker} `.repeat(80) + extra; // > 800 chars, contains the marker

describe('siteFor', () => {
  it('recognises Dubizzle with or without "www."', () => {
    expect(siteFor('https://dubizzle.com.eg/en/mobile-phones/').name).toBe('Dubizzle');
    expect(dubizzle.name).toBe('Dubizzle');
  });

  it('rejects a site nobody has written a parser for', () => {
    expect(() => siteFor('https://sylndr.com/en/buy-used-cars')).toThrow(/not a supported site/);
  });
});

describe('assertResultsPage', () => {
  it('accepts a plausible results page', () => {
    expect(() => assertResultsPage(dubizzle, padded('dubizzle.com.eg ad EGP'))).not.toThrow();
  });

  it('rejects a too-short response (failed/empty fetch)', () => {
    expect(() => assertResultsPage(dubizzle, 'dubizzle.com.eg')).toThrow(/too short/);
  });

  it('rejects a page missing the expected site marker', () => {
    expect(() => assertResultsPage(dubizzle, padded('some-other-site.com'))).toThrow(
      /missing expected marker/,
    );
  });

  it('rejects a Cloudflare challenge page even if it mentions the site', () => {
    expect(() => assertResultsPage(dubizzle, padded('dubizzle.com.eg', 'Just a moment cf-chl'))).toThrow(
      /bot-challenge/,
    );
  });
});
