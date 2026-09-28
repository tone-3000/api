/**
 * tone3000-client.ts — TONE3000 OAuth + API client (React Native)
 *
 * Same API surface as the web example's client, adapted for mobile:
 * - OAuth runs in an in-app WebView (see auth.tsx); this module builds the
 *   authorize URL, generates PKCE with expo-crypto and exchanges the code.
 * - Tokens are cached in memory and persisted with expo-secure-store
 *   (Keychain on iOS, Keystore-backed storage on Android).
 * - Model files are downloaded to the cache directory with expo-file-system.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';

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

/**
 * Optional authorize-URL params shared by every flow.
 * See https://www.tone3000.com/api#authentication for the full table.
 */
export interface AuthorizeOptions {
  /** Pre-fill the sign-in email. Malformed values are ignored. */
  loginHint?: string;
  /** UI language. `zh-CN` for Simplified Chinese; anything else falls back to English. */
  locale?: string;
  /** Show back / forward / refresh / close controls. Recommended in a WebView. */
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

  get isRateLimit(): boolean {
    return this.status === 429;
  }

  /** 403: e.g. a partner-only endpoint. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

// ─── Authorize params ─────────────────────────────────────────────────────────

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

/** **Select Flow** — browse the TONE3000 catalog and pick a tone. */
export function selectToneParams(options?: SelectOptions): Record<string, string> {
  return { prompt: 'select_tone', ...authorizeParams(options) };
}

/**
 * **Load Tone Flow** — authenticate and verify access to a known tone. If it's
 * private or deleted the user can pick a replacement, so the returned
 * `tone_id` may differ from the requested one.
 */
export function loadToneParams(toneId: number | string, options?: LoadToneOptions): Record<string, string> {
  return { prompt: 'load_tone', tone_id: String(toneId), ...authorizeParams(options) };
}

/** **Standard Flow** — connect the user's account for Full API access. */
export function standardParams(options?: AuthorizeOptions): Record<string, string> {
  return authorizeParams(options);
}

// ─── PKCE ─────────────────────────────────────────────────────────────────────

function base64url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function randomBase64url(byteCount: number): string {
  const bytes = Crypto.getRandomBytes(byteCount);
  return base64url(btoa(String.fromCharCode(...bytes)));
}

export interface PendingAuthorization {
  url: string;
  state: string;
  codeVerifier: string;
}

/** Build an authorize URL with fresh PKCE + state. Keep the result until the callback. */
export async function buildAuthorization(
  publishableKey: string,
  redirectUri: string,
  params: Record<string, string>,
): Promise<PendingAuthorization> {
  const codeVerifier = randomBase64url(32);
  const state = randomBase64url(16);
  const codeChallenge = base64url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );

  const qs = new Query();
  qs.set('client_id', publishableKey);
  qs.set('redirect_uri', redirectUri);
  qs.set('response_type', 'code');
  qs.set('code_challenge', codeChallenge);
  qs.set('code_challenge_method', 'S256');
  qs.set('state', state);
  for (const [k, v] of Object.entries(params)) qs.set(k, v);
  return { url: withQuery(`${T3K_API}/api/v1/oauth/authorize`, qs), state, codeVerifier };
}

async function tokensFromResponse(res: Response): Promise<T3KTokens> {
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(
  publishableKey: string,
  redirectUri: string,
  code: string,
  codeVerifier: string,
): Promise<T3KTokens> {
  const res = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: publishableKey,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'token_exchange_failed');
  }
  return tokensFromResponse(res);
}

/**
 * Exchange a refresh token for a new access token. Throws `ApiError` with
 * status 400 when the refresh token itself has expired (`invalid_grant`).
 */
export async function refreshTokens(refreshToken: string, publishableKey: string): Promise<T3KTokens> {
  const res = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: publishableKey,
    }),
  });
  if (!res.ok) throw new ApiError('Token refresh failed', res.status);
  return tokensFromResponse(res);
}

// ─── Query building ───────────────────────────────────────────────────────────

/**
 * Minimal query-string builder. React Native's URL / URLSearchParams
 * polyfills are incomplete, so the client doesn't depend on them.
 */
export class Query {
  private readonly entries = new Map<string, string>();

  set(key: string, value: string): void {
    this.entries.set(key, value);
  }

  toString(): string {
    return [...this.entries]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }
}

function formBody(fields: Record<string, string>): string {
  const q = new Query();
  for (const [k, v] of Object.entries(fields)) q.set(k, v);
  return q.toString();
}

/**
 * Serialize SearchTonesParams into the query string /api/v1/tones/search
 * expects. gears, sizes, tags and makes are underscore-separated. creators is
 * comma-separated: usernames may contain an underscore.
 */
export function buildSearchTonesQuery(params?: SearchTonesParams): Query {
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

function pageQuery(params?: { page?: number; pageSize?: number }): Query {
  const qs = new Query();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('page_size', String(params.pageSize));
  return qs;
}

function withQuery(path: string, qs: Query): string {
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

// ─── Authenticated API client ─────────────────────────────────────────────────

const STORAGE_KEY = 't3k_tokens';

/**
 * T3KClient — authenticated API client with automatic token refresh.
 *
 * Call `hydrate()` once at startup to load persisted tokens.
 *
 * @param onAuthRequired - Called when tokens are missing or the refresh token
 *                         has expired. Typically shows a "Connect" prompt; the
 *                         WebView keeps the TONE3000 session, so reconnecting
 *                         usually skips sign-in.
 */
export class T3KClient {
  private tokens: T3KTokens | null = null;
  private refreshPromise: Promise<T3KTokens> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly publishableKey: string,
    private readonly onAuthRequired: () => void,
  ) {}

  async hydrate(): Promise<void> {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY).catch(() => null);
    this.tokens = raw ? (JSON.parse(raw) as T3KTokens) : null;
    this.emit();
  }

  setTokens(tokens: T3KTokens): void {
    this.tokens = tokens;
    void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(tokens));
    this.emit();
  }

  getTokens(): T3KTokens | null {
    return this.tokens;
  }

  clearTokens(): void {
    this.tokens = null;
    void SecureStore.deleteItemAsync(STORAGE_KEY);
    this.emit();
  }

  isConnected(): boolean {
    return this.tokens !== null;
  }

  /** Subscribe to connect/disconnect changes (for useSyncExternalStore). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private async getAccessToken(): Promise<string> {
    const tokens = this.tokens;
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
    if (res.status === 401 && this.tokens) {
      this.tokens = { ...this.tokens, expires_at: 0 }; // force a refresh
      const retryToken = await this.getAccessToken();
      res = await globalThis.fetch(`${T3K_API}${path}`, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${retryToken}` },
      });
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
    const qs = new Query();
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
    const qs = new Query();
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
   * expires an hour after issue, so request it when the user taps.
   */
  getToneDownload(id: number | string, params?: { filenames?: 'name' | 'id' }): Promise<ToneDownload> {
    const qs = new Query();
    if (params?.filenames) qs.set('filenames', params.filenames);
    return this.getJson(withQuery(`/api/v1/tones/${id}/download`, qs), 'getToneDownload');
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
   * Download a model file (requires Bearer auth) into the cache, named after
   * the model with the storage URL's extension. Cached per URL, so previewing
   * and sharing the same model only downloads it once.
   */
  async downloadModelFile(modelUrl: string, name: string): Promise<File> {
    const storageFilename = modelUrl.split(/[?#]/)[0].split('/').pop() ?? '';
    const ext = storageFilename.includes('.') ? '.' + storageFilename.split('.').pop() : '';
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';

    const key = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, modelUrl);
    const dir = new Directory(Paths.cache, 't3k-models', key.slice(0, 16));
    const file = new File(dir, sanitized + ext);
    if (file.exists) return file;

    dir.create({ intermediates: true, idempotent: true });
    const token = await this.getAccessToken();
    try {
      return await File.downloadFileAsync(modelUrl, file, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      if (file.exists) file.delete();
      throw err;
    }
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
