import { describe, expect, it } from 'vitest';
import { formatListingMessage } from '../src/notifier';
import type { Listing, SearchConfig } from '../src/types';

const search: SearchConfig = {
  id: 'seat-leon',
  label: 'SEAT Leon · 900k–1.51M EGP',
  sources: [],
};

const listing: Listing = {
  key: 'dubizzle:208239498',
  title: 'Seat Leon 2020',
  priceEgp: 1350000,
  url: 'https://www.dubizzle.com.eg/en/ad/seat-leon-2020-ID208239498',
  imageUrl: null,
  site: 'dubizzle',
};

describe('formatListingMessage', () => {
  it('includes the title, formatted price, site and link', () => {
    const message = formatListingMessage(search, listing);
    expect(message).toContain('Seat Leon 2020');
    expect(message).toContain('1,350,000 EGP');
    expect(message).toContain('Dubizzle');
    expect(message).toContain(`href="${listing.url}"`);
  });

  it('shows a fallback when the price is unknown', () => {
    expect(formatListingMessage(search, { ...listing, priceEgp: null })).toContain('Price N/A');
  });

  it('leads with a zero-width link to the thumbnail so Telegram shows the car photo', () => {
    const image = 'https://images.dubizzle.com.eg/thumbnails/178635000-600x450.webp';
    const message = formatListingMessage(search, { ...listing, imageUrl: image });
    // Must be the first link in the text — Telegram previews whichever link comes first.
    expect(message.indexOf(image)).toBeLessThan(message.indexOf(listing.url));
    expect(message).toContain(`<a href="${image}">&#8203;</a>`);
  });

  it('omits the photo anchor entirely when there is no image', () => {
    expect(formatListingMessage(search, listing)).not.toContain('&#8203;');
  });

  it('HTML-escapes a malicious title so it cannot break the message markup', () => {
    const message = formatListingMessage(search, {
      ...listing,
      title: 'Leon <script>alert(1)</script> & co',
    });
    expect(message).toContain('&lt;script&gt;');
    expect(message).toContain('&amp; co');
    expect(message).not.toContain('<script>');
  });
});
