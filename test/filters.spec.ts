import { describe, expect, it } from 'vitest';
import { applyFilters } from '../src/filters';
import type { Listing } from '../src/types';

function listing(overrides: Partial<Listing>): Listing {
  return {
    key: 'k',
    title: 'Seat Leon 2020',
    priceEgp: 1000000,
    url: 'https://example.com/x',
    imageUrl: null,
    site: 'dubizzle',
    ...overrides,
  };
}

describe('applyFilters', () => {
  it('returns everything when no filters are given', () => {
    const input = [listing({ key: 'a' }), listing({ key: 'b' })];
    expect(applyFilters(input)).toHaveLength(2);
  });

  it('drops listings outside the price band', () => {
    const input = [
      listing({ key: 'low', priceEgp: 800000 }),
      listing({ key: 'ok', priceEgp: 1000000 }),
      listing({ key: 'high', priceEgp: 2000000 }),
    ];
    const result = applyFilters(input, { priceMin: 900000, priceMax: 1510000 });
    expect(result.map((listed) => listed.key)).toEqual(['ok']);
  });

  it('keeps listings whose price could not be parsed', () => {
    const result = applyFilters([listing({ key: 'np', priceEgp: null })], {
      priceMin: 900000,
      priceMax: 1510000,
    });
    expect(result).toHaveLength(1);
  });

  it('requires every title keyword to be present', () => {
    const input = [
      listing({ key: 'leon', title: 'Seat Leon 2020' }),
      listing({ key: 'ibiza', title: 'Seat Ibiza 2019' }),
    ];
    const result = applyFilters(input, { titleMustInclude: ['leon'] });
    expect(result.map((listed) => listed.key)).toEqual(['leon']);
  });

  it('matches keywords against the URL too', () => {
    const result = applyFilters(
      [listing({ key: 'u', title: 'Used car', url: 'https://x.com/seat-leon-2020' })],
      { titleMustInclude: ['leon'] },
    );
    expect(result).toHaveLength(1);
  });
});
