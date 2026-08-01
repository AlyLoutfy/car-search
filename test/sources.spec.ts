import { describe, expect, it } from 'vitest';
import { assertResultsPage } from '../src/sources';

const padded = (marker: string, extra = ''): string =>
  `${marker} `.repeat(80) + extra; // > 800 chars, contains the marker

describe('assertResultsPage', () => {
  it('accepts a plausible results page', () => {
    expect(() => assertResultsPage('dubizzle', padded('dubizzle.com.eg ad EGP'))).not.toThrow();
  });

  it('rejects a too-short response (failed/empty fetch)', () => {
    expect(() => assertResultsPage('dubizzle', 'dubizzle.com.eg')).toThrow(/too short/);
  });

  it('rejects a page missing the expected site marker', () => {
    expect(() => assertResultsPage('sylndr', padded('some-other-site.com'))).toThrow(
      /missing expected marker/,
    );
  });

  it('rejects a Cloudflare challenge page even if it mentions the site', () => {
    expect(() =>
      assertResultsPage('dubizzle', padded('dubizzle.com.eg', 'Just a moment cf-chl')),
    ).toThrow(/bot-challenge/);
  });
});
