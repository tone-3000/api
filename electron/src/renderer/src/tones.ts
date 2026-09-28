// tones.ts — helpers shared by every demo
import { t3kClient } from './client';
import { Architecture, type Model, type Tone } from './types';

export type ToneWithModels = Tone & { models: Model[] };

/**
 * Every demo request asks for A2 NAM captures. Omitting `architecture` would
 * return the legacy A1 + Custom set instead. The filter doesn't affect IRs.
 */
export const DEMO_ARCHITECTURE = Architecture.A2;

/** Fetch a tone plus its downloadable models. */
export async function fetchToneWithModels(toneId: number | string): Promise<ToneWithModels> {
  const tone = await t3kClient.getTone(toneId, { architecture: DEMO_ARCHITECTURE });
  const { data: models } = await t3kClient.listModels(toneId, { architecture: DEMO_ARCHITECTURE, pageSize: 100 });
  return { ...tone, models };
}
