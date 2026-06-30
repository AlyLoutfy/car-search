import { describe, expect, it } from 'vitest';
import { getSeen, mergeSeen, setSeen, type SeenState } from '../src/state';

describe('getSeen / setSeen', () => {
  it('returns undefined for a (search, site) never recorded (first-run signal)', () => {
    const state: SeenState = {};
    expect(getSeen(state, 'seat-leon', 'dubizzle')).toBeUndefined();
  });

  it('round-trips recorded keys', () => {
    const state: SeenState = {};
    setSeen(state, 'seat-leon', 'dubizzle', ['a', 'b']);
    expect(getSeen(state, 'seat-leon', 'dubizzle')).toEqual(['a', 'b']);
    // An empty array is "seen, nothing there" — distinct from undefined (never looked).
    setSeen(state, 'seat-leon', 'sylndr', []);
    expect(getSeen(state, 'seat-leon', 'sylndr')).toEqual([]);
  });
});

describe('mergeSeen', () => {
  it('appends only genuinely-new keys', () => {
    expect(mergeSeen(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('does not re-add keys that are still present', () => {
    expect(mergeSeen(['a'], ['a'])).toEqual(['a']);
  });

  it('never evicts a still-present key, even past the cap', () => {
    const present = Array.from({ length: 1600 }, (_, index) => `p-${index}`);
    const merged = mergeSeen(present, present, 1500);
    // Cap is exceeded rather than dropping a live key (which would re-alert it).
    expect(merged).toHaveLength(1600);
    expect(merged.includes('p-0')).toBe(true);
  });

  it('evicts only departed keys, oldest-first, when over the cap', () => {
    const previous = [...Array.from({ length: 1500 }, (_, index) => `gone-${index}`), 'live'];
    const merged = mergeSeen(previous, ['live'], 10);
    expect(merged.includes('live')).toBe(true); // still present → always kept
    expect(merged).toHaveLength(10); // 9 most-recent departed + the live key
    expect(merged.includes('gone-1499')).toBe(true); // most recent departed kept
    expect(merged.includes('gone-0')).toBe(false); // oldest departed dropped
  });
});
