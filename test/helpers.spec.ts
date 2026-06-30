import { describe, expect, it } from 'vitest';
import { hashKey, nearestPrice, parsePriceEgp, slugToTitle } from '../src/parsers/helpers';

describe('parsePriceEgp', () => {
  it('parses "985,000 EGP"', () => {
    expect(parsePriceEgp('985,000 EGP ## Seat Leon')).toBe(985000);
  });

  it('parses "EGP 1,350,000"', () => {
    expect(parsePriceEgp('Price: EGP 1,350,000')).toBe(1350000);
  });

  it('takes the asking price, not the monthly installment that follows', () => {
    expect(parsePriceEgp('1,050,000 EGP~16,986 EGP/ Month ## Seat Leon 2020')).toBe(1050000);
  });

  it('does not mistake a 4-digit year for a price', () => {
    expect(parsePriceEgp('Seat Leon 2020 1.6 A/T')).toBeNull();
  });

  it('returns null when there is no price', () => {
    expect(parsePriceEgp('no money here')).toBeNull();
  });
});

describe('slugToTitle', () => {
  it('title-cases a hyphenated slug', () => {
    expect(slugToTitle('seat-leon-2020')).toBe('Seat Leon 2020');
  });
});

describe('nearestPrice', () => {
  it('finds a price within the window around the index', () => {
    const text = 'prefix EGP 1,200,000 ... MARKER ... tail';
    const index = text.indexOf('MARKER');
    expect(nearestPrice(text, index)).toBe(1200000);
  });
});

describe('hashKey', () => {
  it('is deterministic and stable for the same inputs', () => {
    expect(hashKey('seat leon 2018', 985000)).toBe(hashKey('seat leon 2018', 985000));
  });

  it('differs for different inputs', () => {
    expect(hashKey('seat leon 2018', 985000)).not.toBe(hashKey('seat leon 2018', 990000));
  });
});
