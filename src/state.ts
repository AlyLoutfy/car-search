import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** What we remember per tracker: the link it last watched and every listing key seen there. */
export interface TrackerState {
  readonly url: string;
  readonly keys: string[];
}

/** seen.json shape: { [trackerId]: { url, keys } } */
export type SeenState = Record<string, TrackerState>;

function isTrackerState(value: unknown): value is TrackerState {
  const entry = value as Partial<TrackerState> | null;
  return typeof entry?.url === 'string' && Array.isArray(entry.keys);
}

/**
 * Load the seen-state. Entries in any other shape (e.g. the older per-site layout) are dropped, so
 * their tracker is treated as new and re-seeded silently rather than mis-read.
 */
export function loadState(path: string): SeenState {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => isTrackerState(entry)));
  } catch {
    return {};
  }
}

export function saveState(path: string, state: SeenState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * The recorded keys, or undefined if this tracker has never been seen — or was last seen watching a
 * different link. Editing a tracker's URL makes it a new search: its old keys say nothing about it.
 */
export function getSeen(state: SeenState, trackerId: string, url: string): string[] | undefined {
  const entry = state[trackerId];
  return entry?.url === url ? entry.keys : undefined;
}

export function setSeen(state: SeenState, trackerId: string, url: string, keys: string[]): void {
  state[trackerId] = { url, keys };
}

/** Forget trackers that are no longer configured, so the file doesn't grow forever. */
export function pruneState(state: SeenState, activeIds: ReadonlySet<string>): void {
  for (const id of Object.keys(state)) if (!activeIds.has(id)) delete state[id];
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
