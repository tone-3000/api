// src/components/ToneCard.tsx
import type { Tone } from '../types';
import { CrossOriginImage } from './CrossOriginImage';

interface Props {
  tone: Tone;
  onClick?: () => void;
  compact?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  'nam': 'NAM', 'ir': 'IR', 'aida-x': 'AIDA-X',
  'aa-snapshot': 'Snapshot', 'proteus': 'Proteus',
};

const GEAR_LABELS: Record<string, string> = {
  'amp': 'Amp', 'full-rig': 'Full Rig', 'pedal': 'Pedal',
  'outboard': 'Outboard', 'ir': 'IR',
};

export function ToneCard({ tone, onClick, compact = false }: Props) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag className={`tone-card ${compact ? 'tone-card--compact' : ''}`} onClick={onClick}>
      {tone.images?.[0] && (
        <CrossOriginImage src={tone.images[0]} alt={tone.title} className="tone-card-image" />
      )}
      <div className="tone-card-body">
        <h3 className="tone-card-title">{tone.title}</h3>
        <p className="tone-card-creator">by @{tone.user.username}</p>
        {!compact && tone.description && (
          <p className="tone-card-desc">{tone.description}</p>
        )}
        <div className="tone-card-badges">
          <span className="badge badge--platform">{PLATFORM_LABELS[tone.platform] ?? tone.platform}</span>
          <span className="badge badge--gear">{GEAR_LABELS[tone.gear] ?? tone.gear}</span>
          {!tone.is_public && <span className="badge badge--private">Private</span>}
        </div>
        {!compact && (
          <div className="tone-card-stats">
            <span>↓ {tone.downloads_count}</span>
            <span>★ {tone.favorites_count}</span>
            <span>{tone.models_count} models</span>
          </div>
        )}
      </div>
    </Tag>
  );
}
