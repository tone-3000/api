// src/apps/LoadToneApp.tsx
import { useState, useEffect, useRef } from 'react';
import { PUBLISHABLE_KEY, REDIRECT_URI } from '../config';
import { startLoadToneFlowPopup, handleOAuthCallbackFromPopup } from '../tone3000-client';
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
  { id: 'preset-1', name: 'British Citrus', description: 'Iconic Brit-rock tone', toneId: 18, gears: 'full-rig' },
  { id: 'preset-2', name: 'Jazz Clean', description: 'Sparkly clean tone', toneId: 10912, gears: 'full-rig' },
  { id: 'preset-3', name: 'Bright Crunch', description: 'Heavy vintage rock tone', toneId: 57529, gears: 'full-rig' },
  { id: 'preset-4', name: 'A Private Life', description: 'An example private tone', toneId: 11014, gears: 'full-rig' },
  { id: 'preset-5', name: 'Ghost Notes', description: 'An example deleted tone', toneId: 999999999, gears: 'full-rig' },
];

export function LoadToneApp() {
  const [loadedTone, setLoadedTone] = useState<ToneWithModels | null>(null);
  const [requestedToneId, setRequestedToneId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Listen for the OAuth callback relayed from the popup (postMessage or BroadcastChannel).
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const result = await handleOAuthCallbackFromPopup(PUBLISHABLE_KEY, REDIRECT_URI, event);
      if (!result) return;
      if (!result.ok) {
        setError('Authentication failed. Please try again.');
        return;
      }
      t3kClient.setTokens(result.tokens);
      if (result.toneId) {
        setLoading(true);
        Promise.all([
          t3kClient.getTone(result.toneId),
          t3kClient.listModels(result.toneId),
        ])
          .then(([tone, modelsRes]) => setLoadedTone({ ...tone, models: modelsRes.data }))
          .catch(() => setError('Failed to load tone. Please try again.'))
          .finally(() => setLoading(false));
      }
    };

    window.addEventListener('message', handleMessage);
    const bc = new BroadcastChannel('t3k_oauth');
    bc.onmessage = handleMessage;
    return () => {
      window.removeEventListener('message', handleMessage);
      bc.close();
    };
  }, []);

  const handleLoad = (preset: typeof PRESETS[0]) => {
    setError(null);
    setActivePresetId(preset.id);
    setRequestedToneId(preset.toneId);

    const openPopup = () => {
      setLoadedTone(null);
      const options = preset.gears ? { gears: preset.gears } : undefined;
      return startLoadToneFlowPopup(PUBLISHABLE_KEY, REDIRECT_URI, preset.toneId, options)
        .then((popup) => { popupRef.current = popup; });
    };

    const tokens = t3kClient.getTokens();
    if (tokens && Date.now() < tokens.expires_at) {
      setLoading(true);
      Promise.all([
        t3kClient.getTone(preset.toneId),
        t3kClient.listModels(preset.toneId),
      ])
        .then(([tone, modelsRes]) => setLoadedTone({ ...tone, models: modelsRes.data }))
        .catch((err: unknown) => {
          // Tone is inaccessible — open the popup so TONE3000 can offer a replacement
          if (err instanceof Error && err.message.includes(': 404')) {
            openPopup();
          } else {
            setError('Failed to load tone. Please try again.');
          }
        })
        .finally(() => setLoading(false));
    } else {
      openPopup();
    }
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
      </header>

      <main className="app-main">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {loading ? (
          <div className="loading-state">
            <Spinner />
            <p>Syncing from TONE3000…</p>
          </div>
        ) : (
          <>
            <div className="loaded-section loaded-section--top">
              <div className="section-header">
                <h2 className="section-title">Loaded Tone</h2>
                {loadedTone && activePresetId && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === activePresetId)!;
                      handleLoad(preset);
                    }}
                  >
                    Sync Again
                  </button>
                )}
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

              {loadedTone ? (
                <>
                  <ToneCard tone={loadedTone} />
                  <div className="model-section">
                    <h3 className="model-section-title">Models</h3>
                    <ModelList
                      models={loadedTone.models}
                      onDownload={(model) => t3kClient.downloadModel(model.model_url, model.name)}
                    />
                  </div>
                </>
              ) : (
                <div className="loaded-placeholder">
                  <p className="loaded-placeholder-text">No tone loaded yet. Select a preset below to load one from TONE3000.</p>
                </div>
              )}
            </div>

            <div className="section-header">
              <h2 className="section-title">My Presets</h2>
            </div>

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
          </>
        )}
      </main>

      <footer className="app-footer">
        <a href="/" className="back-link">← All Demos</a>
      </footer>
    </div>
  );
}
