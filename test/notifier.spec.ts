import { describe, expect, it } from 'vitest';
import { formatDigestMessage, formatListingMessage } from '../src/notifier';
import type { Listing, Match, TrackerConfig } from '../src/types';

const tracker: TrackerConfig = {
  id: 'iphone-17',
  label: 'iPhone 17 · used',
  url: 'https://www.dubizzle.com.eg/en/x/',
  details: ['Storage'],
};

const listing: Listing = {
  key: 'dubizzle:208239498',
  title: 'Apple - iPhone 17',
  priceEgp: 58000,
  url: 'https://www.dubizzle.com.eg/ad/208239498',
  imageUrl: null,
  description: 'iPhone 17 بطاريه 98% معفي ضريبه',
  attributes: { Storage: '256 GB' },
};

const match = (overrides: Partial<Match> = {}, listingOverrides: Partial<Listing> = {}): Match => ({
  listing: { ...listing, ...listingOverrides },
  checks: [],
  extraCostEgp: 0,
  possibleExtraCostEgp: 0,
  ...overrides,
});

const peers = [55000, 58000, 60000, 60000, 62000, 65000].map((price, index) =>
  match({}, { key: `peer${index}`, priceEgp: price }),
);

describe('formatListingMessage', () => {
  it('includes the title, requested details, price, description and link', () => {
    const message = formatListingMessage(tracker, match());
    expect(message).toContain('Apple - iPhone 17');
    expect(message).toContain('Storage: 256 GB');
    expect(message).toContain('58,000 EGP');
    expect(message).toContain('معفي ضريبه');
    expect(message).toContain(`href="${listing.url}"`);
  });

  it('spells out the total for a phone that still owes tax', () => {
    const message = formatListingMessage(tracker, match({ extraCostEgp: 18000 }, { priceEgp: 44000 }));
    expect(message).toContain('44,000 EGP + 18,000 EGP tax = <b>62,000 EGP</b>');
  });

  it('shows what an ad would cost if the tax it does not mention turns out to be owed', () => {
    const message = formatListingMessage(tracker, match({ possibleExtraCostEgp: 18000 }));
    expect(message).toContain('58,000 EGP (76,000 EGP if tax is owed)');
  });

  it('shows the checks with their status', () => {
    const message = formatListingMessage(
      tracker,
      match({
        checks: [
          { label: 'Tax', status: 'pass', detail: 'paid / exempt' },
          { label: 'Battery', status: 'unknown', detail: 'not mentioned' },
        ],
      }),
    );
    expect(message).toContain('✅ Tax: paid / exempt');
    expect(message).toContain('❓ Battery: not mentioned');
  });

  it('places the price in its market', () => {
    const message = formatListingMessage(tracker, match({}, { priceEgp: 54000 }), peers);
    expect(message).toContain('🔥 Great deal — 10% below the median');
    expect(message).toContain('60,000 EGP across 6 comparable ads');
  });

  it('gives both verdicts when the tax is not mentioned', () => {
    const message = formatListingMessage(tracker, match({ possibleExtraCostEgp: 18000 }, { priceEgp: 42000 }), peers);
    expect(message).toContain('If tax-free: 🔥 Great deal');
    expect(message).toContain('If tax is owed: ➖ Fair price');
  });

  it('shows a fallback when the price is unknown', () => {
    expect(formatListingMessage(tracker, match({}, { priceEgp: null }))).toContain('Price N/A');
  });

  it('leads with a zero-width link to the thumbnail so Telegram shows the photo', () => {
    const image = 'https://images.dubizzle.com.eg/thumbnails/178635000-600x450.webp';
    const message = formatListingMessage(tracker, match({}, { imageUrl: image }));
    // Must be the first link in the text — Telegram previews whichever link comes first.
    expect(message.indexOf(image)).toBeLessThan(message.indexOf(listing.url));
    expect(message).toContain(`<a href="${image}">&#8203;</a>`);
  });

  it('omits the photo anchor entirely when there is no image', () => {
    expect(formatListingMessage(tracker, match())).not.toContain('&#8203;');
  });

  it('HTML-escapes seller text so it cannot break the message markup', () => {
    const message = formatListingMessage(
      tracker,
      match({}, { title: 'Leon <script>alert(1)</script> & co', description: '<b>bold</b>' }),
    );
    expect(message).toContain('&lt;script&gt;');
    expect(message).toContain('&amp; co');
    expect(message).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(message).not.toContain('<script>');
  });
});

describe('formatDigestMessage', () => {
  it('ranks by worst-case total, so an ad that may owe tax is not ranked on its best case', () => {
    const digest = formatDigestMessage(tracker, [
      match({}, { key: 'a', title: 'Clear 58k', priceEgp: 58000 }),
      match({ possibleExtraCostEgp: 18000 }, { key: 'b', title: 'Maybe 42k', priceEgp: 42000 }), // 60k worst
      match({ extraCostEgp: 18000 }, { key: 'c', title: 'Taxed 38k', priceEgp: 38000 }), // 56k
    ]);
    const order = ['Taxed 38k', 'Clear 58k', 'Maybe 42k'].map((title) => digest.indexOf(title));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(digest).toContain('3 ads match right now');
  });

  it('caps the list and says how many more there are', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      match({}, { key: `k${index}`, priceEgp: 50000 + index }),
    );
    const digest = formatDigestMessage(tracker, many);
    expect(digest).toContain('…and 15 more');
    expect(digest.length).toBeLessThan(4096);
  });

  it('says so when nothing matches yet', () => {
    expect(formatDigestMessage(tracker, [])).toContain('Nothing matches right now');
  });
});
