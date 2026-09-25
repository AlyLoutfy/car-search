import { describe, expect, it } from 'vitest';
import { marketPeers, marketPosition } from '../src/market';
import type { Match } from '../src/types';

function match(key: string, priceEgp: number | null, overrides: Partial<Match> = {}, storage = '256 GB'): Match {
  return {
    listing: {
      key,
      title: 'Apple - iPhone 17',
      priceEgp,
      url: `https://www.dubizzle.com.eg/ad/${key}`,
      imageUrl: null,
      description: null,
      attributes: { Storage: storage },
    },
    checks: [],
    extraCostEgp: 0,
    possibleExtraCostEgp: 0,
    ...overrides,
  };
}

const market = [55000, 58000, 60000, 60000, 62000, 65000].map((price, index) => match(`m${index}`, price));

describe('marketPeers', () => {
  it('leaves out ads whose total cost is uncertain or unknown', () => {
    const peers = marketPeers([
      match('sure', 60000),
      match('taxed', 42000, { extraCostEgp: 18000 }),
      match('maybe-taxed', 42000, { possibleExtraCostEgp: 18000 }),
      match('unpriced', null),
    ]);
    expect(peers.map((peer) => peer.listing.key)).toEqual(['sure', 'taxed']);
  });
});

describe('marketPosition', () => {
  it('places a price against the median of the other ads', () => {
    const self = match('self', 54000);
    const position = marketPosition(54000, self, market);
    expect(position?.medianEgp).toBe(60000);
    expect(position?.vsMedian).toBeCloseTo(-0.1);
    expect(position?.verdict).toBe('great');
    expect(position?.cheaperThan).toBe(1); // every other ad costs more
  });

  it('prices taxed peers at their total, tax included', () => {
    // Five taxed phones listed at 42k are really 60k phones; the median must say 60k, not 42k.
    const taxed = [1, 2, 3, 4, 5].map((index) => match(`t${index}`, 42000, { extraCostEgp: 18000 }));
    expect(marketPosition(60000, match('self', 60000), taxed)?.medianEgp).toBe(60000);
  });

  it('narrows to ads sharing the compareBy attributes when there are enough of them', () => {
    const big = [70000, 72000, 74000, 75000, 76000].map((price, index) =>
      match(`b${index}`, price, {}, '512 GB'),
    );
    const self = match('self', 74000, {}, '512 GB');
    const position = marketPosition(74000, self, [...market, ...big], ['Storage']);
    expect(position?.scope).toBe('512 GB');
    expect(position?.medianEgp).toBe(74000);
  });

  it('widens to the whole market when too few ads share the attributes', () => {
    const self = match('self', 74000, {}, '512 GB');
    const position = marketPosition(74000, self, [...market, match('b', 75000, {}, '512 GB')], ['Storage']);
    expect(position?.scope).toBe('');
    expect(position?.peerCount).toBe(7);
  });

  it('trims junk prices (placeholders, "wanted" ads) before taking the median', () => {
    const withJunk = [...market, match('junk1', 665), match('junk2', 4999)];
    expect(marketPosition(60000, match('self', 60000), withJunk)?.peerCount).toBe(6);
  });

  it('says nothing when there are too few ads to compare against', () => {
    expect(marketPosition(60000, match('self', 60000), market.slice(0, 3))).toBeNull();
  });

  it('does not count the listing against itself', () => {
    const self = market[0]!;
    expect(marketPosition(55000, self, market)?.peerCount).toBe(5);
  });
});
