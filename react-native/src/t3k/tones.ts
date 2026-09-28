// tones.ts — helpers shared by every demo
import type { PreviewChain } from 't3k-preview';

import { t3kClient } from './client';
import { Architecture, Format, Gear, type Model, type Tone } from './types';

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

/** The engine loads from filesystem paths, not file:// URIs. */
function pathOf(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

/**
 * How to preview a model, or null when its format can't be previewed:
 * - NAM amp heads play through the fallback cab (they're captured without one)
 * - Other NAM captures (amp + cab, pedals, …) play dry
 * - IRs play the fallback amp into the IR
 *
 * The returned function downloads the model on first play.
 */
export function previewChain(model: Model, tone: Pick<Tone, 'format' | 'gear'>): (() => Promise<PreviewChain>) | null {
  if (tone.format === Format.Nam) {
    return async () => {
      const file = await t3kClient.downloadModelFile(model.model_url, model.name);
      return { model: pathOf(file.uri), ir: tone.gear === Gear.Amp ? 'fallback-cab' : '' };
    };
  }
  if (tone.format === Format.Ir) {
    return async () => {
      const file = await t3kClient.downloadModelFile(model.model_url, model.name);
      return { model: 'fallback-amp', ir: pathOf(file.uri) };
    };
  }
  return null;
}
