// src/components/ModelList.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { T3kSlimPlayer, DEFAULT_MODELS, DEFAULT_IRS, DEFAULT_INPUTS } from 'neural-amp-modeler-wasm';
import type { Model as NamModel, IR, Input } from 'neural-amp-modeler-wasm';
import { t3kClient } from '../client';
import { Format, Gear, type Model, type Tone } from '../types';

interface Props {
  models: Model[];
  /** The parent tone decides how each model is auditioned. */
  tone: Pick<Tone, 'format' | 'gear'>;
}

// DEFAULT_IRS[0] is "None"; the rest are cab IRs. DEFAULT_MODELS[0] is a clean amp.
const NO_IR = DEFAULT_IRS[0];
const FALLBACK_CAB = DEFAULT_IRS.find((ir) => ir.url) ?? NO_IR;
const FALLBACK_AMP = DEFAULT_MODELS[0];
const DEMO_INPUT: Input = DEFAULT_INPUTS[0];

/**
 * Preview chain for one model:
 * - NAM amp heads play through a stock cab IR (they need one to sound right)
 * - Other NAM captures (amp + cab, pedals, …) play dry
 * - IRs play behind a stock clean amp
 */
function canPreview(tone: Props['tone']): boolean {
  return tone.format === Format.Nam || tone.format === Format.Ir;
}

function ModelRow({ model, tone }: { model: Model; tone: Props['tone'] }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the blob URL so we can revoke it on unmount and avoid leaking memory.
  const blobUrlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  const getData = useCallback(async (): Promise<{ model: NamModel; ir: IR; input: Input }> => {
    if (!blobUrlRef.current) {
      // model_url requires Bearer auth, so fetch it and hand the player a blob URL.
      blobUrlRef.current = URL.createObjectURL(await t3kClient.fetchModelFile(model.model_url));
    }
    const url = blobUrlRef.current;

    if (tone.format === Format.Ir) {
      return { model: FALLBACK_AMP, ir: { name: model.name, url, mix: 1, gain: 1 }, input: DEMO_INPUT };
    }
    return {
      model: { name: model.name, url, default: true },
      ir: tone.gear === Gear.Amp ? FALLBACK_CAB : NO_IR,
      input: DEMO_INPUT,
    };
  }, [model.model_url, model.name, tone.format, tone.gear]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await t3kClient.downloadModel(model.model_url, model.name);
    } catch {
      setError('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="model-row">
      <div className="model-row-info">
        <span className="model-row-name">{model.name}</span>
      </div>
      <div className="model-row-actions">
        {error && <span className="model-row-error">{error}</span>}
        {canPreview(tone) ? (
          // Wrap in .neural-amp-modeler so the package's scoped styles apply.
          <div className="neural-amp-modeler">
            <T3kSlimPlayer id={`model-${model.id}`} getData={getData} />
          </div>
        ) : (
          <span className="model-row-unsupported">Preview unavailable</span>
        )}
        <button className="btn btn-secondary btn-small" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Downloading…' : 'Download'}
        </button>
      </div>
    </div>
  );
}

export function ModelList({ models, tone }: Props) {
  if (models.length === 0) {
    return <p className="empty-list">No models available for this tone.</p>;
  }

  return (
    <div className="model-list">
      {models.map((model) => (
        <ModelRow key={model.id} model={model} tone={tone} />
      ))}
    </div>
  );
}
