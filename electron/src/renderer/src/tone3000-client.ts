/**
 * tone3000-client.ts — TONE3000 OAuth + API client (desktop renderer)
 *
 * Same API surface as the web example's client. The difference is where the
 * OAuth flow runs: on desktop, main hosts TONE3000 in an embedded view and
 * handles PKCE + the code exchange (src/main/oauth.ts). This module builds the
 * authorize params for each flow and makes authenticated API calls.
 *
 * Tokens live in memory for synchronous access and are persisted through the
 * preload bridge, which stores them with Electron safeStorage.
 */

import { T3K_API } from './config';
import type { T3KTokens } from '../../shared/ipc';
import type {
  User, Tone, Model, PublicUser, PublicMake, PublicTag, Favorite, ToneDownload,
  PaginatedResponse, ToneFeed, SearchTonesParams, ListModelsParams, ListLibraryParams,
  ListUsersParams, ListTaxonomyParams, ArchitectureParam, Gear, Format,
} from './types';

export type { T3KTokens };

// ─── Flow options ─────────────────────────────────────────────────────────────

/**
 * Optional authorize-URL params shared by every flow.
 * See https://www.tone3000.com/api#authentication for the full table.
 */
export interface AuthorizeOptions {
  /** Pre-fill the sign-in email. Malformed values are ignored. */
  loginHint?: string;
  /** UI language. `zh-CN` for Simplified Chinese; anything else falls back to English. */
  locale?: string;
  /** Show back / forward / refresh / close controls. Recommended for embedded views. */
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

// ─── Errors ───────────────────────────────────────────────────────────────────

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

// ─── Query building ───────────────────────────────────────────────────────────

/**
 * Serialize SearchTonesParams into the query string /api/v1/tones/search
 * expects. Exported so a UI can preview the exact request it's about to make.
 *
 * gears, sizes, tags and makes are underscore-separated. creators is
 * comma-separated: usernames may contain an underscore.
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
export async function refreshTokens(refreshToken: string, publishableKey: string): Promise<T3KTokens> {
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
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

// ─── Authenticated API client ─────────────────────────────────────────────────

/**
 * T3KClient — authenticated API client with automatic token refresh.
 *
 * Call `hydrate()` once at startup to load persisted tokens.
 *
 * @param onAuthRequired - Called when tokens are missing or the refresh token
 *                         has expired. Typically shows a "Connect" prompt; the
 *                         embedded view keeps the TONE3000 session, so
 *                         reconnecting usually skips sign-in.
 */
export class T3KClient {
  private tokens: T3KTokens | null = null;
  private refreshPromise: Promise<T3KTokens> | null = null;

  constructor(
    private readonly publishableKey: string,
    private readonly onAuthRequired: () => void,
  ) {}

  async hydrate(): Promise<void> {
    this.tokens = await window.t3k.tokens.get();
  }

  setTokens(tokens: T3KTokens): void {
    this.tokens = tokens;
    void window.t3k.tokens.set(tokens);
  }

  getTokens(): T3KTokens | null {
    return this.tokens;
  }

  clearTokens(): void {
    this.tokens = null;
    void window.t3k.tokens.clear();
  }

  isConnected(): boolean {
    return this.tokens !== null;
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

  /** Download a tone's zip archive through Electron's download manager. */
  async downloadToneZip(id: number | string): Promise<void> {
    const { url } = await this.getToneDownload(id);
    await window.t3k.download(url);
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

  /** Download a model file; Electron shows a save dialog for the blob. */
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
