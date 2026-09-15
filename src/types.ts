// types.ts — TONE3000 API type definitions

export type Demo = 'select' | 'load-tone' | 'load-model' | 'full-api' | 'lan-flow' | 'upload';

export enum Gear {
  Amp = 'amp',
  AmpCab = 'amp-cab',
  /** @deprecated Responses emit `amp-cab` instead; still accepted on input. */
  FullRig = 'full-rig',
  Pedal = 'pedal',
  Outboard = 'outboard',
  Cab = 'cab',
  Space = 'space',
  Experimental = 'experimental',
  /** @deprecated Being retired as a gear; filter with `format: 'ir'` instead. */
  Ir = 'ir',
}

export enum Format {
  Nam = 'nam',
  Ir = 'ir',
  AidaX = 'aida-x',
  AaSnapshot = 'aa-snapshot',
  Proteus = 'proteus',
}

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

export interface EmbeddedUser {
  id: string;
  username: string;
  avatar_url: string | null;
  url: string;
}

export interface User extends EmbeddedUser {
  bio: string | null;
  links: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  username: string;
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
  id?: number; // absent when returned via RPC (search results)
  name: string;
}

export interface Tag {
  id?: number; // absent when returned via RPC (search results)
  name: string;
}

export interface Tone {
  id: number;
  user_id: string;
  user: EmbeddedUser;
  created_at?: string; // absent from GET /tones/{id} — present on search/created/favorited
  updated_at?: string; // absent from GET /tones/{id} — present on search/created/favorited
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
  models_count: number;
  downloads_count: number;
  favorites_count: number;
  url: string;
}

/** Neural model architecture version. 'custom' covers user-supplied architectures. */
export type ArchitectureVersion = '1' | '2' | 'custom';

export interface Model {
  id: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  model_url: string;
  name: string;
  size: Size;
  architecture_version: ArchitectureVersion;
  tone_id: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface SearchTonesParams {
  query?: string;
  page?: number;
  pageSize?: number;
  sort?: TonesSort;
  gears?: Gear[];
  /** Model format. Filtering IRs goes here, not through `gears`. */
  format?: Format;
  sizes?: Size[];
  architecture?: number;
  /** Tag names, matched exactly against a tone's `tags`. Multiple values are OR'd. */
  tags?: string[];
  /** Make/model names, matched exactly against a tone's `makes`. OR'd. */
  makes?: string[];
  /** Creator usernames, matched exactly against a tone's `user.username`. OR'd. */
  creators?: string[];
}

export interface ListModelsParams {
  page?: number;
  pageSize?: number;
  architecture?: number;
}

export interface ListCreatedTonesParams {
  page?: number;
  pageSize?: number;
}

export interface ListFavoritedTonesParams {
  page?: number;
  pageSize?: number;
}

export interface ListUsersParams {
  sort?: UsersSort;
  page?: number;
  pageSize?: number;
  query?: string;
}

// ─── Uploads ──────────────────────────────────────────────────────────────────

/**
 * Which staging lane a presigned upload uses. Picks the destination bucket, the
 * allowed extensions and the size cap.
 */
export enum UploadKind {
  /** Model file — .nam, .wav (IR), .aidax, .aasnapshot, .json. Consumed by POST /models. */
  Model = 'model',
  /** Training audio — .wav only. Consumed by POST /trainings. */
  Audio = 'audio',
  /** Tone image — .jpg, .jpeg, .png, .webp. Consumed by tone create/edit. */
  Image = 'image',
}

/** One entry of POST /api/v1/uploads. */
export interface CreateUploadRequest {
  kind: UploadKind;
  /** 1–255 chars, no control characters. Only its extension is authoritative. */
  filename: string;
  /** Exact byte length. Signed into the URL, so the PUT body must match it exactly. */
  size_bytes: number;
}

/** Batch form of the mint request. Up to 25 entries, kinds may be mixed, all-or-nothing. */
export interface CreateUploadBatchRequest {
  uploads: CreateUploadRequest[];
}

/**
 * One minted upload. It carries two independent clocks that are never
 * interchangeable:
 *
 * - `url_expires_at` — storage's clock, mint + 1 hour. Deadline for the PUT.
 * - `expires_at` — the API's clock, mint + 24 hours. Deadline for spending `upload_id`.
 *
 * A dead URL still leaves a live handle, but nothing can re-arm it: mint again.
 */
export interface UploadTicket {
  /** `up_<uuid>`. Single use — consuming it once spends it. */
  upload_id: string;
  /** Presigned storage URL. PUT the bytes here directly, with no auth header. */
  url: string;
  method: 'PUT';
  /** `Content-Length` only. A browser sets it itself from the Blob and ignores this. */
  headers: Record<string, string>;
  /** ISO 8601. When the presigned URL stops accepting the PUT (mint + 1 hour). */
  url_expires_at: string;
  /** ISO 8601. When `upload_id` stops being consumable (mint + 24 hours). */
  expires_at: string;
}

/** Batch form of the mint response — mirrors the request shape. */
export interface CreateUploadBatchResponse {
  uploads: UploadTicket[];
}

/** POST /api/v1/models, upload branch. Send `upload_id`, never a `url` as well. */
export interface CreateModelFromUploadParams {
  toneId: number | string;
  /** `upload_id` from a `UploadKind.Model` ticket. */
  uploadId: string;
  /** Defaults to the uploaded filename minus its extension. Truncated to 64 chars. */
  name?: string;
}

/** POST /api/v1/tones. Pass at most one of `imageUrl` / `imageUploadId`. */
export interface CreateToneParams {
  title: string;
  gear: Gear;
  format: Format;
  description?: string;
  isPublic?: boolean;
  license?: License;
  links?: string[];
  makes?: string[];
  tags?: string[];
  /** https URL of an already-hosted image. */
  imageUrl?: string;
  /** `upload_id` from a `UploadKind.Image` ticket. */
  imageUploadId?: string;
}

/** Stage of the mint → PUT → consume flow a progress event belongs to. */
export type UploadPhase = 'minting' | 'uploading' | 'consuming' | 'done';

export interface UploadProgress {
  phase: UploadPhase;
  /** Bytes of the file pushed to storage so far. Only moves during 'uploading'. */
  loadedBytes: number;
  totalBytes: number;
  /** 0–1 over the PUT. 0 while minting, 1 once the bytes are up. */
  fraction: number;
}

/** What a one-shot upload should be attached to once the bytes are in staging. */
export type UploadTarget =
  | { resource: 'model'; toneId: number | string; name?: string }
  | { resource: 'tone-image'; toneId: number | string };

// ── Trainings ─────────────────────────────────────────────────────────────────

/**
 * The only training type the API accepts. A dry/wet pair is a web-only flow;
 * POST /api/v1/trainings rejects anything else with a 400.
 */
export const TRAIN_TYPE_SWEEP_V3 = 'sweep-v3';

/** Where a training is in its life. `running` covers queued and in progress. */
export type TrainingStatus = 'running' | 'succeeded' | 'failed';

export interface Training {
  id: number;
  tone_id: number | null;
  type: string;
  status: TrainingStatus;
  /** Human-readable stage, e.g. what the trainer is doing right now. */
  status_text: string | null;
  error: string | null;
  epochs: number | null;
  max_epochs: number | null;
  /** Seconds, once it has finished. */
  duration: number | null;
  created_at: string;
  updated_at: string;
  logs: string | null;
  model: { id: number; name: string; model_url: string | null } | null;
}

/** One recording to train from. The name becomes the model's name. */
export interface TrainingOutput {
  /** `upload_id` from a `UploadKind.Audio` ticket. */
  uploadId: string;
  name: string;
}

export interface StartTrainingsParams {
  toneId: number | string;
  outputs: TrainingOutput[];
  /** 200 by default, 400 for a longer run. Nothing else is accepted. */
  maxEpochs?: number;
}

export interface StartTrainingsResponse {
  tone_id: number;
  trainings: {
    id: number;
    model_id: number;
    model_name: string;
    status: TrainingStatus;
    created_at: string;
  }[];
}
