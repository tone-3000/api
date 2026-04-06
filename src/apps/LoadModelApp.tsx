// src/apps/LoadModelApp.tsx
import { useState, useEffect } from 'react';
import { PUBLISHABLE_KEY, REDIRECT_URI } from '../config';
import { startLoadModelFlow } from '../tone3000-client';
import { t3kClient } from '../App';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import type { Model } from '../types';
import t3kLogo from '../assets/t3k.svg';

// Simulated model slots — in a real app these come from your database
const MODEL_SLOTS = [
  { id: 'slot-1', name: 'Orange OTR 120 2X12 - Orange Amp: Flat EQ, Gain 6, AKG 414', description: 'British Citrus', modelId: 53 },
  { id: 'slot-2', name: 'Roland JC 120B Jazz Chorus - Bright Off, SM57 & Royer 101', description: 'Jazz Clean', modelId: 83323 },
  { id: 'slot-3', name: '1970s Peavey 240 Standard + 2x15 Sunn Cab - SM57, Cap Edge, Jumped', description: 'Bright Crunch', modelId: 333216 },
  { id: 'slot-4', name: 'Lost Signal', description: 'An example inaccessible model', modelId: 999999999 },
];

export function LoadModelApp() {
  const [loadedModel, setLoadedModel] = useState<Model | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const resolvedModelId = sessionStorage.getItem('t3k_resolved_model_id');
    const storedSlotId = sessionStorage.getItem('t3k_active_slot_id');
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get('error');

    if (callbackError === 'access_denied') {
      setAccessDenied(true);
      if (storedSlotId) setActiveSlotId(storedSlotId);
      sessionStorage.removeItem('t3k_active_slot_id');
      window.history.replaceState({}, '', `?demo=load-model`);
      return;
    }

    if (callbackError) {
      setError('Authentication failed. Please try again.');
      return;
    }

    if (resolvedModelId && t3kClient.isConnected()) {
      sessionStorage.removeItem('t3k_resolved_model_id');
      sessionStorage.removeItem('t3k_active_slot_id');
      if (storedSlotId) setActiveSlotId(storedSlotId);

      setLoading(true);
      t3kClient.getModel(resolvedModelId)
        .then(setLoadedModel)
        .catch(() => setError('Failed to load model. Please try again.'))
        .finally(() => setLoading(false));
    }
  }, []);

  const handleLoad = (slot: typeof MODEL_SLOTS[0]) => {
    setAccessDenied(false);
    setError(null);
    sessionStorage.setItem('t3k_pending_demo', 'load-model');
    sessionStorage.setItem('t3k_active_slot_id', slot.id);
    startLoadModelFlow(PUBLISHABLE_KEY, REDIRECT_URI, slot.modelId);
  };

  const handleDownload = async () => {
    if (!loadedModel) return;
    setDownloading(true);
    try {
      await t3kClient.downloadModel(loadedModel.model_url, loadedModel.name);
    } catch {
      setError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🧠</span>
            <span className="app-name">NAM Loader</span>
          </div>
          <span className="app-tagline">Load Neural Amp Modeler files</span>
        </div>
      </header>

      <main className="app-main">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {loading ? (
          <div className="loading-state">
            <Spinner />
            <p>Loading model from TONE3000…</p>
          </div>
        ) : (
          <>
            {/* Loaded model — above the fold */}
            <div className="loaded-section loaded-section--top">
              <div className="section-header">
                <h2 className="section-title">Loaded Model</h2>
                {loadedModel && (
                  <button
                    className="btn btn-primary"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? 'Downloading…' : 'Download Model'}
                  </button>
                )}
              </div>

              {accessDenied && (
                <div className="access-denied-banner">
                  <div className="access-denied-icon">🔒</div>
                  <div>
                    <h3 className="access-denied-title">Model Unavailable</h3>
                    <p className="access-denied-desc">
                      This model is no longer accessible. The creator may have made it private or deleted it.
                      Contact the tone creator on TONE3000 if you believe this is an error.
                    </p>
                  </div>
                </div>
              )}

              {loadedModel ? (
                <div className="model-detail-card">
                  <div className="model-detail-info">
                    <h3 className="model-detail-name">{loadedModel.name}</h3>
                    <div className="model-detail-meta">
                      <span className="badge">{loadedModel.size}</span>
                      <span className="meta-text">Tone #{loadedModel.tone_id}</span>
                    </div>
                  </div>
                </div>
              ) : !accessDenied && (
                <div className="loaded-placeholder">
                  <p className="loaded-placeholder-text">No model loaded yet. Select a slot below to load one from TONE3000.</p>
                </div>
              )}
            </div>

            <div className="section-header">
              <h2 className="section-title">Model Slots</h2>
            </div>

            <div className="slot-list">
              {MODEL_SLOTS.map((slot) => {
                const isActive = activeSlotId === slot.id;
                return (
                  <div key={slot.id} className={`slot-card ${isActive ? 'slot-card--active' : ''}`}>
                    <div className="slot-info">
                      <h3 className="slot-name">{slot.name}</h3>
                      <p className="slot-desc">{slot.description}</p>
                      <span className="slot-model-ref">TONE3000 Model #{slot.modelId}</span>
                    </div>
                    <button
                      className="btn btn-primary btn-t3k"
                      onClick={() => handleLoad(slot)}
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
