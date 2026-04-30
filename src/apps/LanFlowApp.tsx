// src/apps/LanFlowApp.tsx
//
// Devo Inc — LAN-relay Flow
// Demonstrates OAuth from a headless LAN device. Conceptually, this app *is*
// the device: it generates PKCE locally, opens a LAN listener (the Vite dev
// server, via vite-plugin-lan-bridge.ts), and waits for the OAuth code to
// arrive at that listener after the user scans a QR with their phone.
//
// In production, the device firmware does all this — the LAN listener is on
// the embedded hardware, the QR is rendered on the device's screen, and the
// "browser" never enters the picture. The browser-based UI here is only a
// stand-in for that screen so the demo lives next to the other examples.

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { PUBLISHABLE_KEY } from '../config';
import { startLanRelayFlow, exchangeCode } from '../tone3000-client';
import type { T3KTokens, OAuthCallbackResult } from '../tone3000-client';
import type { User, Tone, PaginatedResponse } from '../types';
import { t3kClient } from '../App';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

interface LanInfo {
  lanIp: string | null;
}

interface ApiSmokeResults {
  user?: User;
  created?: PaginatedResponse<Tone>;
  favorited?: PaginatedResponse<Tone>;
  errors: string[];
}

type FlowStage =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'awaiting_scan'; authorizeUrl: string; qrDataUrl: string; lanCallbackUri: string; state: string }
  | { kind: 'exchanging' }
  | { kind: 'done'; tokens: T3KTokens; api: ApiSmokeResults }
  | { kind: 'error'; message: string };

const POLL_MS = 500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — phone scan + sign-in window

export function LanFlowApp() {
  const [stage, setStage] = useState<FlowStage>({ kind: 'idle' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleStart() {
    setStage({ kind: 'starting' });

    // 1. Discover the laptop's LAN IP (the Vite middleware exposes os.networkInterfaces).
    let lanIp: string | null = null;
    try {
      const res = await fetch('/lan-info');
      const info = (await res.json()) as LanInfo;
      lanIp = info.lanIp;
    } catch {
      setStage({ kind: 'error', message: 'Failed to read LAN IP from the dev server.' });
      return;
    }
    if (!lanIp) {
      setStage({
        kind: 'error',
        message:
          'No private (RFC1918) IPv4 address found on this machine. ' +
          'Are you on Wi-Fi? The phone must be able to reach the laptop on the LAN.',
      });
      return;
    }

    const port = window.location.port || '3001';
    const lanCallbackUri = `http://${lanIp}:${port}/lan-callback`;

    // 2. Build authorize URL with the LAN callback as redirect_uri.
    //    tone3000's wrapper recognizes this as RFC1918 http://, swaps in the
    //    bridge URL when forwarding to Supabase, and bridges the code back
    //    here when consent fires.
    const { authorizeUrl, state } = await startLanRelayFlow(PUBLISHABLE_KEY, lanCallbackUri);

    // 3. Render a scannable QR with the authorize URL.
    const qrDataUrl = await QRCode.toDataURL(authorizeUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    setStage({ kind: 'awaiting_scan', authorizeUrl, qrDataUrl, lanCallbackUri, state });

    // 4. Poll the dev plugin for the parked callback. The plugin captures
    //    code+state at /lan-callback and serves them to /lan-poll once.
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStage({ kind: 'error', message: 'Timed out waiting for the phone callback.' });
        return;
      }
      const res = await fetch(`/lan-poll?state=${encodeURIComponent(state)}`);
      if (res.status === 204) return;
      if (!res.ok) return;
      const parked = await res.json();
      if (pollRef.current) clearInterval(pollRef.current);

      // Surface OAuth errors the user might have triggered (e.g. denied consent).
      if (typeof parked.code === 'string' && parked.code.startsWith('__error__:')) {
        const [, error, description] = parked.code.split(':');
        setStage({ kind: 'error', message: `${error}${description ? ` — ${description}` : ''}` });
        return;
      }

      setStage({ kind: 'exchanging' });
      const result: OAuthCallbackResult = await exchangeCode(
        PUBLISHABLE_KEY,
        lanCallbackUri,
        parked.code,
        parked.state,
      );
      if (!result.ok) {
        setStage({ kind: 'error', message: `Token exchange failed: ${result.error}` });
        return;
      }
      // Smoke-test: hit a few authenticated endpoints with the issued token to
      // prove the full round-trip works (token issuance + bearer auth + the
      // T3KClient's refresh path, even though it's unlikely to fire here).
      // Errors don't fail the flow — tokens are valid, and partners often
      // have empty created/favorited lists which is a fine signal too.
      // Reuses the shared t3kClient from App.tsx so tokens flow through the
      // same sessionStorage slot the other demos use; otherwise a separate
      // T3KClient instance would write to the same `t3k_tokens` key and
      // step on whatever the user had loaded from another flow.
      t3kClient.setTokens(result.tokens);
      const api: ApiSmokeResults = { errors: [] };
      const settle = await Promise.allSettled([
        t3kClient.getUser(),
        t3kClient.listCreatedTones(1, 5),
        t3kClient.listFavoritedTones(1, 5),
      ]);
      if (settle[0].status === 'fulfilled') api.user = settle[0].value;
      else api.errors.push(`GET /user — ${String(settle[0].reason)}`);
      if (settle[1].status === 'fulfilled') api.created = settle[1].value;
      else api.errors.push(`GET /tones/created — ${String(settle[1].reason)}`);
      if (settle[2].status === 'fulfilled') api.favorited = settle[2].value;
      else api.errors.push(`GET /tones/favorited — ${String(settle[2].reason)}`);

      setStage({ kind: 'done', tokens: result.tokens, api });
    }, POLL_MS);
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStage({ kind: 'idle' });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">📡</span>
            <span className="app-name">Devo Inc</span>
          </div>
          <span className="app-tagline">Headless Hardware OAuth</span>
        </div>
      </header>

      <main className="app-main">
        <div className="section-header">
          <h2 className="section-title">LAN-relay Flow</h2>
        </div>

        <div className="empty-state" style={{ maxWidth: 720 }}>
          <p className="empty-state-desc" style={{ textAlign: 'left', marginBottom: 16 }}>
            Devo Inc makes embedded guitar processors with a touchscreen but no system
            browser. To connect a TONE3000 account, the device opens a tiny HTTP listener
            on its LAN IP, displays a QR pointing at <code>tone3000.com/api/v1/oauth/authorize</code>{' '}
            with that LAN URI as <code>redirect_uri</code>, and waits. The user scans on
            their phone, signs in, and tone3000 forwards the issued code back to the
            device's LAN listener. PKCE keeps the code unredeemable by anyone else.
          </p>
          <p className="empty-state-desc" style={{ textAlign: 'left' }}>
            <strong>This demo:</strong> the laptop is the device. Vite's dev server hosts
            the LAN listener (see <code>vite-plugin-lan-bridge.ts</code>); this React UI
            stands in for the device's screen.
          </p>
        </div>

        {stage.kind === 'idle' && (
          <div className="empty-state">
            <button className="btn btn-primary" onClick={handleStart}>
              Start LAN Flow
            </button>
          </div>
        )}

        {stage.kind === 'starting' && (
          <div className="loading-state">
            <Spinner />
            <p>Generating PKCE and resolving LAN address…</p>
          </div>
        )}

        {stage.kind === 'awaiting_scan' && (
          <div className="empty-state">
            <h3 className="empty-state-title">Scan with your phone</h3>
            <p className="empty-state-desc">
              Both phone and laptop must be on the same Wi-Fi.
            </p>
            <img
              src={stage.qrDataUrl}
              alt="OAuth authorize URL QR code"
              style={{
                width: 320,
                height: 320,
                background: 'white',
                padding: 16,
                borderRadius: 8,
                margin: '16px auto',
              }}
            />
            <p className="empty-state-desc" style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {stage.lanCallbackUri}
            </p>
            <button className="btn btn-secondary" onClick={handleReset}>
              Cancel
            </button>
          </div>
        )}

        {stage.kind === 'exchanging' && (
          <div className="loading-state">
            <Spinner />
            <p>Phone callback received — exchanging code for tokens…</p>
          </div>
        )}

        {stage.kind === 'done' && (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <h3 className="empty-state-title">Connected</h3>
            {stage.api.user && (
              <p className="empty-state-desc">
                Signed in as <strong>{stage.api.user.username ?? 'tone3000 user'}</strong>.
              </p>
            )}
            <p className="empty-state-desc" style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              access_token: {stage.tokens.access_token.slice(0, 16)}…{stage.tokens.access_token.slice(-8)}
              <br />
              expires_at: {new Date(stage.tokens.expires_at).toISOString()}
            </p>

            <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 520, marginInline: 'auto' }}>
              <h4 style={{ marginBottom: 8 }}>Authenticated API smoke tests</h4>
              <ul style={{ listStyle: 'none', padding: 0, fontSize: 13, lineHeight: 1.8 }}>
                <li>
                  <code>GET /api/v1/user</code>
                  {' → '}
                  {stage.api.user
                    ? <span>✓ {stage.api.user.username ?? '(returned)'}</span>
                    : <span style={{ color: '#c33' }}>✗ failed</span>}
                </li>
                <li>
                  <code>GET /api/v1/tones/created</code>
                  {' → '}
                  {stage.api.created
                    ? <span>✓ {stage.api.created.data.length} of {stage.api.created.total}</span>
                    : <span style={{ color: '#c33' }}>✗ failed</span>}
                </li>
                <li>
                  <code>GET /api/v1/tones/favorited</code>
                  {' → '}
                  {stage.api.favorited
                    ? <span>✓ {stage.api.favorited.data.length} of {stage.api.favorited.total}</span>
                    : <span style={{ color: '#c33' }}>✗ failed</span>}
                </li>
              </ul>
              {stage.api.errors.length > 0 && (
                <details style={{ marginTop: 8, fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer' }}>Error details</summary>
                  <ul>
                    {stage.api.errors.map((e, i) => <li key={i}><code>{e}</code></li>)}
                  </ul>
                </details>
              )}
            </div>

            <button className="btn btn-secondary" onClick={handleReset} style={{ marginTop: 16 }}>
              Run Again
            </button>
          </div>
        )}

        {stage.kind === 'error' && (
          <ErrorBanner message={stage.message} onDismiss={handleReset} />
        )}
      </main>

      <footer className="app-footer">
        <a href="/" className="back-link">← All Demos</a>
      </footer>
    </div>
  );
}
