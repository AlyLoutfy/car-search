import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTrackers } from '../src/config';

function configFile(trackers: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'trackers-')), 'trackers.json');
  writeFileSync(path, JSON.stringify(trackers));
  return path;
}

const tracker = {
  id: 'iphone-17',
  label: 'iPhone 17',
  url: 'https://www.dubizzle.com.eg/en/mobile-phones-tablets-accessories-numbers/mobile-phones/q-used-iphone-17/',
};

describe('loadTrackers', () => {
  it('accepts the committed config', () => {
    expect(loadTrackers().length).toBeGreaterThan(0);
  });

  it('rejects a misspelt option instead of silently not filtering', () => {
    const path = configFile([{ ...tracker, filters: { minBateryHealth: 96 } }]);
    expect(() => loadTrackers(path)).toThrow(/minBateryHealth/);
  });

  it('rejects a link to a site there is no parser for', () => {
    const path = configFile([{ ...tracker, url: 'https://sylndr.com/en/buy-used-cars' }]);
    expect(() => loadTrackers(path)).toThrow(/unsupported site/);
  });

  it('rejects duplicate ids, which would share one seen-state entry', () => {
    expect(() => loadTrackers(configFile([tracker, tracker]))).toThrow(/unique/);
  });
});
