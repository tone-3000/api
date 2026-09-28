// src/components/ToneDetail.tsx
import { useState } from 'react';
import { t3kClient } from '../client';
import { ApiError } from '../tone3000-client';
import { formatLabel, gearLabel } from '../labels';
import type { ToneWithModels } from '../tones';
import { CreatorBadge } from './CreatorBadge';
import { ModelList } from './ModelList';

interface Props {
  tone: ToneWithModels;
  onBack: () => void;
  onChange: (tone: ToneWithModels) => void;
}

export function ToneDetail({ tone, onBack, onChange }: Props) {
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [zipState, setZipState] = useState<'idle' | 'busy' | 'forbidden' | 'error'>('idle');

  const toggleFavorite = async () => {
    setFavoriteBusy(true);
    try {
      if (tone.is_favorite) await t3kClient.unfavoriteTone(tone.id);
      else await t3kClient.favoriteTone(tone.id);
      onChange({
        ...tone,
        is_favorite: !tone.is_favorite,
        favorites_count: tone.favorites_count + (tone.is_favorite ? -1 : 1),
      });
    } finally {
      setFavoriteBusy(false);
    }
  };

  const downloadZip = async () => {
    setZipState('busy');
    try {
      await t3kClient.downloadToneZip(tone.id);
      setZipState('idle');
    } catch (err) {
      setZipState(err instanceof ApiError && err.isForbidden ? 'forbidden' : 'error');
    }
  };

  return (
    <div className="tone-detail-page">
      <button className="btn btn-ghost btn-small tone-detail-back" onClick={onBack}>← Back</button>

      {tone.images?.[0] && <img src={tone.images[0]} alt={tone.title} className="tone-detail-hero" />}

      <div className="tone-detail-header">
        <div>
          <h2 className="tone-detail-title">{tone.title}</h2>
          <CreatorBadge user={tone.user} size="large" />
        </div>
        <div className="tone-detail-badges">
          <span className="badge badge--gear">{gearLabel(tone.gear)}</span>
          <span className="badge badge--format">{formatLabel(tone.format)}</span>
          {!tone.is_public && <span className="badge badge--private">Private</span>}
        </div>
      </div>

      <div className="tone-detail-actions">
        <button className="btn btn-secondary btn-small" onClick={toggleFavorite} disabled={favoriteBusy}>
          {tone.is_favorite ? '★ Favorited' : '☆ Favorite'}
        </button>
        <button className="btn btn-secondary btn-small" onClick={downloadZip} disabled={zipState === 'busy'}>
          {zipState === 'busy' ? 'Preparing zip…' : 'Download all (.zip)'}
        </button>
        <a className="btn btn-ghost btn-small" href={tone.url} target="_blank" rel="noopener noreferrer">
          View on TONE3000 ↗
        </a>
        {zipState === 'forbidden' && (
          <span className="tone-detail-note">Zip downloads are limited to approved partners — download models individually below.</span>
        )}
        {zipState === 'error' && <span className="tone-detail-note tone-detail-note--error">Zip download failed.</span>}
      </div>

      {tone.description && <p className="tone-detail-desc">{tone.description}</p>}

      <div className="tone-detail-meta-row">
        <span>↓ {tone.downloads_count} downloads</span>
        <span>★ {tone.favorites_count} favorites</span>
        <span>
          {tone.format === 'ir' ? `${tone.irs_count} IRs` : `${tone.models_count} models`}
        </span>
        <span>License: {tone.license}</span>
        {tone.published_at && <span>Published {new Date(tone.published_at).toLocaleDateString()}</span>}
      </div>

      {tone.makes.length > 0 && (
        <div className="tone-detail-tags">
          {tone.makes.map((m) => <span key={m.id} className="badge">{m.name}</span>)}
        </div>
      )}

      {tone.tags.length > 0 && (
        <div className="tone-detail-tags">
          {tone.tags.map((t) => <span key={t.id} className="badge">#{t.name}</span>)}
        </div>
      )}

      <div className="model-section">
        <h3 className="model-section-title">Models ({tone.models.length})</h3>
        <ModelList models={tone.models} tone={tone} />
      </div>
    </div>
  );
}
