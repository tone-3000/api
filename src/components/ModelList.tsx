// src/components/ModelList.tsx
import { useState } from 'react';
import type { Model } from '../types';

interface Props {
  models: Model[];
  onDownload: (model: Model) => Promise<void>;
}

const SIZE_LABELS: Record<string, string> = {
  'standard': 'Standard', 'lite': 'Lite',
  'feather': 'Feather', 'nano': 'Nano', 'custom': 'Custom',
};

export function ModelList({ models, onDownload }: Props) {
  const [downloading, setDownloading] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const handleDownload = async (model: Model) => {
    setDownloading(model.id);
    setErrors(prev => { const n = { ...prev }; delete n[model.id]; return n; });
    try {
      await onDownload(model);
    } catch {
      setErrors(prev => ({ ...prev, [model.id]: 'Download failed. Try again.' }));
    } finally {
      setDownloading(null);
    }
  };

  if (models.length === 0) {
    return <p className="empty-list">No models available for this tone.</p>;
  }

  return (
    <div className="model-list">
      {models.map(model => (
        <div key={model.id} className="model-row">
          <div className="model-row-info">
            <span className="model-row-name">{model.name}</span>
            <span className="badge">{SIZE_LABELS[model.size] ?? model.size}</span>
          </div>
          <div className="model-row-actions">
            {errors[model.id] && <span className="model-row-error">{errors[model.id]}</span>}
            <button
              className="btn btn-secondary btn-small"
              onClick={() => handleDownload(model)}
              disabled={downloading === model.id}
            >
              {downloading === model.id ? 'Downloading…' : 'Download'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
