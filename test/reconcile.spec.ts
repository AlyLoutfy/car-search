import { describe, expect, it } from 'vitest';
import { keysToPersist, reconcile } from '../src/reconcile';
import type { Listing } from '../src/types';

const listing = (key: string): Listing => ({
  key,
  title: key,
  priceEgp: null,
  url: `https://example.com/${key}`,
  imageUrl: null,
  site: 'dubizzle',
});

describe('reconcile', () => {
  it('seeds silently on the first-ever look (no previous state)', () => {
    const plan = reconcile(undefined, [listing('a'), listing('b')]);
    expect(plan.kind).toBe('seed');
    expect(plan.toAlert).toHaveLength(0);
  });

  it('alerts only genuinely-new listings in steady state', () => {
    const plan = reconcile(['a'], [listing('a'), listing('b')]);
    expect(plan.kind).toBe('diff');
    expect(plan.toAlert.map((entry) => entry.key)).toEqual(['b']);
  });

  it('alerts nothing when nothing changed', () => {
    const plan = reconcile(['a', 'b'], [listing('a'), listing('b')]);
    expect(plan.kind).toBe('diff');
    expect(plan.toAlert).toHaveLength(0);
  });

  it('still alerts a small genuine burst below the resync threshold', () => {
    const plan = reconcile(['a'], [listing('a'), listing('b'), listing('c')]);
    expect(plan.kind).toBe('diff');
    expect(plan.toAlert.map((entry) => entry.key)).toEqual(['b', 'c']);
  });

  it('resyncs silently when the entire page looks new (state loss / parser recovery)', () => {
    const listings = ['a', 'b', 'c', 'd', 'e'].map(listing);
    const plan = reconcile(['x', 'y'], listings);
    expect(plan.kind).toBe('resync');
    expect(plan.toAlert).toHaveLength(0);
  });

  it('does not resync a genuinely-empty page', () => {
    const plan = reconcile(['a'], []);
    expect(plan.kind).toBe('diff');
    expect(plan.toAlert).toHaveLength(0);
  });
});

describe('keysToPersist', () => {
  const current = ['seen', 'newA', 'newB'];
  const fresh = new Set(['newA', 'newB']);

  it('records already-seen keys plus only the freshly-delivered ones', () => {
    const delivered = new Set(['newA']); // newB's alert failed
    expect(keysToPersist(current, fresh, delivered).sort()).toEqual(['newA', 'seen']);
  });

  it('records everything when all alerts were delivered', () => {
    const delivered = new Set(['newA', 'newB']);
    expect(keysToPersist(current, fresh, delivered).sort()).toEqual(['newA', 'newB', 'seen']);
  });

  it('leaves a fresh listing unrecorded (retried next run) when its alert failed', () => {
    const delivered = new Set<string>(); // every send failed
    expect(keysToPersist(current, fresh, delivered)).toEqual(['seen']);
  });
});
