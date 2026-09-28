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
  User, Tone, Model, PublicUser, PublicMake, PublicTag, Favorite, ToneDownload,
  PaginatedResponse, ToneFeed, SearchTonesParams, ListModelsParams, ListLibraryParams,
  ListUsersParams, ListTaxonomyParams, ArchitectureParam, Gear, Format,
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
  | { ok: true; tokens: T3KTokens; toneId?: string; canceled?: boolean }
  | { ok: false; error: string };

/**
 * Optional authorize-URL params shared by every flow.
 * See https://www.tone3000.com/api#authentication for the full table.
 */
export interface AuthorizeOptions {
  /** Pre-fill the sign-in email. Malformed values are ignored. */
  loginHint?: string;
  /** UI language. `zh-CN` for Simplified Chinese; anything else falls back to English. */
  locale?: string;
  /** Show back / forward / refresh / close controls. Recommended for popups and webviews. */
  menubar?: boolean;
}

/** Catalog filters for the select_tone and load_tone flows. */
export interface CatalogOptions extends AuthorizeOptions {
  /** Underscore-separated gear filter, e.g. `amp_amp-cab`. */
  gears?: string;
  format?: Format | `${Format}`;
  /** Omit for the legacy A1 + Custom default (excludes A2). */
  architecture?: ArchitectureParam;
  /** Only show tones with at least one calibrated model. */
  calibrated?: boolean;
}

export interface SelectOptions extends CatalogOptions {
  /** Render audition players in the flow so users can hear tones before picking. */
  preview?: boolean;
}

export type LoadToneOptions = CatalogOptions;

/** API failure that preserves the HTTP status for callers. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(`${message}: ${status}`);
    this.name = 'ApiError';
  }

  /** 429 (rate limited) or 403 (e.g. partner-only endpoint or WAF deny). */
  get isRateLimit(): boolean {
    return this.status === 429;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

// ─── Internal PKCE helpers ────────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256Base64url(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64url(new Uint8Array(hash));
}

/** Generate a verifier/challenge/state and stash the secrets for the callback. */
async function buildPkceParams(): Promise<{ codeChallenge: string; state: string }> {
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const codeChallenge = await sha256Base64url(codeVerifier);
  sessionStorage.setItem('t3k_code_verifier', codeVerifier);
  sessionStorage.setItem('t3k_state', state);
  return { codeChallenge, state };
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

/** Translate camelCase options into authorize query params. */
function authorizeParams(options?: SelectOptions): Record<string, string> {
  const p: Record<string, string> = {};
  if (!options) return p;
  if (options.loginHint) p.login_hint = options.loginHint;
  if (options.locale) p.locale = options.locale;
  if (options.menubar) p.menubar = 'true';
  if (options.gears) p.gears = options.gears;
  if (options.format) p.format = options.format;
  if (options.architecture != null) p.architecture = String(options.architecture);
  if (options.calibrated) p.calibrated = 'true';
  if (options.preview) p.preview = 'true';
  return p;
}

function openCenteredPopup(url: string, name: string): Window | null {
  const width = 480;
  const height = 700;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  return window.open(
    url,
    name,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`
  );
}

/**
 * Open a popup whose sessionStorage copy carries `t3k_popup_mode`, so the page
 * that loads at redirect_uri knows to relay the callback instead of handling it.
 */
function openFlowPopup(url: string, name: string): Window | null {
  sessionStorage.setItem('t3k_popup_mode', '1');
  const popup = openCenteredPopup(url, name);
  sessionStorage.removeItem('t3k_popup_mode');
  return popup;
}

// ─── Flow initiators ──────────────────────────────────────────────────────────

/**
 * **Select Flow** — Send the user to TONE3000 to browse and pick a tone.
 *
 * After the user selects a tone, they're redirected back to `redirectUri` with
 * an authorization code and the selected `tone_id`. Pass `gears`, `format`,
 * `architecture`, or `calibrated` to scope the catalog to what your product
 * can load, and `preview: true` to let users audition tones in the flow.
 */
export async function startSelectFlow(
  publishableKey: string,
  redirectUri: string,
  options?: SelectOptions
): Promise<void> {
  const pkce = await buildPkceParams();
  const extra = { prompt: 'select_tone', ...authorizeParams(options) };
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
}

/**
 * **Select Flow (Popup)** — Same as `startSelectFlow` but in a popup window.
 *
 * The page at `redirectUri` relays the callback back via `postMessage` (or
 * `BroadcastChannel('t3k_oauth')` when the opener reference is lost) — handle
 * it with `handleOAuthCallbackFromPopup`.
 */
export async function startSelectFlowPopup(
  publishableKey: string,
  redirectUri: string,
  options?: SelectOptions
): Promise<Window | null> {
  const pkce = await buildPkceParams();
  const extra = { prompt: 'select_tone', ...authorizeParams(options) };
  return openFlowPopup(buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce), 't3k_select');
}

/**
 * **Load Tone Flow** — Authenticate the user and verify access to a known tone.
 *
 * If the tone is accessible TONE3000 redirects straight back. If it's private
 * or deleted, the user can browse for a replacement — so the `tone_id` in the
 * callback may differ from the one you requested. Catalog filters apply to
 * that replacement browse view.
 */
export async function startLoadToneFlow(
  publishableKey: string,
  redirectUri: string,
  toneId: number | string,
  options?: LoadToneOptions
): Promise<void> {
  const pkce = await buildPkceParams();
  const extra = { prompt: 'load_tone', tone_id: String(toneId), ...authorizeParams(options) };
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce);
}

/** **Load Tone Flow (Popup)** — Same as `startLoadToneFlow` but in a popup window. */
export async function startLoadToneFlowPopup(
  publishableKey: string,
  redirectUri: string,
  toneId: number | string,
  options?: LoadToneOptions
): Promise<Window | null> {
  const pkce = await buildPkceParams();
  const extra = { prompt: 'load_tone', tone_id: String(toneId), ...authorizeParams(options) };
  return openFlowPopup(buildAuthorizeUrl(publishableKey, redirectUri, extra, pkce), 't3k_load_tone');
}

/**
 * **Standard Flow** — Connect the user's TONE3000 account (no tone picking).
 *
 * Use this for Full API integrations: after connecting, your app can call any
 * endpoint with the access token.
 */
export async function startStandardFlow(
  publishableKey: string,
  redirectUri: string,
  options?: AuthorizeOptions
): Promise<void> {
  const pkce = await buildPkceParams();
  window.location.href = buildAuthorizeUrl(publishableKey, redirectUri, authorizeParams(options), pkce);
}

/**
 * **LAN-relay Flow** — For headless devices on a LAN. The device opens an HTTP
 * listener at an RFC1918 address; the user scans a QR with their phone,
 * completes auth in the phone browser, and the OAuth code lands at the
 * device's LAN listener via TONE3000's bridge.
 *
 * This helper only generates the authorize URL — receiving the callback
 * requires a real LAN listener (see vite-plugin-lan-bridge.ts for the
 * dev-time implementation). Pair it with `exchangeCode()` once the listener
 * captures code + state.
 *
 * @param lanCallbackUri  Must be `http://` to RFC1918 / link-local
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

// ─── Callback handling ────────────────────────────────────────────────────────

async function tokensFromResponse(res: Response): Promise<T3KTokens> {
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

async function redeemCode(
  publishableKey: string,
  redirectUri: string,
  code: string,
  codeVerifier: string,
): Promise<{ ok: true; tokens: T3KTokens } | { ok: false; error: string }> {
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
  return { ok: true, tokens: await tokensFromResponse(res) };
}

/** Raw callback params, whether read from the URL or relayed from a popup. */
interface CallbackParams {
  code: string | null;
  state: string | null;
  error: string | null;
  toneId: string | null;
  canceled: boolean;
}

/**
 * Verify state, then exchange the code. PKCE secrets are cleared regardless
 * of outcome so a replayed callback can't reuse them.
 */
async function completeCallback(
  publishableKey: string,
  redirectUri: string,
  params: CallbackParams,
): Promise<OAuthCallbackResult> {
  const storedState = sessionStorage.getItem('t3k_state');
  const codeVerifier = sessionStorage.getItem('t3k_code_verifier');
  sessionStorage.removeItem('t3k_state');
  sessionStorage.removeItem('t3k_code_verifier');

  if (params.state !== storedState) return { ok: false, error: 'state_mismatch' };
  // Closed via the menubar before signing in: no code to exchange.
  if (params.canceled && !params.code) return { ok: false, error: 'canceled' };
  if (params.error) return { ok: false, error: params.error };
  if (!params.code || !codeVerifier) return { ok: false, error: 'missing_code' };

  const result = await redeemCode(publishableKey, redirectUri, params.code, codeVerifier);
  if (!result.ok) return result;
  return {
    ok: true,
    tokens: result.tokens,
    toneId: params.toneId ?? undefined,
    ...(params.canceled ? { canceled: true } : {}),
  };
}

/**
 * Handle the OAuth callback after TONE3000 redirects back to your app.
 *
 * Call this once when your callback page loads with `?code=`, `?error=`, or
 * `?canceled=`. Returns tokens plus the `tone_id` for select/load flows.
 * `canceled: true` with tokens means the user signed in but closed the flow
 * before picking a tone.
 */
export async function handleOAuthCallback(
  publishableKey: string,
  redirectUri: string
): Promise<OAuthCallbackResult> {
  const params = new URLSearchParams(window.location.search);
  return completeCallback(publishableKey, redirectUri, {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    toneId: params.get('tone_id'),
    canceled: params.get('canceled') === 'true',
  });
}

/**
 * Handle an OAuth callback relayed from a popup. Pass events from both a
 * `message` listener and a `BroadcastChannel('t3k_oauth')` listener. Returns
 * `null` if the event isn't a TONE3000 callback.
 */
export async function handleOAuthCallbackFromPopup(
  publishableKey: string,
  redirectUri: string,
  event: MessageEvent
): Promise<OAuthCallbackResult | null> {
  if (event.data?.type !== 't3k_oauth_callback') return null;
  const { code, state, error, tone_id, canceled } = event.data;
  return completeCallback(publishableKey, redirectUri, {
    code: code ?? null,
    state: state ?? null,
    error: error ?? null,
    toneId: tone_id ?? null,
    canceled: Boolean(canceled),
  });
}

/**
 * Exchange an authorization code captured outside the URL (e.g. by the
 * LAN-relay listener). Verifies `returnedState` against the stored state.
 */
export async function exchangeCode(
  publishableKey: string,
  redirectUri: string,
  code: string,
  returnedState: string,
): Promise<OAuthCallbackResult> {
  return completeCallback(publishableKey, redirectUri, {
    code, state: returnedState, error: null, toneId: null, canceled: false,
  });
}

// ─── Query building ───────────────────────────────────────────────────────────

/**
 * Serialize SearchTonesParams into the query string /api/v1/tones/search
 * expects. Exported so a UI can preview the exact request it's about to make.
 *
 * gears, sizes, tags and makes are underscore-separated. creators is
 * comma-separated: usernames may contain an underscore, so the API can't use
 * one as a delimiter there. Callers pass plain arrays and never see this.
 */
export function buildSearchTonesQuery(params?: SearchTonesParams): URLSearchParams {
  const qs = pageQuery(params);
  if (params?.query) qs.set('query', params.query);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.gears?.length) qs.set('gears', params.gears.join('_'));
  if (params?.format) qs.set('format', params.format);
  if (params?.sizes?.length) qs.set('sizes', params.sizes.join('_'));
  if (params?.tags?.length) qs.set('tags', params.tags.join('_'));
  if (params?.makes?.length) qs.set('makes', params.makes.join('_'));
  if (params?.creators?.length) qs.set('creators', params.creators.join(','));
  if (params?.architecture != null) qs.set('architecture', String(params.architecture));
  if (params?.calibrated) qs.set('calibrated', 'true');
  if (params?.verified) qs.set('verified', 'true');
  return qs;
}

function pageQuery(params?: { page?: number; pageSize?: number }): URLSearchParams {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('page_size', String(params.pageSize));
  return qs;
}

function withQuery(path: string, qs: URLSearchParams): string {
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Exchange a refresh token for a new access token. Throws `ApiError` with
 * status 400 when the refresh token itself has expired (`invalid_grant`).
 */
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
  if (!res.ok) throw new ApiError('Token refresh failed', res.status);
  return tokensFromResponse(res);
}

// ─── Authenticated API client ─────────────────────────────────────────────────

const STORAGE_KEY = 't3k_tokens';

/**
 * T3KClient — Authenticated API client with automatic token refresh.
 *
 * Create one instance at module scope. Tokens are stored in sessionStorage
 * by default — they survive page refreshes within a tab but are cleared when
 * the tab closes. For cross-session persistence, store the refresh token
 * server-side (or in platform secure storage for native apps).
 *
 * @param publishableKey - Your publishable key (the OAuth `client_id`)
 * @param onAuthRequired - Called when tokens are missing or the refresh token
 *                         has expired. Typically restarts an OAuth flow; the
 *                         user won't see a login screen if they still have an
 *                         active TONE3000 session.
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
          .then((t) => { this.setTokens(t); return t; })
          .catch((err) => {
            // invalid_grant (400/401) means the session is over; anything
            // else (network, 5xx) is transient and keeps the tokens.
            if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
              this.clearTokens();
              this.onAuthRequired();
            }
            throw err;
          })
          .finally(() => { this.refreshPromise = null; });
      }
      return (await this.refreshPromise).access_token;
    }

    return tokens.access_token;
  }

  /** Make an authenticated request to the TONE3000 API. */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.getAccessToken();
    let res = await globalThis.fetch(`${T3K_API}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });

    // Retry once on 401 — handles expiry races between refresh check and request
    if (res.status === 401) {
      const stored = this.getTokens();
      if (stored) {
        this.setTokens({ ...stored, expires_at: 0 }); // force a refresh on next call
        const retryToken = await this.getAccessToken();
        res = await globalThis.fetch(`${T3K_API}${path}`, {
          ...init,
          headers: { ...init?.headers, Authorization: `Bearer ${retryToken}` },
        });
      }
    }

    // Deprecated params still work but are flagged by response headers.
    const deprecations = res.headers.get('X-Tone3000-Deprecations');
    if (deprecations) console.warn(`[TONE3000] Deprecated API usage on ${path}: ${deprecations}`);

    return res;
  }

  private async getJson<T>(path: string, context: string, init?: RequestInit): Promise<T> {
    const res = await this.fetch(path, init);
    if (!res.ok) throw new ApiError(`${context} failed`, res.status);
    return res.json() as Promise<T>;
  }

  // ── User ─────────────────────────────────────────────────────────────────────

  /** Get the authenticated user's profile. */
  getUser(): Promise<User> {
    return this.getJson('/api/v1/user', 'getUser');
  }

  /** Public users with content, sortable by activity. Max page_size is 10. */
  listUsers(params?: ListUsersParams): Promise<PaginatedResponse<PublicUser>> {
    const qs = pageQuery(params);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.query) qs.set('query', params.query);
    return this.getJson(withQuery('/api/v1/users', qs), 'listUsers');
  }

  // ── Tones ────────────────────────────────────────────────────────────────────

  /**
   * Get a tone by ID. Models are not embedded — call `listModels(tone.id)`
   * for download URLs. `architecture` filters `models_count` for NAM tones.
   */
  getTone(id: number | string, params?: { architecture?: ArchitectureParam }): Promise<Tone> {
    const qs = new URLSearchParams();
    if (params?.architecture != null) qs.set('architecture', String(params.architecture));
    return this.getJson(withQuery(`/api/v1/tones/${id}`, qs), 'getTone');
  }

  /**
   * Search and filter the catalog. Heavily rate-limited by default — prefer
   * the Select flow for browsing, and debounce free-text input.
   */
  searchTones(params?: SearchTonesParams): Promise<PaginatedResponse<Tone>> {
    return this.getJson(withQuery('/api/v1/tones/search', buildSearchTonesQuery(params)), 'searchTones');
  }

  private listLibrary(endpoint: string, params?: ListLibraryParams): Promise<PaginatedResponse<Tone>> {
    const qs = pageQuery(params);
    if (params?.gear) qs.set('gear', params.gear);
    if (params?.query) qs.set('query', params.query);
    return this.getJson(withQuery(`/api/v1/tones/${endpoint}`, qs), `list ${endpoint} tones`);
  }

  /** Tones created by the authenticated user. */
  listCreatedTones(params?: ListLibraryParams): Promise<PaginatedResponse<Tone>> {
    return this.listLibrary('created', params);
  }

  /** Tones favorited by the authenticated user. */
  listFavoritedTones(params?: ListLibraryParams): Promise<PaginatedResponse<Tone>> {
    return this.listLibrary('favorited', params);
  }

  /** Tones downloaded by the authenticated user (each tone appears once). */
  listDownloadedTones(params?: ListLibraryParams): Promise<PaginatedResponse<Tone>> {
    return this.listLibrary('downloaded', params);
  }

  /** Top 10 trending tones, optionally for one gear type. Not paginated. */
  listTrendingTones(params?: { gear?: Gear }): Promise<ToneFeed> {
    const qs = new URLSearchParams();
    if (params?.gear) qs.set('gear', params.gear);
    return this.getJson(withQuery('/api/v1/tones/trending', qs), 'listTrendingTones');
  }

  /** The 10 most recently published tones. Not paginated. */
  listLatestTones(): Promise<ToneFeed> {
    return this.getJson('/api/v1/tones/latest', 'listLatestTones');
  }

  /** Favorite a tone. Idempotent. Only public or owned tones can be favorited. */
  favoriteTone(id: number | string): Promise<Favorite> {
    return this.getJson(`/api/v1/tones/${id}/favorite`, 'favoriteTone', { method: 'PUT' });
  }

  /** Remove a tone from favorites. Idempotent (204 No Content). */
  async unfavoriteTone(id: number | string): Promise<void> {
    const res = await this.fetch(`/api/v1/tones/${id}/favorite`, { method: 'DELETE' });
    if (!res.ok) throw new ApiError('unfavoriteTone failed', res.status);
  }

  /**
   * Get a temporary URL for a zip of all of a tone's models.
   *
   * Approved partners only — other clients receive 403. For nearly all
   * integrations, download individual models via `model_url` instead. The URL
   * expires an hour after issue, so request it when the user clicks.
   */
  getToneDownload(id: number | string, params?: { filenames?: 'name' | 'id' }): Promise<ToneDownload> {
    const qs = new URLSearchParams();
    if (params?.filenames) qs.set('filenames', params.filenames);
    return this.getJson(withQuery(`/api/v1/tones/${id}/download`, qs), 'getToneDownload');
  }

  /**
   * Download a tone's zip archive. The pre-signed URL needs no auth, and a
   * navigation isn't subject to CORS, so a plain anchor click is enough.
   */
  async downloadToneZip(id: number | string): Promise<void> {
    const { url, filename } = await this.getToneDownload(id);
    Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  }

  // ── Models ───────────────────────────────────────────────────────────────────

  /** Get a model by ID. */
  getModel(id: number | string): Promise<Model> {
    return this.getJson(`/api/v1/models/${id}`, 'getModel');
  }

  /**
   * List a tone's models, in tone-page order. Omitting `architecture` returns
   * A1 + Custom only — pass `2` (or `Architecture.A2`) to get A2 models.
   */
  listModels(toneId: number | string, params?: ListModelsParams): Promise<PaginatedResponse<Model>> {
    const qs = pageQuery(params);
    qs.set('tone_id', String(toneId));
    if (params?.architecture != null) qs.set('architecture', String(params.architecture));
    return this.getJson(withQuery('/api/v1/models', qs), 'listModels');
  }

  /**
   * Fetch a model file (requires Bearer auth). `model_url` is absolute, so
   * the API origin is stripped and `fetch()` re-adds it with the auth header.
   */
  async fetchModelFile(modelUrl: string): Promise<Blob> {
    const res = await this.fetch(modelUrl.replace(/^https?:\/\/[^/]+/, ''));
    if (!res.ok) throw new ApiError('Model download failed', res.status);
    return res.blob();
  }

  /** Download a model file and trigger a browser file download. */
  async downloadModel(modelUrl: string, name: string): Promise<void> {
    const blob = await this.fetchModelFile(modelUrl);

    // Use the extension from the storage URL with a human-readable name
    const storageFilename = new URL(modelUrl).pathname.split('/').pop() ?? '';
    const ext = storageFilename.includes('.') ? '.' + storageFilename.split('.').pop() : '';
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: sanitized + ext }).click();
    URL.revokeObjectURL(url);
  }

  // ── Taxonomy ─────────────────────────────────────────────────────────────────

  /** Makes, ordered by public tone count (or name). Max page_size is 25. */
  listMakes(params?: ListTaxonomyParams): Promise<PaginatedResponse<PublicMake>> {
    const qs = pageQuery(params);
    if (params?.query) qs.set('query', params.query);
    if (params?.sort) qs.set('sort', params.sort);
    return this.getJson(withQuery('/api/v1/makes', qs), 'listMakes');
  }

  /** Tags, ordered by public tone count (or name). Max page_size is 25. */
  listTags(params?: ListTaxonomyParams): Promise<PaginatedResponse<PublicTag>> {
    const qs = pageQuery(params);
    if (params?.query) qs.set('query', params.query);
    if (params?.sort) qs.set('sort', params.sort);
    return this.getJson(withQuery('/api/v1/tags', qs), 'listTags');
  }
}
