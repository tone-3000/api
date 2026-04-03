// src/apps/LoadToneApp.tsx
import { useState, useEffect } from 'react';
import { PUBLISHABLE_KEY, REDIRECT_URI } from '../config';
import { startLoadToneFlow } from '../tone3000-client';
import { t3kClient } from '../App';
import { ToneCard } from '../components/ToneCard';
import { ModelList } from '../components/ModelList';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import type { Tone, Model } from '../types';
import t3kLogo from '../assets/t3k.svg';

type ToneWithModels = Tone & { models: Model[] };

// Simulated presets — in a real app these come from your database
const PRESETS = [
  { id: 'preset-1', name: 'British Citrus', description: 'Iconic Brit-rock tone', toneId: 18 },
  { id: 'preset-2', name: 'Jazz Clean', description: 'Sparkly clean tone', toneId: 10912 },
  { id: 'preset-3', name: 'Bright Crunch', description: 'Heavy vintage rock tone', toneId: 57529 },
  { id: 'preset-4', name: 'A Private Life', description: 'An example private tone', toneId: 11014 },
  { id: 'preset-5', name: 'Ghost Notes', description: 'An example deleted tone', toneId: 999999999 },
];

export function LoadToneApp() {
  const [loadedTone, setLoadedTone] = useState<ToneWithModels | null>(null);
  const [requestedToneId, setRequestedToneId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  useEffect(() => {
    const resolvedToneId = sessionStorage.getItem('t3k_resolved_tone_id');
    const storedPresetId = sessionStorage.getItem('t3k_active_preset_id');
    const storedRequestedId = sessionStorage.getItem('t3k_requested_tone_id');
    const callbackError = new URLSearchParams(window.location.search).get('error');

    if (callbackError) {
      setError('Authentication failed. Please try again.');
      return;
    }

    if (resolvedToneId && t3kClient.isConnected()) {
      sessionStorage.removeItem('t3k_resolved_tone_id');
      sessionStorage.removeItem('t3k_active_preset_id');
      sessionStorage.removeItem('t3k_requested_tone_id');

      if (storedPresetId) setActivePresetId(storedPresetId);
      if (storedRequestedId) setRequestedToneId(Number(storedRequestedId));

      setLoading(true);
      t3kClient.getTone(resolvedToneId)
        .then(setLoadedTone)
        .catch(() => setError('Failed to load tone. Please try again.'))
        .finally(() => setLoading(false));
    }
  }, []);

  const handleLoad = (preset: typeof PRESETS[0]) => {
    sessionStorage.setItem('t3k_pending_demo', 'load-tone');
    sessionStorage.setItem('t3k_active_preset_id', preset.id);
    sessionStorage.setItem('t3k_requested_tone_id', String(preset.toneId));
    startLoadToneFlow(PUBLISHABLE_KEY, REDIRECT_URI, preset.toneId);
  };

  const toneIdMismatch = loadedTone && requestedToneId && loadedTone.id !== requestedToneId;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🔄</span>
            <span className="app-name">Rig Sync</span>
          </div>
          <span className="app-tagline">Preset Management</span>
        </div>
        <a className="t3k-badge" href="https://www.tone3000.com/api" target="_blank" rel="noopener noreferrer">
          <span>Powered by</span>
          <img src={t3kLogo} alt="TONE3000" className="t3k-badge-logo" />
        </a>
      </header>

      <main className="app-main">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {loading && (
          <div className="loading-state">
            <Spinner />
            <p>Syncing from TONE3000…</p>
          </div>
        )}

        {!loading && (
          <>
            <div className="section-header">
              <h2 className="section-title">My Presets</h2>
            </div>

            {toneIdMismatch && (
              <div className="info-banner">
                <span className="info-banner-icon">ℹ️</span>
                <p>
                  The original tone (ID #{requestedToneId}) wasn't available.
                  A replacement tone was loaded instead.
                </p>
              </div>
            )}

            <div className="preset-list">
              {PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <div key={preset.id} className={`preset-card ${isActive ? 'preset-card--active' : ''}`}>
                    <div className="preset-info">
                      <h3 className="preset-name">{preset.name}</h3>
                      <p className="preset-desc">{preset.description}</p>
                      <span className="preset-tone-ref">TONE3000 Tone #{preset.toneId}</span>
                    </div>
                    <button
                      className="btn btn-primary btn-t3k"
                      onClick={() => handleLoad(preset)}
                    >
                      <img src={t3kLogo} alt="" className="btn-logo" />
                      Load from TONE3000
                    </button>
                  </div>
                );
              })}
            </div>

            {loadedTone && activePresetId && (
              <div className="loaded-section">
                <div className="section-header">
                  <h2 className="section-title">Loaded Tone</h2>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === activePresetId)!;
                      handleLoad(preset);
                    }}
                  >
                    Sync Again
                  </button>
                </div>
                <ToneCard tone={loadedTone} />
                <div className="model-section">
                  <h3 className="model-section-title">Models</h3>
                  <ModelList
                    models={loadedTone.models}
                    onDownload={(model) => t3kClient.downloadModel(model.model_url, model.name)}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <a href="/" className="back-link">← All Demos</a>
      </footer>
    </div>
  );
}
