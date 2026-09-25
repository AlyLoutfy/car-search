import { describe, expect, it } from 'vitest';
import { isRepost, offerOf } from '../src/reposts';
import type { Match } from '../src/types';

function match(seller: string | null, priceEgp: number | null, storage = '256 GB'): Match {
  return {
    listing: {
      key: 'k',
      title: 'Apple - iPhone 17',
      priceEgp,
      url: 'https://www.dubizzle.com.eg/ad/1',
      imageUrl: null,
      description: null,
      attributes: { Storage: storage },
      sellerId: seller,
    },
    checks: [],
    extraCostEgp: 0,
    possibleExtraCostEgp: 0,
  };
}

const offer = (seller: string | null, price: number | null, storage?: string): string =>
  offerOf(match(seller, price, storage), ['Storage'])!;

describe('offerOf', () => {
  it('fingerprints seller, variant and price, without storing the raw seller id', () => {
    const fingerprint = offer('e805712c-c468-4534-8cb5-52ae7231a05f', 58000);
    expect(fingerprint).toMatch(/^[0-9a-f]{12}\|256 GB\|58000$/);
    expect(fingerprint).not.toContain('e805712c');
  });

  it('has nothing to go on when the page did not say who posted the ad', () => {
    expect(offerOf(match(null, 58000))).toBeUndefined();
  });
});

describe('isRepost', () => {
  it('matches the same seller re-posting at the same price', () => {
    expect(isRepost(offer('s1', 43000), [offer('s1', 43000)])).toBe(true);
  });

  it('matches a small price tweak on the repost (within 5%)', () => {
    expect(isRepost(offer('s1', 43500), [offer('s1', 42000)])).toBe(true);
  });

  it('treats a real price drop as news', () => {
    expect(isRepost(offer('s1', 38000), [offer('s1', 43000)])).toBe(false);
  });

  it('never matches a different seller, however similar the ad', () => {
    expect(isRepost(offer('s2', 43000), [offer('s1', 43000)])).toBe(false);
  });

  it('keeps a seller\'s different variants apart (a 512 GB phone is not the 256 GB one)', () => {
    expect(isRepost(offer('s1', 60000, '512 GB'), [offer('s1', 60000, '256 GB')])).toBe(false);
  });

  it('matches two unpriced ads from the same seller, but not unpriced against priced', () => {
    expect(isRepost(offer('s1', null), [offer('s1', null)])).toBe(true);
    expect(isRepost(offer('s1', null), [offer('s1', 43000)])).toBe(false);
  });
});
