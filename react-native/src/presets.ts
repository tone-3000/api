// presets.ts — the Load Tone demo's saved presets.
//
// A preset is your app's own record. The only TONE3000 data it needs is the
// tone ID; the title and creator are cached for display and refreshed each
// time the preset loads. This demo keeps presets in a JSON file in the app's
// documents directory — a real app would store them wherever it keeps user data.
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

import type { Tone } from '@/t3k/types';

export interface Preset {
  id: string;
  toneId: number;
  title: string;
  creator: string;
}

const file = new File(Paths.document, 'beacon-presets.json');

export function loadPresets(): Preset[] {
  try {
    return file.exists ? (JSON.parse(file.textSync()) as Preset[]) : [];
  } catch {
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  if (!file.exists) file.create();
  file.write(JSON.stringify(presets));
}

export function presetFromTone(tone: Tone, id: string = Crypto.randomUUID()): Preset {
  return {
    id,
    toneId: tone.id,
    title: tone.title,
    creator: tone.user.display_name ?? tone.user.username,
  };
}
