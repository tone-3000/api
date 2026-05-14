// filterPrefs.ts — QA-only shared filter state.
//
// Drives the architecture / platform / gear selectors exposed by FiltersBar on
// this preview branch. Each demo reads the prefs and forwards them into OAuth
// authorize-URL params (so the in-popup browse view honors the same filters)
// and into authenticated API list/search calls. Persisted in sessionStorage so
// the value survives the OAuth round-trip but resets when the tab closes.

import { useCallback, useEffect, useState } from 'react';
import { Gear, Platform } from './types';

const STORAGE_KEY = 't3k_filter_prefs';
const CHANGE_EVENT = 't3k_filter_prefs_change';

/** TONE3000 accepts `1`, `2`, or the literal string `'custom'` for the
 * architecture filter. `'custom'` matches tones authored against unofficial /
 * non-standard NAM architectures. */
export type ArchitectureFilter = 1 | 2 | 'custom';

export interface FilterPrefs {
  /** undefined = no architecture filter applied */
  architecture?: ArchitectureFilter;
  /** undefined = no platform filter applied */
  platform?: Platform;
  /** undefined = no gear filter applied */
  gear?: Gear;
}

// Default to architecture 2 — that's what this preview branch is here to test.
const DEFAULT_PREFS: FilterPrefs = { architecture: 2 };

function read(): FilterPrefs {
  // Important: don't spread DEFAULT_PREFS over the parsed value. JSON.stringify
  // drops `undefined`, so "Any" (architecture: undefined) round-trips as a
  // missing key — a default-merge would silently reinstate architecture: 2 and
  // the user's "Any" choice would never reach the API.
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return JSON.parse(raw) as FilterPrefs;
  } catch {
    return DEFAULT_PREFS;
  }
}

function write(prefs: FilterPrefs): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function getFilterPrefs(): FilterPrefs {
  return read();
}

/** React hook — re-renders subscribers when any FiltersBar instance updates prefs. */
export function useFilterPrefs(): [FilterPrefs, (next: FilterPrefs) => void] {
  const [prefs, setPrefs] = useState<FilterPrefs>(() => read());

  useEffect(() => {
    const onChange = () => setPrefs(read());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const update = useCallback((next: FilterPrefs) => {
    write(next);
    setPrefs(next);
  }, []);

  return [prefs, update];
}

/**
 * Build the options bag accepted by the OAuth flow initiators.
 * Spread the result into the `options` arg of `startSelectFlow*`,
 * `startLoadToneFlow*`, etc.
 */
export function flowOptionsFromPrefs(prefs: FilterPrefs): {
  gears?: string;
  platform?: string;
  architecture?: ArchitectureFilter;
} {
  const opts: { gears?: string; platform?: string; architecture?: ArchitectureFilter } = {};
  if (prefs.gear) opts.gears = prefs.gear;
  if (prefs.platform) opts.platform = prefs.platform;
  if (prefs.architecture != null) opts.architecture = prefs.architecture;
  return opts;
}
