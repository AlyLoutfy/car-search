import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** seen.json shape: { [searchId]: { [siteId]: listingKey[] } } */
export type SeenState = Record<string, Record<string, string[]>>;

export function loadState(path: string): SeenState {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as SeenState) : {};
  } catch {
    return {};
  }
}

export function saveState(path: string, state: SeenState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** Returns the recorded keys, or undefined if this (search, site) has never been seen before. */
export function getSeen(state: SeenState, searchId: string, site: string): string[] | undefined {
  return state[searchId]?.[site];
}

export function setSeen(state: SeenState, searchId: string, site: string, keys: string[]): void {
  (state[searchId] ??= {})[site] = keys;
}

/**
 * Build the next seen-history from the previously-seen keys and the keys present this run.
 *
 * Invariant: a key that is still present this run is NEVER evicted — otherwise it would be
 * re-alerted next run. The cap only trims keys that have already DISAPPEARED from the site
 * (oldest-departed first). If the present set alone exceeds the cap, the cap is exceeded
 * rather than dropping a live key (correctness wins over file size).
 */
export function mergeSeen(previous: string[], currentKeys: string[], cap = 1500): string[] {
  const currentSet = new Set(currentKeys);
  const departed = previous.filter((key) => !currentSet.has(key)); // no longer on the site
  const budget = Math.max(0, cap - currentKeys.length);
  const keptDeparted = budget > 0 ? departed.slice(-budget) : [];
  return [...keptDeparted, ...currentKeys];
}
