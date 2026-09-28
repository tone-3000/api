// types.ts — TONE3000 API v1 type definitions (https://www.tone3000.com/api#types)


// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Gear {
  Amp = 'amp',
  AmpCab = 'amp-cab',
  Pedal = 'pedal',
  Outboard = 'outboard',
  Cab = 'cab',
  Space = 'space',
  Experimental = 'experimental',
  /** @deprecated Alias for `amp-cab`; responses always emit `amp-cab`. */
  FullRig = 'full-rig',
  /** @deprecated Stripped from `gears`; filter with `format: 'ir'` instead. */
  Ir = 'ir',
}

export enum Format {
  Nam = 'nam',
  Ir = 'ir',
  AidaX = 'aida-x',
  AaSnapshot = 'aa-snapshot',
  Proteus = 'proteus',
}

/**
 * NAM model architecture. Omitting the `architecture` query param falls back
 * to A1 + Custom (the legacy default, which excludes A2).
 */
export enum Architecture {
  A1 = '1',
  A2 = '2',
  Custom = 'custom',
}

/** Anything accepted as an `architecture` query param. */
export type ArchitectureParam = Architecture | '1' | '2' | 'custom' | 1 | 2;

export enum License {
  T3k = 't3k',
  CcBy = 'cc-by',
  CcBySa = 'cc-by-sa',
  CcByNc = 'cc-by-nc',
  CcByNcSa = 'cc-by-nc-sa',
  CcByNd = 'cc-by-nd',
  CcByNcNd = 'cc-by-nc-nd',
  Cco = 'cco',
}

export enum Size {
  Standard = 'standard',
  Lite = 'lite',
  Feather = 'feather',
  Nano = 'nano',
  Custom = 'custom',
}

export enum TonesSort {
  BestMatch = 'best-match',
  Newest = 'newest',
  Oldest = 'oldest',
  Trending = 'trending',
  DownloadsAllTime = 'downloads-all-time',
}

export enum UsersSort {
  Tones = 'tones',
  Downloads = 'downloads',
  Favorites = 'favorites',
  Models = 'models',
}

export enum TaxonomySort {
  Tones = 'tones',
  Name = 'name',
}

// ─── Resources ────────────────────────────────────────────────────────────────

/** Response body of POST /api/v1/oauth/token. */
export interface Session {
  access_token: string;
  refresh_token: string;
  /** Seconds until the access token expires. */
  expires_in: number;
  token_type: 'bearer';
  scope?: string;
}

/**
 * Creator info embedded in tones. `display_name` is only ever set for a
 * verified creator, so fall back to `username` when it is `null`.
 */
export interface EmbeddedUser {
  id: number;
  username: string;
  display_name: string | null;
  is_verified: boolean;
  avatar_url: string | null;
  url: string;
}

export interface User extends EmbeddedUser {
  bio: string | null;
  links: string[] | null;
  created_at: string;
  updated_at: string;
}

/** Public user with content counts, returned by GET /api/v1/users. */
export interface PublicUser {
  id: number;
  username: string;
  display_name: string | null;
  is_verified: boolean;
  bio: string | null;
  links: string[] | null;
  avatar_url: string | null;
  downloads_count: number;
  favorites_count: number;
  models_count: number;
  tones_count: number;
  url: string;
}

export interface Make {
  id: number;
  name: string;
}

export interface Tag {
  id: number;
  name: string;
}

/** A make with its public tone count, returned by GET /api/v1/makes. */
export interface PublicMake extends Make {
  tones_count: number;
  url: string;
}

/** A tag with its public tone count, returned by GET /api/v1/tags. */
export interface PublicTag extends Tag {
  tones_count: number;
  url: string;
}

/** Returned by PUT /api/v1/tones/{id}/favorite. */
export interface Favorite {
  id: number;
  tone_id: number;
  user_id: string;
  created_at: string;
}

export interface Tone {
  id: number;
  user_id: number;
  user: EmbeddedUser;
  created_at: string;
  updated_at: string;
  /** When the tone was first made public; null if never published. */
  published_at: string | null;
  title: string;
  description: string | null;
  gear: Gear;
  images: string[] | null;
  is_public: boolean | null;
  links: string[] | null;
  format: Format;
  license: License;
  sizes: Size[];
  makes: Make[];
  tags: Tag[];
  /** Filtered by the `architecture` param on GET /tones/{id} (NAM only). */
  models_count: number;
  a1_models_count: number;
  a2_models_count: number;
  irs_count: number;
  custom_models_count: number;
  downloads_count: number;
  favorites_count: number;
  /** Whether the authenticated user has favorited this tone. */
  is_favorite: boolean;
  url: string;
}

export interface Model {
  id: number;
  created_at: string;
  updated_at: string;
  user_id: number;
  /** Pre-built download URL. Fetch it with your Bearer token. */
  model_url: string;
  name: string;
  size: Size;
  tone_id: number;
  /** Architecture for NAM models; null for non-NAM (e.g. IR). */
  architecture_version: Architecture | null;
}

/** Returned by GET /api/v1/tones/{id}/download (approved partners only). */
export interface ToneDownload {
  /** Temporary, unauthenticated URL to a zip of every model. Expires in 1 hour. */
  url: string;
  expires_at: string;
  /** Suggested filename, e.g. `My Tone.zip`. */
  filename: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** Trending and latest feeds are capped at 10 and not paginated. */
export interface ToneFeed {
  data: Tone[];
}

// ─── Request params ───────────────────────────────────────────────────────────

export interface PageParams {
  page?: number;
  pageSize?: number;
}

export interface SearchTonesParams extends PageParams {
  query?: string;
  sort?: TonesSort;
  gears?: Gear[];
  /** Model format. Filtering IRs goes here, not through `gears`. */
  format?: Format;
  sizes?: Size[];
  architecture?: ArchitectureParam;
  /** Tag names, matched exactly against a tone's `tags`. Multiple values are OR'd. */
  tags?: string[];
  /** Make/model names, matched exactly against a tone's `makes`. OR'd. */
  makes?: string[];
  /** Creator usernames, matched exactly against a tone's `user.username`. OR'd. */
  creators?: string[];
  /** Only tones with at least one calibrated model. */
  calibrated?: boolean;
  /** Only tones from verified creators. */
  verified?: boolean;
}

/** Params for the bounded library lists: created, favorited, downloaded. */
export interface ListLibraryParams extends PageParams {
  /** A single gear type, e.g. `amp-cab`. */
  gear?: Gear;
  /** Case-insensitive substring match on the tone title. */
  query?: string;
}

export interface ListModelsParams extends PageParams {
  architecture?: ArchitectureParam;
}

export interface ListUsersParams extends PageParams {
  sort?: UsersSort;
  query?: string;
}

export interface ListTaxonomyParams extends PageParams {
  query?: string;
  sort?: TaxonomySort;
}
