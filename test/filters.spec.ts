import { describe, expect, it } from 'vitest';
import { applyFilters, evaluate, totalCost } from '../src/filters';
import type { Listing, TrackerConfig } from '../src/types';

function listing(overrides: Partial<Listing>): Listing {
  return {
    key: 'k',
    title: 'Seat Leon 2020',
    priceEgp: 1000000,
    url: 'https://www.dubizzle.com.eg/ad/1',
    imageUrl: null,
    description: null,
    attributes: {},
    ...overrides,
  };
}

const tracker = (overrides: Partial<TrackerConfig> = {}): TrackerConfig => ({
  id: 't',
  label: 't',
  url: 'https://www.dubizzle.com.eg/en/x/',
  ...overrides,
});

const keysOf = (listings: Listing[], config: TrackerConfig): string[] =>
  applyFilters(listings, config).map((match) => match.listing.key);

describe('price and keyword filters', () => {
  it('keeps everything when no filters are given', () => {
    expect(keysOf([listing({ key: 'a' }), listing({ key: 'b' })], tracker())).toEqual(['a', 'b']);
  });

  it('drops listings outside the price band', () => {
    const input = [
      listing({ key: 'low', priceEgp: 800000 }),
      listing({ key: 'ok', priceEgp: 1000000 }),
      listing({ key: 'high', priceEgp: 2000000 }),
    ];
    expect(keysOf(input, tracker({ filters: { priceMin: 900000, priceMax: 1510000 } }))).toEqual(['ok']);
  });

  it('keeps listings whose price could not be parsed', () => {
    const config = tracker({ filters: { priceMin: 900000, priceMax: 1510000 } });
    expect(keysOf([listing({ key: 'np', priceEgp: null })], config)).toEqual(['np']);
  });

  it('requires every keyword in the title or description', () => {
    const input = [
      listing({ key: 'leon', title: 'Seat Leon 2020' }),
      listing({ key: 'ibiza', title: 'Seat Ibiza 2019' }),
      listing({ key: 'desc', title: 'Seat 2021', description: 'leon fr, full options' }),
    ];
    expect(keysOf(input, tracker({ filters: { titleMustInclude: ['leon'] } }))).toEqual(['leon', 'desc']);
  });
});

describe('phone tax', () => {
  const phones = tracker({ phoneTaxEgp: 18000 });

  it('keeps a taxed phone and adds the tax to what it costs', () => {
    const match = evaluate(listing({ priceEgp: 44000, description: 'عليه ضريبه' }), phones);
    expect(match?.extraCostEgp).toBe(18000);
    expect(match && totalCost(match)).toBe(62000);
    expect(match?.checks).toContainEqual({ label: 'Tax', status: 'warn', detail: 'owed (+18,000 EGP)' });
  });

  it('adds nothing when the tax is paid, and nothing certain when it is not mentioned', () => {
    const paid = evaluate(listing({ description: 'مدفوع ضريبه' }), phones);
    expect(paid?.extraCostEgp).toBe(0);
    expect(paid?.possibleExtraCostEgp).toBe(0);

    const silent = evaluate(listing({ description: 'iPhone 17 like new' }), phones);
    expect(silent?.extraCostEgp).toBe(0);
    expect(silent?.possibleExtraCostEgp).toBe(18000);
    expect(silent?.checks[0]?.status).toBe('unknown');
  });

  it('applies the price band to the total, tax included', () => {
    const capped = tracker({ phoneTaxEgp: 18000, filters: { priceMax: 60000 } });
    expect(evaluate(listing({ priceEgp: 44000, description: 'عليه ضريبه' }), capped)).toBeNull(); // 62k
    expect(evaluate(listing({ priceEgp: 44000, description: 'معفي ضريبه' }), capped)).not.toBeNull();
  });

  it('skips the tax check entirely for trackers that did not ask for it', () => {
    expect(evaluate(listing({ description: 'عليه ضريبه' }), tracker())?.checks).toEqual([]);
  });
});

describe('battery health', () => {
  const phones = tracker({ filters: { minBatteryHealth: 96 } });

  it('drops a phone whose ad states a battery below the minimum', () => {
    expect(evaluate(listing({ description: 'بطاريه ٩٥' }), phones)).toBeNull();
  });

  it('keeps one at or above it', () => {
    expect(evaluate(listing({ description: 'Battery Health: 96%' }), phones)?.checks).toEqual([
      { label: 'Battery', status: 'pass', detail: '96%' },
    ]);
  });

  it('keeps one that does not mention the battery, flagged unknown', () => {
    expect(evaluate(listing({ description: 'زيرو مفيهوش خربوش' }), phones)?.checks[0]?.status).toBe(
      'unknown',
    );
  });

  it('never drops on a bare percentage — "90%" could be the condition, not the battery', () => {
    const match = evaluate(listing({ description: 'حالته 90% زي الجديد' }), phones);
    expect(match?.checks[0]).toEqual({ label: 'Battery', status: 'unknown', detail: '90%?' });
  });
});
