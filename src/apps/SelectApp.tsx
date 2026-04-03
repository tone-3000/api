// src/apps/SelectApp.tsx
import { useState, useEffect } from 'react';
import { PUBLISHABLE_KEY, REDIRECT_URI } from '../config';
import { startSelectFlow } from '../tone3000-client';
import { t3kClient } from '../App';
import { ToneCard } from '../components/ToneCard';
import { ModelList } from '../components/ModelList';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import type { Tone, Model } from '../types';
import t3kLogo from '../assets/t3k.svg';

type ToneWithModels = Tone & { models: Model[] };

export function SelectApp() {
  const [tone, setTone] = useState<ToneWithModels | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the tone_id resolved by the OAuth callback (set by App.tsx)
  useEffect(() => {
    const resolvedToneId = sessionStorage.getItem('t3k_resolved_tone_id');
    const callbackError = new URLSearchParams(window.location.search).get('error');

    if (callbackError) {
      setError('Authentication failed. Please try again.');
      return;
    }

    if (resolvedToneId && t3kClient.isConnected()) {
      sessionStorage.removeItem('t3k_resolved_tone_id');
      setLoading(true);
      t3kClient.getTone(resolvedToneId)
        .then(setTone)
        .catch(() => setError('Failed to load tone. Please try again.'))
        .finally(() => setLoading(false));
    }
  }, []);

  const handleBrowse = () => {
    sessionStorage.setItem('t3k_pending_demo', 'select');
    startSelectFlow(PUBLISHABLE_KEY, REDIRECT_URI);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🎸</span>
            <span className="app-name">Amp Hub</span>
          </div>
          <span className="app-tagline">Guitar Amp Simulation</span>
        </div>
        <a className="t3k-badge" href="https://www.tone3000.com/api" target="_blank" rel="noopener noreferrer">
          <span>Powered by</span>
          <img src={t3kLogo} alt="TONE3000" className="t3k-badge-logo" />
        </a>
      </header>

      <main className="app-main">
        <div className="section-header">
          <h2 className="section-title">Tone Library</h2>
          {tone && (
            <button className="btn btn-secondary" onClick={handleBrowse}>
              Browse Different Tone
            </button>
          )}
        </div>

        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {loading && (
          <div className="loading-state">
            <Spinner />
            <p>Loading tone from TONE3000…</p>
          </div>
        )}

        {!loading && !tone && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">🎛️</div>
            <h3 className="empty-state-title">No Tone Loaded</h3>
            <p className="empty-state-desc">
              Browse the TONE3000 catalog to find a tone and load it into AmpHub.
              You'll be able to download and activate the model directly.
            </p>
            <button className="btn btn-primary btn-t3k" onClick={handleBrowse}>
              <img src={t3kLogo} alt="" className="btn-logo" />
              Browse Tones on TONE3000
            </button>
          </div>
        )}

        {tone && !loading && (
          <div className="tone-detail">
            <ToneCard tone={tone} />
            <div className="model-section">
              <h3 className="model-section-title">Models</h3>
              <ModelList
                models={tone.models}
                onDownload={(model) => t3kClient.downloadModel(model.model_url, model.name)}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <a href="/" className="back-link">← All Demos</a>
      </footer>
    </div>
  );
}
