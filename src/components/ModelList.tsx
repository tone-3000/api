// src/components/ModelList.tsx
import { useCallback, useEffect, useRef } from 'react';
import type { Model } from '../types';
import { t3kClient } from '../App';
import {
  T3kSlimPlayer,
  DEFAULT_MODELS,
  DEFAULT_IRS,
  DEFAULT_INPUTS,
} from 'neural-amp-modeler-wasm';
import type { Model as NamModel, IR, Input } from 'neural-amp-modeler-wasm';
import 'neural-amp-modeler-wasm/dist/styles.css';

interface Props {
  models: Model[];
}

const SIZE_LABELS: Record<string, string> = {
  'standard': 'Standard', 'lite': 'Lite',
  'feather': 'Feather', 'nano': 'Nano', 'custom': 'Custom',
};

const getExtension = (url: string) => url.split('.').pop()?.toLowerCase();

// Fetch a model file with the authenticated t3kClient and return a blob URL
// the player can consume. The domain strip is intentional — t3kClient.fetch
// always prepends T3K_API so we need a relative path.
async function fetchAuthenticatedUrl(url: string): Promise<string> {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const response = await t3kClient.fetch(path);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

interface ModelRowProps {
  model: Model;
}

function ModelRow({ model }: ModelRowProps) {
  const isNam = getExtension(model.model_url) === 'nam';
  const isIr = getExtension(model.model_url) === 'wav';
  const canPlay = isNam || isIr;

  // Track the blob URL so we can revoke it on unmount and avoid leaking memory.
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const getData = useCallback(async (): Promise<{ model: NamModel; ir: IR; input: Input }> => {
    // Revoke any previously-created blob URL before fetching a new one.
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const blobUrl = await fetchAuthenticatedUrl(model.model_url);
    blobUrlRef.current = blobUrl;

    const namModel: NamModel = isNam
      ? { name: model.name, url: blobUrl, default: true }
      : DEFAULT_MODELS[0];

    const ir: IR = isIr
      ? { name: model.name, url: blobUrl, default: true }
      : DEFAULT_IRS[0];

    const input: Input = DEFAULT_INPUTS[0];

    return { model: namModel, ir, input };
  }, [model.model_url, model.name, isNam, isIr]);

  return (
    <div className="model-row">
      <div className="model-row-info">
        <span className="model-row-name">{model.name}</span>
        <span className="badge">{SIZE_LABELS[model.size] ?? model.size}</span>
      </div>
      <div className="model-row-actions">
        {canPlay ? (
          // Wrap in .neural-amp-modeler so the package's scoped Tailwind
          // styles apply — the SlimPlayer itself doesn't wrap its button.
          <div className="neural-amp-modeler">
            <T3kSlimPlayer id={`model-${model.id}`} getData={getData} />
          </div>
        ) : (
          <span className="model-row-unsupported">Preview unavailable</span>
        )}
      </div>
    </div>
  );
}

export function ModelList({ models }: Props) {
  if (models.length === 0) {
    return <p className="empty-list">No models available for this tone.</p>;
  }

  return (
    <div className="model-list">
      {models.map(model => (
        <ModelRow key={model.id} model={model} />
      ))}
    </div>
  );
}
