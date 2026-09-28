// presets.ts — the Load Tone demo's saved presets.
//
// A preset is your app's own record. The only TONE3000 data it needs is the
// tone ID; the title and creator are cached for display and refreshed each
// time the preset loads. This demo keeps presets in localStorage — a real
// app would store them wherever it keeps user data.
import type { Tone } from './types';

export interface Preset {
  id: string;
  toneId: number;
  title: string;
  creator: string;
}

const STORAGE_KEY = 'beacon_presets';

export function loadPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Preset[];
  } catch {
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function presetFromTone(tone: Tone, id: string = crypto.randomUUID()): Preset {
  return {
    id,
    toneId: tone.id,
    title: tone.title,
    creator: tone.user.display_name ?? tone.user.username,
  };
}
