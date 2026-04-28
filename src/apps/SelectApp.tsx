// src/apps/SelectApp.tsx
import { useState, useEffect, useRef } from 'react';
import { PUBLISHABLE_KEY_SELECT, REDIRECT_URI } from '../config';
import { startSelectFlowPopup, handleOAuthCallbackFromPopup } from '../tone3000-client';
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
  const [canceled, setCanceled] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Listen for the OAuth callback relayed from the popup (postMessage or BroadcastChannel).
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 't3k_oauth_callback') return;
      // Transition to loading immediately — before the async token exchange —
      // so the popup-closed interval can't land on "No Tone Loaded" mid-flight.
      setBrowsing(false);
      setLoading(true);
      const result = await handleOAuthCallbackFromPopup(PUBLISHABLE_KEY_SELECT, REDIRECT_URI, event);
      if (!result) {
        setLoading(false);
        return;
      }
      if (!result.ok) {
        setLoading(false);
        if (result.error === 'canceled') {
          setCanceled(true);
        } else {
          setError('Authentication failed. Please try again.');
        }
        return;
      }
      t3kClient.setTokens(result.tokens);
      if (result.canceled) {
        setCanceled(true);
        setLoading(false);
        return;
      }
      if (result.toneId) {
        Promise.all([
          t3kClient.getTone(result.toneId),
          t3kClient.listModels(result.toneId),
        ])
          .then(([t, modelsRes]) => setTone({ ...t, models: modelsRes.data }))
          .catch(() => setError('Failed to load tone. Please try again.'))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
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

  // Reset browsing state if the popup is closed without completing
  useEffect(() => {
    if (!browsing) return;
    const interval = setInterval(() => {
      if (popupRef.current?.closed) {
        setBrowsing(false);
        popupRef.current = null;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [browsing]);

  const handleBrowse = () => {
    setCanceled(false);
    setBrowsing(true);
    startSelectFlowPopup(PUBLISHABLE_KEY_SELECT, REDIRECT_URI, { gears: 'full-rig', menubar: true, architecture: 2 })
      .then((popup) => { popupRef.current = popup; });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🎸</span>
            <span className="app-name">Acme Inc</span>
          </div>
          <span className="app-tagline">Guitar Amp Simulation</span>
        </div>
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

        {canceled && (
          <div className="info-banner">
            <span className="info-banner-icon">ℹ️</span>
            <p>You closed the tone browser without selecting a tone.</p>
          </div>
        )}

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
            {browsing ? (
              <>
                <div className="empty-state-icon">🌐</div>
                <h3 className="empty-state-title">You've been redirected to TONE3000</h3>
                <p className="empty-state-desc">Finish up before returning here.</p>
              </>
            ) : (
              <>
                <div className="empty-state-icon">🎛️</div>
                <h3 className="empty-state-title">No Tone Loaded</h3>
                <p className="empty-state-desc">
                  Browse the TONE3000 catalog to find a tone and load it into Acme Inc.
                  You'll be able to download and activate the model directly.
                </p>
                <button className="btn btn-primary btn-t3k" onClick={handleBrowse}>
                  <img src={t3kLogo} alt="" className="btn-logo" />
                  Browse Tones on TONE3000
                </button>
              </>
            )}
          </div>
        )}

        {tone && !loading && (
          <div className="tone-detail">
            <ToneCard tone={tone} />
            <div className="model-section">
              <h3 className="model-section-title">Models</h3>
              <ModelList models={tone.models} />
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
