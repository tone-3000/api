// App.tsx
import { useState, useEffect } from 'react';
import { PUBLISHABLE_KEY, REDIRECT_URI } from './config';
import { handleOAuthCallback, T3KClient, startStandardFlow } from './tone3000-client';
import { SelectApp } from './apps/SelectApp';
import { LoadToneApp } from './apps/LoadToneApp';
// LoadModelApp intentionally not rendered — kept for reference
// import { LoadModelApp } from './apps/LoadModelApp';
import { FullApiApp } from './apps/FullApiApp';
import type { Demo } from './types';
import t3kLogo from './assets/t3k.svg';

// Runs before React: if we're the popup, relay the callback to the opener and close.
// Falls back to BroadcastChannel when window.opener is null (browsers clear it after
// cross-origin navigation, e.g. the user had to log in during the flow).
(function relayPopupCallback() {
  const isPopup = window.opener || sessionStorage.getItem('t3k_popup_mode') === '1';
  if (!isPopup) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('code') && !(params.has('error') && params.has('state')) && !params.has('canceled')) return;
  const message = {
    type: 't3k_oauth_callback',
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    tone_id: params.get('tone_id'),
    model_id: params.get('model_id'),
    canceled: params.get('canceled') === 'true',
  };
  if (window.opener) {
    window.opener.postMessage(message, window.location.origin);
  } else {
    const bc = new BroadcastChannel('t3k_oauth');
    bc.postMessage(message);
    bc.close();
  }
  window.close();
})();

// One shared client — sessionStorage tokens survive page refreshes
export const t3kClient = new T3KClient(PUBLISHABLE_KEY, () => {
  const demo = getActiveDemo();
  // Popup-based demos handle re-auth via popup —
  // don't do a full-page redirect that would break the popup UX.
  if (demo === 'load-tone') return;
  // Re-authenticate silently; user won't see login if still signed into TONE3000
  sessionStorage.setItem('t3k_pending_demo', demo ?? 'full-api');
  startStandardFlow(PUBLISHABLE_KEY, REDIRECT_URI);
});

function getActiveDemo(): Demo | null {
  return new URLSearchParams(window.location.search).get('demo') as Demo | null;
}

function navigateTo(demo: Demo, extra?: Record<string, string>) {
  const params = new URLSearchParams({ demo, ...extra });
  window.location.href = `${window.location.origin}?${params}`;
}

export default function App() {
  const [processing, setProcessing] = useState(false);

  // Handle OAuth callback on mount
  useEffect(() => {
    // Skip if we're the popup — the IIFE above already relayed the callback.
    if (sessionStorage.getItem('t3k_popup_mode') === '1') return;

    const params = new URLSearchParams(window.location.search);
    // Only treat as a callback if state is present — TONE3000 always includes
    // state in its redirects, but the error params we set ourselves don't.
    const hasCallback = params.has('code') || (params.has('error') && params.has('state')) || params.has('canceled');
    if (!hasCallback) return;

    // Guard against React StrictMode double-invocation.
    // handleOAuthCallback synchronously removes t3k_state as its first action,
    // so the second invocation always sees null here and bails out.
    if (!sessionStorage.getItem('t3k_state')) return;

    const pendingDemo = (sessionStorage.getItem('t3k_pending_demo') ?? 'full-api') as Demo;
    sessionStorage.removeItem('t3k_pending_demo');

    setProcessing(true);

    handleOAuthCallback(PUBLISHABLE_KEY, REDIRECT_URI).then((result) => {
      if (result.ok) {
        t3kClient.setTokens(result.tokens);
        if (result.toneId) sessionStorage.setItem('t3k_resolved_tone_id', result.toneId);
        if (result.modelId) sessionStorage.setItem('t3k_resolved_model_id', result.modelId);
        navigateTo(pendingDemo);
      } else if (result.error === 'canceled') {
        // User closed via menubar before signing in — no tokens available
        navigateTo(pendingDemo);
      } else {
        navigateTo(pendingDemo, { error: result.error });
      }
    });
  }, []);

  if (processing) {
    return (
      <div className="splash">
        <div className="splash-spinner" />
        <p className="splash-text">Connecting to TONE3000…</p>
      </div>
    );
  }

  const activeDemo = getActiveDemo();

  if (activeDemo === 'select') return <SelectApp />;
  if (activeDemo === 'load-tone') return <LoadToneApp />;
  if (activeDemo === 'full-api') return <FullApiApp />;

  // Landing page
  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className="landing-title">TONE3000 API Examples</h1>
        <p className="landing-subtitle">
          Reference integrations showing how to build against the TONE3000 API.
        </p>
        <a className="landing-api-link" href="https://www.tone3000.com/api" target="_blank" rel="noopener noreferrer">
          <img src={t3kLogo} alt="TONE3000 API" className="landing-t3k-logo" />
          <span>View API Documentation →</span>
        </a>
      </header>

      <div className="demo-grid">

        <button className="demo-card" onClick={() => navigateTo('select')}>
          <div className="demo-card-tag">Select Flow</div>
          <h2 className="demo-card-title">Amp Hub</h2>
          <p className="demo-card-product">Guitar Amp Simulation Plugin</p>
          <p className="demo-card-desc">
            Amp Hub lets users browse the TONE3000 catalog and select a tone to load
            into the plugin. No tone UI to build — TONE3000 handles selection.
          </p>
          <div className="demo-card-use-case">
            Best for: Plugins, DAWs, apps where TONE3000 drives tone discovery
          </div>
          <span className="demo-card-cta">Open Demo →</span>
        </button>

        <button className="demo-card" onClick={() => navigateTo('load-tone')}>
          <div className="demo-card-tag">Load Tone Flow</div>
          <h2 className="demo-card-title">Rig Sync</h2>
          <p className="demo-card-product">Rig Preset Management App</p>
          <p className="demo-card-desc">
            Rig Sync stores tone IDs and syncs them from TONE3000 on demand.
            The user authenticates once; Rig Sync handles access errors gracefully.
          </p>
          <div className="demo-card-use-case">
            Best for: Apps with saved tone references that need auth + access checking
          </div>
          <span className="demo-card-cta">Open Demo →</span>
        </button>

        <button className="demo-card" onClick={() => navigateTo('full-api')}>
          <div className="demo-card-tag">Full API Integration</div>
          <h2 className="demo-card-title">Tone Vault</h2>
          <p className="demo-card-product">Tone Discovery & Management App</p>
          <p className="demo-card-desc">
            Tone Vault shows every documented API endpoint: search, filter, browse
            creators, view tone details, download models, and manage favorites.
          </p>
          <div className="demo-card-use-case">
            Best for: Apps with a custom tone browsing and management experience
          </div>
          <span className="demo-card-cta">Open Demo →</span>
        </button>

      </div>
    </div>
  );
}
