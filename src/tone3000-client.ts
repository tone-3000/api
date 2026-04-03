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
import type {
  User, Tone, Model, PublicUser,
  PaginatedResponse, SearchTonesParams, ListUsersParams,
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
  | { ok: true; tokens: T3KTokens; toneId?: string; modelId?: string }
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
 * @param gears - Optional underscore-separated gear filter (e.g. 'amp_pedal')
 */
export async function startSelectFlow(
  publishableKey: string,
  redirectUri: string,
  options?: { gears?: string }
): Promise<void> {
  const pkce = await buildPkceParams();
  const extra: Record<string, string> = { prompt: 'select_tone' };
  if (options?.gears) extra.gears = options.gears;
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
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
 * the callback may differ from the one you requested.
 */
export async function startLoadToneFlow(
  publishableKey: string,
  redirectUri: string,
  toneId: number | string
): Promise<void> {
  const pkce = await buildPkceParams();
  window.location.href = buildAuthorizeUrl(
    publishableKey, redirectUri,
    { prompt: 'load_tone', tone_id: String(toneId) },
    pkce
  );
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
  redirectUri: string
): Promise<void> {
  const pkce = await buildPkceParams();
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, {}, pkce);
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

  const storedState = sessionStorage.getItem('t3k_state');
  const codeVerifier = sessionStorage.getItem('t3k_code_verifier');

  // Clean up PKCE state regardless of outcome
  sessionStorage.removeItem('t3k_state');
  sessionStorage.removeItem('t3k_code_verifier');

  // Verify state to prevent CSRF
  if (returnedState !== storedState) {
    return { ok: false, error: 'state_mismatch' };
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
    return { ok: false, error: (err as any).error ?? 'token_exchange_failed' };
  }

  const data = await res.json();
  const tokens: T3KTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return { ok: true, tokens, toneId, modelId };
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
   * Get a tone by ID. The response includes an embedded `models` array
   * with pre-signed download URLs for each model file.
   */
  async getTone(id: number | string): Promise<Tone & { models: Model[] }> {
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
    const qs = new URLSearchParams();
    if (params?.query) qs.set('query', params.query);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('page_size', String(params.pageSize));
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.gear?.length) qs.set('gear', params.gear.join('_')); // underscore-separated (preferred)
    if (params?.sizes?.length) qs.set('sizes', params.sizes.join('-')); // hyphen-separated (preferred)
    const res = await this.fetch(`/api/v1/tones/search?${qs}`);
    if (!res.ok) throw new Error(`searchTones failed: ${res.status}`);
    return res.json();
  }

  /** Get tones created by the authenticated user. */
  async listCreatedTones(page = 1, pageSize = 10): Promise<PaginatedResponse<Tone>> {
    const res = await this.fetch(`/api/v1/tones/created?page=${page}&page_size=${pageSize}`);
    if (!res.ok) throw new Error(`listCreatedTones failed: ${res.status}`);
    return res.json();
  }

  /** Get tones favorited by the authenticated user. */
  async listFavoritedTones(page = 1, pageSize = 10): Promise<PaginatedResponse<Tone>> {
    const res = await this.fetch(`/api/v1/tones/favorited?page=${page}&page_size=${pageSize}`);
    if (!res.ok) throw new Error(`listFavoritedTones failed: ${res.status}`);
    return res.json();
  }

  /** List models for a tone. */
  async listModels(toneId: number | string, page = 1, pageSize = 10): Promise<PaginatedResponse<Model>> {
    const res = await this.fetch(`/api/v1/models?tone_id=${toneId}&page=${page}&page_size=${pageSize}`);
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
}
