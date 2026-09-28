// src/apps/SelectApp.tsx
import { useRef, useState } from 'react';
import { PUBLISHABLE_KEY_SELECT, REDIRECT_URI } from '../config';
import { startSelectFlowPopup, type SelectOptions } from '../tone3000-client';
import { t3kClient } from '../client';
import { fetchToneWithModels, DEMO_ARCHITECTURE, type ToneWithModels } from '../tones';
import { usePopupCallback, useWatchPopupClosed } from '../usePopupCallback';
import { ToneCard } from '../components/ToneCard';
import { ModelList } from '../components/ModelList';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import t3kLogo from '../assets/t3k.svg';

/** Catalog scopes a product might lock the Select flow to. */
const CATALOG_SCOPES: { label: string; gears?: string; format?: SelectOptions['format'] }[] = [
  { label: 'Amp + Cab captures', gears: 'amp-cab', format: 'nam' },
  { label: 'Amps and pedals', gears: 'amp_pedal', format: 'nam' },
  { label: 'Cabinet IRs', gears: 'cab', format: 'ir' },
  { label: 'All NAM captures', format: 'nam' },
];

export function SelectApp() {
  const [tone, setTone] = useState<ToneWithModels | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Flow options — each maps 1:1 to an authorize query param.
  const [preview, setPreview] = useState(true);
  const [locale, setLocale] = useState('');
  const [scopeIndex, setScopeIndex] = useState(0);

  usePopupCallback(
    PUBLISHABLE_KEY_SELECT,
    (result) => {
      if (!result.ok) {
        setLoading(false);
        if (result.error === 'canceled') setCanceled(true);
        else setError('Authentication failed. Please try again.');
        return;
      }
      t3kClient.setTokens(result.tokens);
      if (result.canceled || !result.toneId) {
        // Signed in, but closed the flow before picking a tone.
        setCanceled(Boolean(result.canceled));
        setLoading(false);
        return;
      }
      fetchToneWithModels(result.toneId)
        .then(setTone)
        .catch(() => setError('Failed to load tone. Please try again.'))
        .finally(() => setLoading(false));
    },
    // Switch to loading before the async token exchange, so the popup-closed
    // watcher can't land on "No Tone Loaded" mid-flight.
    () => { setBrowsing(false); setLoading(true); },
  );

  useWatchPopupClosed(popupRef, browsing, () => setBrowsing(false));

  const scope = CATALOG_SCOPES[scopeIndex];
  const options: SelectOptions = {
    gears: scope.gears,
    format: scope.format,
    architecture: DEMO_ARCHITECTURE,
    menubar: true,
    preview,
    locale: locale || undefined,
  };

  const handleBrowse = () => {
    setCanceled(false);
    setError(null);
    setBrowsing(true);
    startSelectFlowPopup(PUBLISHABLE_KEY_SELECT, REDIRECT_URI, options)
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

        <div className="flow-options">
          <span className="flow-options-title">Select flow options</span>
          <label className="flow-option">
            Catalog
            <select className="select-filter" value={scopeIndex} onChange={(e) => setScopeIndex(Number(e.target.value))}>
              {CATALOG_SCOPES.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
            </select>
          </label>
          <label className="flow-option">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            Preview players
          </label>
          <label className="flow-option">
            Language
            <select className="select-filter" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </label>
        </div>

        {canceled && (
          <div className="info-banner">
            <span className="info-banner-icon">ℹ️</span>
            <p>You closed the tone browser without selecting a tone.</p>
          </div>
        )}

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

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
                <h3 className="empty-state-title">Browsing TONE3000…</h3>
                <p className="empty-state-desc">Pick a tone in the TONE3000 window to load it here.</p>
              </>
            ) : (
              <>
                <div className="empty-state-icon">🎛️</div>
                <h3 className="empty-state-title">No Tone Loaded</h3>
                <p className="empty-state-desc">
                  Browse the TONE3000 catalog to find a tone and load it into Acme Inc.
                  You'll be able to preview and download each model directly.
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
              <ModelList models={tone.models} tone={tone} />
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
