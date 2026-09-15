/**
 * tone3000-client.ts — TONE3000 OAuth + API client
 *
 * A zero-dependency helper for integrating with the TONE3000 API.
 * Uses built-in WebCrypto and fetch — no npm install required.
 *
 * Quick start:
 *   1. Import the flow initiator for your use case
 *   2. Call it when the user triggers the integration (e.g. clicks "Browse Tones")
 *   3. In your callback handler, call handleOAuthCallback()
 *   4. Use T3KClient to make authenticated API requests
 */

import { T3K_API } from './config';
import { TRAIN_TYPE_SWEEP_V3, UploadKind } from './types';
import type {
  User, Tone, Model, PublicUser,
  PaginatedResponse, SearchTonesParams, ListModelsParams,
  ListCreatedTonesParams, ListFavoritedTonesParams, ListUsersParams,
  CreateUploadRequest, CreateUploadBatchResponse, UploadTicket,
  CreateModelFromUploadParams, CreateToneParams,
  StartTrainingsParams, StartTrainingsResponse, Training,
  UploadProgress, UploadTarget,
} from './types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface T3KTokens {
  access_token: string;
  refresh_token: string;
  /** Unix timestamp (ms) when the access token expires. */
  expires_at: number;
}

/** Result of handleOAuthCallback(). Always check `ok` before using fields. */
export type OAuthCallbackResult =
  | { ok: true; tokens: T3KTokens; toneId?: string; modelId?: string; canceled?: boolean }
  | { ok: false; error: string };

// ─── Internal PKCE helpers ────────────────────────────────────────────────────

async function randomBase64url(bytes: number): Promise<string> {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256Base64url(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function buildPkceParams(): Promise<{ codeVerifier: string; codeChallenge: string; state: string }> {
  const codeVerifier = await randomBase64url(32);
  const [codeChallenge, state] = await Promise.all([
    sha256Base64url(codeVerifier),
    randomBase64url(16),
  ]);
  sessionStorage.setItem('t3k_code_verifier', codeVerifier);
  sessionStorage.setItem('t3k_state', state);
  return { codeVerifier, codeChallenge, state };
}

function buildAuthorizeUrl(
  publishableKey: string,
  redirectUri: string,
  extra: Record<string, string>,
  pkce: { codeChallenge: string; state: string }
): string {
  const url = new URL(`${T3K_API}/api/v1/oauth/authorize`);
  url.searchParams.set('client_id', publishableKey);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', pkce.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', pkce.state);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return url.toString();
}

// ─── Flow initiators ──────────────────────────────────────────────────────────

/**
 * **Select Flow** — Send the user to TONE3000 to browse and pick a tone.
 *
 * Use this when your app wants to let users discover tones from the TONE3000
 * catalog. After the user selects a tone, they're redirected back to your app
 * with an authorization code and the selected `tone_id`.
 *
 * Optional `options`: `gears` (underscore-separated, e.g. `amp_pedal`), `format`
 * (e.g. `nam`, `aida-x`), `architecture` (numeric), `menubar` (UI hint) — each is
 * forwarded as an authorize query param when set.
 */
export async function startSelectFlow(
  publishableKey: string,
  redirectUri: string,
  options?: { gears?: string; format?: string; menubar?: boolean, loginHint?: string, architecture?: number, preview?: boolean }
): Promise<void> {
  const pkce = await buildPkceParams();
  const extra: Record<string, string> = { prompt: 'select_tone' };
  if (options?.gears) extra.gears = options.gears;
  if (options?.format) extra.format = options.format;
  if (options?.menubar) extra.menubar = 'true';
  if (options?.architecture) extra.architecture = options.architecture.toString();
  if (options?.loginHint) extra.login_hint = options.loginHint;
  // Opts the flow into in-flow preview players (audition tones from the search
  // results, profiles, and tone detail without leaving TONE3000).
  if (options?.preview) extra.preview = 'true';
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
}

/**
 * **Select Flow (Popup)** — Open TONE3000 tone browsing and selection in a popup window.
 *
 * Same as `startSelectFlow` but opens in a popup. The user stays on your app while
 * browsing TONE3000. When a tone is selected, the popup relays the result back via
 * `postMessage` or `BroadcastChannel` — handle it with `handleOAuthCallbackFromPopup`.
 * Supports the same optional `gears`, `format`, `architecture`, and `menubar`
 * as `startSelectFlow`.
 */
export async function startSelectFlowPopup(
  publishableKey: string,
  redirectUri: string,
  options?: { gears?: string; format?: string; menubar?: boolean, loginHint?: string, architecture?: number, preview?: boolean }
): Promise<Window | null> {
  // Set before window.open so the popup inherits this flag via sessionStorage copy;
  // remove it from the parent immediately so only the popup retains it.
  sessionStorage.setItem('t3k_popup_mode', '1');
  const pkce = await buildPkceParams();
  const extra: Record<string, string> = { prompt: 'select_tone' };
  if (options?.gears) extra.gears = options.gears;
  if (options?.format) extra.format = options.format;
  if (options?.menubar) extra.menubar = 'true';
  if (options?.architecture) extra.architecture = options.architecture.toString();
  if (options?.loginHint) extra.login_hint = options.loginHint;
  // Opts the flow into in-flow preview players (audition tones from the search
  // results, profiles, and tone detail without leaving TONE3000).
  if (options?.preview) extra.preview = 'true';
  const url = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);

  const width = 480;
  const height = 700;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open(url, 't3k_select', `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
  sessionStorage.removeItem('t3k_popup_mode');
  return popup;
}

/**
 * Handle an OAuth callback relayed from a select popup.
 *
 * Pass events from both a `message` listener and a `BroadcastChannel('t3k_oauth')`
 * listener to this function. Returns `null` if the event is not a TONE3000 callback.
 * Verifies state, exchanges the code for tokens, and returns the same result shape
 * as `handleOAuthCallback`.
 */
export async function handleOAuthCallbackFromPopup(
  publishableKey: string,
  redirectUri: string,
  event: MessageEvent
): Promise<OAuthCallbackResult | null> {
  if (event.data?.type !== 't3k_oauth_callback') return null;

  const { code, state: returnedState, error, tone_id: toneId, model_id: modelId, canceled } = event.data;

  const storedState = sessionStorage.getItem('t3k_state');
  const codeVerifier = sessionStorage.getItem('t3k_code_verifier');

  sessionStorage.removeItem('t3k_state');
  sessionStorage.removeItem('t3k_code_verifier');

  if (returnedState !== storedState) return { ok: false, error: 'state_mismatch' };

  // User closed without signing in — no code to exchange
  if (canceled && !code) return { ok: false, error: 'canceled' };

  if (error) return { ok: false, error };
  if (!code || !codeVerifier) return { ok: false, error: 'missing_code' };

  const res = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: publishableKey,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { error?: string }).error ?? 'token_exchange_failed' };
  }

  const data = await res.json();
  const tokens: T3KTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return { ok: true, tokens, toneId, modelId, ...(canceled ? { canceled: true } : {}) };
}

/**
 * **Load Tone Flow** — Send the user to TONE3000 to authenticate and load a specific tone.
 *
 * Use this when your app already has a `tone_id` and wants to ensure the user
 * is authenticated and has access to that tone. TONE3000 handles the auth check
 * and redirects back immediately — no tone browsing required.
 *
 * If the tone is private or has been deleted, TONE3000 shows an error page
 * where the user can browse for a replacement. In that case, the `tone_id` in
 * the callback may differ from the one you requested. Any `gears`, `format`,
 * or `architecture` filters you pass are applied to that replacement browse view.
 *
 * @param gears - Optional underscore-separated gear filter (e.g. 'amp_amp-cab')
 * @param format - Optional format filter (e.g. 'nam', 'aida-x')
 */
export async function startLoadToneFlow(
  publishableKey: string,
  redirectUri: string,
  toneId: number | string,
  options?: { gears?: string; format?: string; menubar?: boolean, loginHint?: string, architecture?: number }
): Promise<void> {
  const pkce = await buildPkceParams();
  const extra: Record<string, string> = { prompt: 'load_tone', tone_id: String(toneId) };
  if (options?.gears) extra.gears = options.gears;
  if (options?.format) extra.format = options.format;
  if (options?.menubar) extra.menubar = 'true';
  if (options?.architecture) extra.architecture = options.architecture.toString();
  if (options?.loginHint) extra.login_hint = options.loginHint;
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
}

/**
 * **Load Tone Flow (Popup)** — Open TONE3000 in a popup to authenticate and load a specific tone.
 *
 * Same as `startLoadToneFlow` but opens in a popup. When the flow completes, the
 * popup relays the result back via `postMessage` or `BroadcastChannel` — handle it
 * with `handleOAuthCallbackFromPopup`. Any `gears`, `format`, or `architecture`
 * filters you pass are applied if the user needs to browse for a replacement tone.
 */
export async function startLoadToneFlowPopup(
  publishableKey: string,
  redirectUri: string,
  toneId: number | string,
  options?: { gears?: string; format?: string; menubar?: boolean, loginHint?: string, architecture?: number }
): Promise<Window | null> {
  // Set before window.open so the popup inherits this flag via sessionStorage copy;
  // remove it from the parent immediately so only the popup retains it.
  sessionStorage.setItem('t3k_popup_mode', '1');
  const pkce = await buildPkceParams();
  const extra: Record<string, string> = { prompt: 'load_tone', tone_id: String(toneId) };
  if (options?.gears) extra.gears = options.gears;
  if (options?.format) extra.format = options.format;
  if (options?.menubar) extra.menubar = 'true';
  if (options?.architecture) extra.architecture = options.architecture.toString();
  if (options?.loginHint) extra.login_hint = options.loginHint;
  const url = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
  const width = 480;
  const height = 700;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open(url, 't3k_load_tone', `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
  sessionStorage.removeItem('t3k_popup_mode');
  return popup;
}

/**
 * **Load Tone Flow (Popup, model_id variant)** — Open TONE3000 in a popup to
 * authenticate and load a tone resolved from a specific model. Optional
 * `gears`, `format`, or `architecture` apply if the user browses for a replacement.
 */
export async function startLoadToneFlowPopupByModelId(
  publishableKey: string,
  redirectUri: string,
  modelId: number | string,
  options?: { gears?: string; format?: string; menubar?: boolean, loginHint?: string, architecture?: number }
): Promise<Window | null> {
  sessionStorage.setItem('t3k_popup_mode', '1');
  const pkce = await buildPkceParams();
  const extra: Record<string, string> = { prompt: 'load_tone', model_id: String(modelId) };
  if (options?.gears) extra.gears = options.gears;
  if (options?.format) extra.format = options.format;
  if (options?.menubar) extra.menubar = 'true';
  if (options?.architecture) extra.architecture = options.architecture.toString();
  if (options?.loginHint) extra.login_hint = options.loginHint;
  const url = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
  const width = 480;
  const height = 700;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open(url, 't3k_load_tone', `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
  sessionStorage.removeItem('t3k_popup_mode');
  return popup;
}

/**
 * **Load Model Flow** — Send the user to TONE3000 to authenticate and load a specific model.
 *
 * Use this when your app has a `model_id` and wants to load that exact model.
 * Unlike the Load Tone flow, if the model is inaccessible, TONE3000 redirects
 * back to your app with `error=access_denied` rather than offering a replacement.
 * Your callback handler must check for this error.
 */
export async function startLoadModelFlow(
  publishableKey: string,
  redirectUri: string,
  modelId: number | string
): Promise<void> {
  const pkce = await buildPkceParams();
  window.location.href = buildAuthorizeUrl(
    publishableKey, redirectUri,
    { prompt: 'load_model', model_id: String(modelId) },
    pkce
  );
}

/**
 * **Standard Flow** — Send the user to TONE3000 to connect their account.
 *
 * Use this when your app wants long-lived access to the TONE3000 API without
 * having the user browse or select a tone during auth. After connecting, your
 * app can fetch any tone by ID using the access token.
 */
export async function startStandardFlow(
  publishableKey: string,
  redirectUri: string,
  options?: { loginHint?: string }
): Promise<void> {
  const pkce = await buildPkceParams();
  const extra: Record<string, string> = {};
  if (options?.loginHint) extra.login_hint = options.loginHint;
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
}

/**
 * **LAN-relay Flow** — For headless devices on a LAN. The "device" (here, the
 * laptop's Vite dev server) opens an HTTP listener at an RFC1918 address; the
 * user scans a QR with their phone, completes auth in the phone browser, and
 * the OAuth code lands at the device's LAN listener via tone3000's bridge.
 *
 * This helper only generates the authorize URL — actually receiving the
 * callback requires a real LAN listener (see vite-plugin-lan-bridge.ts in this
 * repo for the dev-time implementation, or your device firmware in
 * production). PKCE state is stored in sessionStorage as with the other
 * flows; pair this call with `exchangeCode()` once the listener captures
 * code+state.
 *
 * @param lanCallbackUri  The redirect_uri the device's listener will receive.
 *                        Must be `http://` to RFC1918 / link-local
 *                        (10/8, 172.16-31, 192.168/16, 169.254/16).
 */
export async function startLanRelayFlow(
  publishableKey: string,
  lanCallbackUri: string,
): Promise<{ authorizeUrl: string; state: string }> {
  const pkce = await buildPkceParams();
  const authorizeUrl = buildAuthorizeUrl(publishableKey, lanCallbackUri, {}, pkce);
  return { authorizeUrl, state: pkce.state };
}

/**
 * Exchange an authorization code for tokens. Used by `handleOAuthCallback`
 * (URL-driven callbacks) and by the LAN-relay demo (callbacks that arrive via
 * the LAN listener and are forwarded to the React UI by the dev plugin).
 *
 * Verifies that `returnedState` matches the value `buildPkceParams()` stored
 * in sessionStorage, then redeems the code with the verifier. The PKCE
 * values are cleared from sessionStorage regardless of outcome.
 */
export async function exchangeCode(
  publishableKey: string,
  redirectUri: string,
  code: string,
  returnedState: string,
): Promise<OAuthCallbackResult> {
  const storedState = sessionStorage.getItem('t3k_state');
  const codeVerifier = sessionStorage.getItem('t3k_code_verifier');
  sessionStorage.removeItem('t3k_state');
  sessionStorage.removeItem('t3k_code_verifier');

  if (returnedState !== storedState) return { ok: false, error: 'state_mismatch' };
  if (!codeVerifier) return { ok: false, error: 'missing_verifier' };

  const res = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: publishableKey,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { error?: string }).error ?? 'token_exchange_failed' };
  }

  const data = await res.json();
  return {
    ok: true,
    tokens: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    },
  };
}

// ─── Callback handler ─────────────────────────────────────────────────────────

/**
 * Handle the OAuth callback after TONE3000 redirects back to your app.
 *
 * Call this once when your callback page loads and detects a `?code=` or
 * `?error=` query parameter. It verifies the state, exchanges the code for
 * tokens, and returns a typed result object.
 *
 * Always check `result.ok` before using the tokens. A `result.ok === false`
 * with `error === 'access_denied'` is expected for the Load Model flow when
 * the model is private — handle it by showing the user an appropriate error UI.
 */
export async function handleOAuthCallback(
  publishableKey: string,
  redirectUri: string
): Promise<OAuthCallbackResult> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  const returnedState = params.get('state');
  const toneId = params.get('tone_id') ?? undefined;
  const modelId = params.get('model_id') ?? undefined;
  const canceled = params.get('canceled') === 'true';

  const storedState = sessionStorage.getItem('t3k_state');
  const codeVerifier = sessionStorage.getItem('t3k_code_verifier');

  // Clean up PKCE state regardless of outcome
  sessionStorage.removeItem('t3k_state');
  sessionStorage.removeItem('t3k_code_verifier');

  // Verify state to prevent CSRF
  if (returnedState !== storedState) {
    return { ok: false, error: 'state_mismatch' };
  }

  // User closed without signing in — no code to exchange
  if (canceled && !code) {
    return { ok: false, error: 'canceled' };
  }

  // Access denied — e.g. model is private and user clicked "Back"
  if (error) {
    return { ok: false, error };
  }

  if (!code || !codeVerifier) {
    return { ok: false, error: 'missing_code' };
  }

  const res = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: publishableKey,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { error?: string }).error ?? 'token_exchange_failed' };
  }

  const data = await res.json();
  const tokens: T3KTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return { ok: true, tokens, toneId, modelId, ...(canceled ? { canceled: true } : {}) };
}

// ─── Search query building ────────────────────────────────────────────────────

/**
 * Serialize SearchTonesParams into the query string /api/v1/tones/search
 * expects. Exported so a UI can preview the exact request it's about to make
 * without re-deriving the separator rules.
 *
 * gears, sizes, tags and makes are underscore-separated. creators is
 * comma-separated: usernames may contain an underscore, so the API can't use
 * one as a delimiter there. Callers pass plain arrays and never see this.
 */
export function buildSearchTonesQuery(params?: SearchTonesParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params?.query) qs.set('query', params.query);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('page_size', String(params.pageSize));
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.gears?.length) qs.set('gears', params.gears.join('_'));
  if (params?.format) qs.set('format', params.format);
  if (params?.sizes?.length) qs.set('sizes', params.sizes.join('_'));
  if (params?.tags?.length) qs.set('tags', params.tags.join('_'));
  if (params?.makes?.length) qs.set('makes', params.makes.join('_'));
  if (params?.creators?.length) qs.set('creators', params.creators.join(','));
  if (params?.architecture != null) qs.set('architecture', String(params.architecture));
  return qs;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/** Exchange a refresh token for a new access token. */
export async function refreshTokens(
  refreshToken: string,
  publishableKey: string
): Promise<T3KTokens> {
  const res = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: publishableKey,
    }),
  });

  if (!res.ok) throw new Error('Token refresh failed');

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

// ─── Uploads: limits and errors ───────────────────────────────────────────────

/**
 * Per-kind caps the mint endpoint enforces. Mirrors the API so a UI can size a
 * file picker and refuse an impossible file before spending a round trip — the
 * API re-checks everything, and it is the authority.
 */
export const T3K_UPLOAD_LIMITS: Record<UploadKind, { maxBytes: number; extensions: string[] }> = {
  model: { maxBytes: 256 * 1024 * 1024, extensions: ['nam', 'wav', 'aidax', 'aasnapshot', 'json'] },
  audio: { maxBytes: 64 * 1024 * 1024, extensions: ['wav'] },
  image: { maxBytes: 5 * 1024 * 1024, extensions: ['jpg', 'jpeg', 'png', 'webp'] },
};

/** Up to 25 files per mint request. */
export const T3K_MAX_UPLOADS_PER_REQUEST = 25;

/** Which leg of the mint → PUT → consume flow failed. */
export type T3KRequestStage = 'mint' | 'put' | 'consume' | 'request';

/**
 * Which 409 the API answered with. Every one of them means this handle is
 * finished; the recovery is always a fresh mint, never a retry.
 */
export type UploadConflictReason =
  | 'expired'
  | 'already_used'
  | 'no_bytes'
  | 'modified'
  | 'size_mismatch'
  | 'unknown';

export interface T3KApiErrorInit {
  message: string;
  status: number;
  stage: T3KRequestStage;
  serverMessage: string;
  remint: boolean;
  conflict?: UploadConflictReason | null;
  storageCode?: string | null;
  uploadId?: string | null;
}

/**
 * An API or storage failure with the server's own words preserved.
 *
 * `message` is the actionable sentence to show a user; `serverMessage` is the
 * response body verbatim, never swallowed. `remint` says whether the fix is to
 * mint a new upload_id and PUT the file again.
 */
export class T3KApiError extends Error {
  readonly status: number;
  readonly stage: T3KRequestStage;
  readonly serverMessage: string;
  /** Set when the status is 409; tells the four conditions apart. */
  readonly conflict: UploadConflictReason | null;
  /** S3 error code on a failed PUT (SignatureDoesNotMatch, ExpiredToken, …). */
  readonly storageCode: string | null;
  /** The handle in play, so a caller can retry a placement 500 with the same one. */
  readonly uploadId: string | null;
  /** True when this handle is finished and the fix is a fresh mint. Never a retry signal on its own. */
  readonly remint: boolean;

  constructor(init: T3KApiErrorInit) {
    super(init.message);
    this.name = 'T3KApiError';
    this.status = init.status;
    this.stage = init.stage;
    this.serverMessage = init.serverMessage;
    this.conflict = init.conflict ?? null;
    this.storageCode = init.storageCode ?? null;
    this.uploadId = init.uploadId ?? null;
    this.remint = init.remint;
  }
}

/** All five 409s read the same to a status check, so tell them apart by text. */
function classifyConflict(serverMessage: string): UploadConflictReason {
  if (/has expired/i.test(serverMessage)) return 'expired';
  if (/already been used/i.test(serverMessage)) return 'already_used';
  if (/No file has been uploaded/i.test(serverMessage)) return 'no_bytes';
  if (/changed after it was validated/i.test(serverMessage)) return 'modified';
  // "The uploaded file is <N> bytes but <M> were declared."
  if (/were declared/i.test(serverMessage)) return 'size_mismatch';
  return 'unknown';
}

/** The consume 500s that roll the handle back to unspent, by response body. */
function isPlacementFailure(serverMessage: string): boolean {
  return /Failed to store/i.test(serverMessage);
}

function explainStatus(
  stage: T3KRequestStage,
  status: number,
  serverMessage: string,
  conflict: UploadConflictReason | null
): { message: string; remint: boolean } {
  const detail = serverMessage ? ` ${serverMessage}` : '';
  switch (status) {
    case 400:
      if (/contents do not match/i.test(serverMessage)) {
        return {
          message: `The file is not the type its extension claims, so TONE3000 refused it (400).${detail}`,
          remint: true,
        };
      }
      return { message: `TONE3000 rejected the request as invalid (400).${detail}`, remint: false };
    case 401:
      return {
        message: `Not authenticated (401). Reconnect to TONE3000 and try again.${detail}`,
        remint: false,
      };
    case 403:
      return {
        message: `Your TONE3000 account is not allowed to do this (403). Tones can only be edited by the account that owns them.${detail}`,
        remint: false,
      };
    case 404:
      if (/upload_id not found/i.test(serverMessage)) {
        return {
          message:
            'That upload_id is unknown, belongs to another account, or was minted for a different kind of file (404). Mint a new upload and PUT the file again.',
          remint: true,
        };
      }
      return { message: `Not found (404).${detail}`, remint: false };
    case 409:
      switch (conflict) {
        case 'expired':
          return {
            message:
              'The upload_id expired (409). Handles last 24 hours from the mint. Mint a new upload and PUT the file again.',
            remint: true,
          };
        case 'already_used':
          return {
            message:
              'That upload_id was already spent (409). Each handle is single use, so do not retry it. Mint a new upload for another copy.',
            remint: true,
          };
        case 'no_bytes':
          return {
            message:
              'No file has reached storage for this upload_id (409). The PUT never ran or did not finish. Mint a new upload and PUT the file again.',
            remint: true,
          };
        case 'modified':
          return {
            message:
              'The staged file changed after TONE3000 validated it (409). PUT each presigned URL exactly once, then mint a new upload and try again.',
            remint: true,
          };
        case 'size_mismatch':
          return {
            message:
              'The staged file is not the size that was declared at mint (409). Storage normally makes this impossible, so if you see it, mint a new upload and PUT the file again.',
            remint: true,
          };
        default:
          return { message: `The upload_id can no longer be used (409).${detail}`, remint: true };
      }
    case 413:
      return {
        message: `The file is larger than the limit for this upload (413). Send a smaller file. Re-minting will not help.${detail}`,
        remint: false,
      };
    case 422:
      return {
        message: `TONE3000 accepted the file but the target cannot hold it (422). A tone tops out at 300 models.${detail}`,
        remint: false,
      };
    case 500:
      if (stage === 'consume') {
        if (isPlacementFailure(serverMessage)) {
          return {
            message: `TONE3000 failed while storing the file (500). This is the one 500 that leaves the upload_id unspent, so retrying the identical request with the same handle is safe for the rest of its 24 hours.${detail}`,
            remint: false,
          };
        }
        return {
          message: `TONE3000 failed after storing the file (500). The upload_id is spent, so do not retry it.${detail}`,
          remint: true,
        };
      }
      return {
        message: `TONE3000 failed to mint the upload URL (500). No handle was issued; retry the request.${detail}`,
        remint: false,
      };
    default:
      return { message: `Request failed (${status}).${detail}`, remint: false };
  }
}

/** Read `{ error }` off a failed API response and turn it into a T3KApiError. */
async function apiError(
  res: Response,
  stage: T3KRequestStage,
  uploadId?: string | null
): Promise<T3KApiError> {
  const body = await res.json().catch(() => ({}));
  const serverMessage = (body as { error?: string }).error ?? res.statusText ?? '';
  const conflict = res.status === 409 ? classifyConflict(serverMessage) : null;
  const { message, remint } = explainStatus(stage, res.status, serverMessage, conflict);
  return new T3KApiError({
    message,
    status: res.status,
    stage,
    serverMessage,
    conflict,
    remint,
    uploadId: uploadId ?? null,
  });
}

/** A precondition this client checked itself, before any request went out. */
function localError(message: string, stage: T3KRequestStage, uploadId: string | null = null): T3KApiError {
  return new T3KApiError({ message, status: 0, stage, serverMessage: '', remint: false, uploadId });
}

/** Storage answers a failed PUT with XML, not JSON. */
function storageError(status: number, body: string, uploadId: string | null): T3KApiError {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? null;
  const detail = /<Message>([^<]+)<\/Message>/.exec(body)?.[1] ?? body.slice(0, 200);
  const serverMessage = code ? `${code}: ${detail}` : detail;

  let message: string;
  let remint = true;
  if (status === 0) {
    message =
      'The upload never reached storage: the browser blocked it or the connection dropped. Check the network, then mint a new upload and try again.';
  } else if (code === 'SignatureDoesNotMatch') {
    message =
      'Storage rejected the upload signature (403). The PUT body must be exactly the size_bytes declared at mint, so send the original file untouched and never a re-encoded or resized copy.';
  } else if (code === 'ExpiredToken') {
    message =
      'The presigned URL expired (400). A URL is good for 1 hour from the mint, even though the upload_id lasts 24 hours. Mint a new upload and PUT again.';
  } else if (code === 'EntityTooLarge') {
    message = `Storage refused the file as too large (${status}). Send a smaller file. Re-minting will not help.`;
    remint = false;
  } else {
    message = `Storage refused the upload (${status}). ${serverMessage}`;
  }

  return new T3KApiError({
    message,
    status,
    stage: 'put',
    serverMessage,
    storageCode: code,
    remint,
    uploadId,
  });
}

// ─── Authenticated API client ─────────────────────────────────────────────────

const STORAGE_KEY = 't3k_tokens';

/**
 * T3KClient — Authenticated API client with automatic token refresh.
 *
 * Create one instance at module scope. Tokens are stored in sessionStorage
 * by default — they survive page refreshes within a tab but are cleared when
 * the tab closes. For cross-session persistence without re-auth, store the
 * refresh token server-side and call POST /api/v1/oauth/token on page load.
 *
 * @param publishableKey - Your `t3k_pub_` key (same as `client_id` in OAuth)
 * @param onAuthRequired - Called when tokens are missing or expired beyond refresh.
 *                         Typically you'd call startStandardFlow() here to silently
 *                         re-authenticate (the user won't see a login screen if
 *                         they still have an active TONE3000 session).
 */
export class T3KClient {
  private refreshPromise: Promise<T3KTokens> | null = null;

  constructor(
    private readonly publishableKey: string,
    private readonly onAuthRequired: () => void
  ) {}

  setTokens(tokens: T3KTokens): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  getTokens(): T3KTokens | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as T3KTokens) : null;
  }

  clearTokens(): void {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  isConnected(): boolean {
    return this.getTokens() !== null;
  }

  private async getAccessToken(): Promise<string> {
    const tokens = this.getTokens();
    if (!tokens) {
      this.onAuthRequired();
      throw new Error('Not authenticated');
    }

    // Proactively refresh 60 s before expiry to avoid mid-request failures
    if (Date.now() > tokens.expires_at - 60_000) {
      if (!this.refreshPromise) {
        this.refreshPromise = refreshTokens(tokens.refresh_token, this.publishableKey)
          .then((t) => { this.setTokens(t); this.refreshPromise = null; return t; })
          .catch((err) => {
            this.clearTokens();
            this.refreshPromise = null;
            this.onAuthRequired();
            throw err;
          });
      }
      return (await this.refreshPromise).access_token;
    }

    return tokens.access_token;
  }

  /** Make an authenticated request to the TONE3000 API. */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.getAccessToken();
    const res = await globalThis.fetch(`${T3K_API}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });

    // Retry once on 401 — handles expiry race conditions between refresh check and request
    if (res.status === 401) {
      const stored = this.getTokens();
      if (stored) {
        this.setTokens({ ...stored, expires_at: 0 }); // force a refresh on next call
        const retryToken = await this.getAccessToken();
        return globalThis.fetch(`${T3K_API}${path}`, {
          ...init,
          headers: { ...init?.headers, Authorization: `Bearer ${retryToken}` },
        });
      }
    }

    return res;
  }

  // ── Resource methods ──────────────────────────────────────────────────────────

  /** Get the authenticated user's profile. */
  async getUser(): Promise<User> {
    const res = await this.fetch('/api/v1/user');
    if (!res.ok) throw new Error(`getUser failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get a tone by ID. Returns tone metadata only — models are not embedded.
   * To get download URLs, call `listModels(tone.id)` after fetching the tone.
   */
  async getTone(id: number | string): Promise<Tone> {
    const res = await this.fetch(`/api/v1/tones/${id}`);
    if (!res.ok) throw new Error(`getTone failed: ${res.status}`);
    return res.json();
  }

  /** Get a model by ID. */
  async getModel(id: number | string): Promise<Model> {
    const res = await this.fetch(`/api/v1/models/${id}`);
    if (!res.ok) throw new Error(`getModel failed: ${res.status}`);
    return res.json();
  }

  /** Search and filter the TONE3000 tone catalog. */
  async searchTones(params?: SearchTonesParams): Promise<PaginatedResponse<Tone>> {
    const res = await this.fetch(`/api/v1/tones/search?${buildSearchTonesQuery(params)}`);
    if (!res.ok) throw new Error(`searchTones failed: ${res.status}`);
    return res.json();
  }

  /** Get tones created by the authenticated user. */
  async listCreatedTones(params?: ListCreatedTonesParams): Promise<PaginatedResponse<Tone>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('page_size', String(params.pageSize));
    const res = await this.fetch(`/api/v1/tones/created?${qs}`);
    if (!res.ok) throw new Error(`listCreatedTones failed: ${res.status}`);
    return res.json();
  }

  /** Get tones favorited by the authenticated user. */
  async listFavoritedTones(params?: ListFavoritedTonesParams): Promise<PaginatedResponse<Tone>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('page_size', String(params.pageSize));
    const res = await this.fetch(`/api/v1/tones/favorited?${qs}`);
    if (!res.ok) throw new Error(`listFavoritedTones failed: ${res.status}`);
    return res.json();
  }

  /** List models for a tone. */
  async listModels(toneId: number | string, params?: ListModelsParams): Promise<PaginatedResponse<Model>> {
    const qs = new URLSearchParams();
    qs.set('tone_id', String(toneId));
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('page_size', String(params.pageSize));
    if (params?.architecture != null) qs.set('architecture', String(params.architecture));
    const res = await this.fetch(`/api/v1/models?${qs}`);
    if (!res.ok) throw new Error(`listModels failed: ${res.status}`);
    return res.json();
  }

  /** Get public users, sortable by activity metrics. */
  async listUsers(params?: ListUsersParams): Promise<PaginatedResponse<PublicUser>> {
    const qs = new URLSearchParams();
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('page_size', String(params.pageSize));
    if (params?.query) qs.set('query', params.query);
    const res = await this.fetch(`/api/v1/users?${qs}`);
    if (!res.ok) throw new Error(`listUsers failed: ${res.status}`);
    return res.json();
  }

  /**
   * Download a model file and trigger a browser file download.
   * The `model_url` from the API must be fetched with Bearer auth — use this
   * method rather than calling fetch(model_url) directly.
   */
  async downloadModel(modelUrl: string, name: string): Promise<void> {
    // Strip the base URL so client.fetch() can prepend T3K_API + auth header
    const path = modelUrl.replace(T3K_API, '');
    const res = await this.fetch(path);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    // Use the extension from the storage URL with a human-readable name
    const storageFilename = new URL(modelUrl).pathname.split('/').pop() ?? '';
    const ext = storageFilename.includes('.') ? '.' + storageFilename.split('.').pop() : '';
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = sanitized + ext;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Uploads ───────────────────────────────────────────────────────────────────

  /**
   * Mint one presigned upload URL.
   *
   * `size_bytes` must be the file's real length: it is signed into the URL, so
   * a file of any other size is refused by storage, not by us. The returned
   * ticket carries two clocks — `url_expires_at` (1 h, the PUT deadline) and
   * `expires_at` (24 h, the upload_id deadline).
   */
  async createUpload(file: CreateUploadRequest): Promise<UploadTicket> {
    const res = await this.fetch('/api/v1/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
    if (!res.ok) throw await apiError(res, 'mint');
    return res.json();
  }

  /**
   * Mint up to 25 upload URLs in one round trip — a training set is ten files.
   * All or nothing: one bad entry rejects the batch and leaves no handles
   * behind. Tickets come back in request order and kinds may be mixed.
   */
  async createUploads(files: CreateUploadRequest[]): Promise<UploadTicket[]> {
    if (files.length === 0) throw localError('createUploads needs at least one file.', 'request');
    if (files.length > T3K_MAX_UPLOADS_PER_REQUEST) {
      throw localError(
        `createUploads takes at most ${T3K_MAX_UPLOADS_PER_REQUEST} files per request (got ${files.length}). Split the batch.`,
        'request'
      );
    }
    const res = await this.fetch('/api/v1/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploads: files }),
    });
    if (!res.ok) throw await apiError(res, 'mint');
    const data: CreateUploadBatchResponse = await res.json();
    return data.uploads;
  }

  /**
   * PUT a File or Blob straight to storage.
   *
   * XMLHttpRequest rather than fetch: fetch exposes no upload-progress event,
   * and the files this flow exists for are tens of megabytes. `Content-Length`
   * is a forbidden header for scripts, so `ticket.headers` cannot be sent —
   * the browser derives it from `file.size`, which is exactly the length the
   * URL was signed for as long as the file is the untouched one you declared
   * at mint. A ReadableStream body will not work here; pass the File itself.
   */
  putUpload(
    ticket: UploadTicket,
    file: Blob,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    const signedBytes = Number(ticket.headers['Content-Length']);
    if (Number.isFinite(signedBytes) && file.size !== signedBytes) {
      return Promise.reject(
        localError(
          `This file is ${file.size} bytes but the upload was minted for ${signedBytes}. Storage signs the length and rejects anything else, so mint a new upload with the real size.`,
          'put',
          ticket.upload_id
        )
      );
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      // Straight to storage: no API prefix, no Authorization header. The
      // signature in the URL is the credential.
      xhr.open(ticket.method, ticket.url, true);
      xhr.upload.onprogress = (event) => {
        if (!onProgress) return;
        const totalBytes = event.lengthComputable ? event.total : file.size;
        onProgress({
          phase: 'uploading',
          loadedBytes: event.loaded,
          totalBytes,
          fraction: totalBytes ? event.loaded / totalBytes : 0,
        });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.({
            phase: 'uploading',
            loadedBytes: file.size,
            totalBytes: file.size,
            fraction: 1,
          });
          resolve();
          return;
        }
        reject(storageError(xhr.status, xhr.responseText ?? '', ticket.upload_id));
      };
      // Storage sends no error body a script can read here, so status 0 it is.
      xhr.onerror = () => reject(storageError(0, '', ticket.upload_id));
      xhr.onabort = () => reject(localError('The upload was canceled.', 'put', ticket.upload_id));
      xhr.send(file);
    });
  }

  /**
   * Create a model from a staged upload. The file must already be in storage:
   * this spends the upload_id, copies the bytes into the models bucket, and is
   * the step that validates them (a .nam must parse as JSON, an IR must be 60 s
   * or less). The tone's format has to match the file's.
   */
  async createModelFromUpload(params: CreateModelFromUploadParams): Promise<Model> {
    const res = await this.fetch('/api/v1/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tone_id: params.toneId,
        upload_id: params.uploadId,
        ...(params.name ? { name: params.name } : {}),
      }),
    });
    if (!res.ok) throw await apiError(res, 'consume', params.uploadId);
    return res.json();
  }

  /**
   * Create a tone, optionally taking its image from a staged upload. Pass at
   * most one of `imageUrl` / `imageUploadId` — sending both is a 400.
   */
  async createTone(params: CreateToneParams): Promise<Tone> {
    const body: Record<string, unknown> = {
      title: params.title,
      gear: params.gear,
      format: params.format,
    };
    if (params.description !== undefined) body.description = params.description;
    if (params.isPublic !== undefined) body.is_public = params.isPublic;
    if (params.license !== undefined) body.license = params.license;
    if (params.links !== undefined) body.links = params.links;
    if (params.makes !== undefined) body.makes = params.makes;
    if (params.tags !== undefined) body.tags = params.tags;
    if (params.imageUrl !== undefined) body.image_url = params.imageUrl;
    if (params.imageUploadId !== undefined) body.image_upload_id = params.imageUploadId;

    const res = await this.fetch('/api/v1/tones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await apiError(res, 'consume', params.imageUploadId ?? null);
    return res.json();
  }

  /**
   * Start one training per recording against a tone you already own.
   *
   * This is what a capture station calls. Mint an audio upload, PUT the
   * recording, and pass the handle here. Each output becomes one model on the
   * tone once its training succeeds.
   *
   * The audio has to be mono, 48 kHz, 24-bit PCM and 3:10 long, which is what
   * you get by playing T3K-sweep-v3.wav through the rig and recording the
   * result. A file that misses the spec is a 400 naming the output.
   */
  async startTrainings(params: StartTrainingsParams): Promise<StartTrainingsResponse> {
    const res = await this.fetch('/api/v1/trainings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tone_id: params.toneId,
        type: TRAIN_TYPE_SWEEP_V3,
        outputs: params.outputs.map((o) => ({ upload_id: o.uploadId, name: o.name })),
        ...(params.maxEpochs ? { max_epochs: params.maxEpochs } : {}),
      }),
    });
    // Any one output's handle can be the one that failed, so there is no single
    // upload_id to blame here.
    if (!res.ok) throw await apiError(res, 'consume', null);
    return res.json();
  }

  /**
   * Trainings for a tone, newest first. Poll this to drive a progress UI:
   * `status` is running until the trainer finishes, `epochs` against
   * `max_epochs` gives a fraction, and `model` is populated once it succeeds.
   */
  async listTrainings(toneId: number | string): Promise<PaginatedResponse<Training>> {
    const res = await this.fetch(`/api/v1/trainings?tone_id=${encodeURIComponent(String(toneId))}`);
    if (!res.ok) throw new Error(`listTrainings failed: ${res.status}`);
    return res.json();
  }

  /**
   * Point an existing tone at a staged image. Replaces the tone's images
   * wholesale, and the image it supersedes is deleted. Ownership is checked
   * before the handle is resolved here, so a 403 or 404 on the tone is reported
   * ahead of any upload problem.
   */
  async setToneImage(toneId: number | string, imageUploadId: string): Promise<Tone> {
    const res = await this.fetch(`/api/v1/tones/${toneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_upload_id: imageUploadId }),
    });
    if (!res.ok) throw await apiError(res, 'consume', imageUploadId);
    return res.json();
  }

  /**
   * Run the whole flow for one file: mint → PUT → consume, reporting progress
   * throughout. This is the method to copy for a real integration.
   *
   * Every failure arrives as a T3KApiError carrying the server's own message,
   * the stage it failed at, and `remint` — true when this handle is finished
   * and only a fresh one will do. `remint === false` is not a retry signal:
   * 401/403 are auth and ownership, 400/413/422 mean the request itself has to
   * change, and the only retryable case is the consume 500 whose body starts
   * "Failed to store", which leaves the handle unspent for the rest of its 24
   * hours. Every other consume 500 may already have created the resource, so
   * ask the resource endpoint before sending anything again.
   */
  uploadFile(
    file: File,
    target: Extract<UploadTarget, { resource: 'model' }>,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Model>;
  uploadFile(
    file: File,
    target: Extract<UploadTarget, { resource: 'tone-image' }>,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Tone>;
  uploadFile(
    file: File,
    target: UploadTarget,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Model | Tone>;
  async uploadFile(
    file: File,
    target: UploadTarget,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Model | Tone> {
    const kind = target.resource === 'model' ? UploadKind.Model : UploadKind.Image;
    const limit = T3K_UPLOAD_LIMITS[kind];
    const extension = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!limit.extensions.includes(extension)) {
      throw localError(
        `${file.name} is not a supported ${kind} file (expected ${limit.extensions
          .map((e) => `.${e}`)
          .join(', ')}).`,
        'request'
      );
    }
    if (file.size > limit.maxBytes) {
      throw localError(
        `${file.name} is ${file.size} bytes, over the ${Math.round(limit.maxBytes / (1024 * 1024))} MiB limit for ${kind} uploads.`,
        'request'
      );
    }

    const report = (phase: UploadProgress['phase'], loadedBytes: number, fraction: number) =>
      onProgress?.({ phase, loadedBytes, totalBytes: file.size, fraction });

    report('minting', 0, 0);
    const ticket = await this.createUpload({ kind, filename: file.name, size_bytes: file.size });

    await this.putUpload(ticket, file, onProgress);

    report('consuming', file.size, 1);
    const created =
      target.resource === 'model'
        ? await this.createModelFromUpload({
            toneId: target.toneId,
            uploadId: ticket.upload_id,
            name: target.name,
          })
        : await this.setToneImage(target.toneId, ticket.upload_id);

    report('done', file.size, 1);
    return created;
  }
}
