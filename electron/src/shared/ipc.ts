/** Types shared by main, preload and renderer. */

export interface T3KTokens {
  access_token: string
  refresh_token: string
  /** Unix timestamp (ms) when the access token expires. */
  expires_at: number
}

/** What the renderer sends main to start an OAuth flow in the embedded view. */
export interface BeginAuthRequest {
  apiBase: string
  publishableKey: string
  redirectUri: string
  /**
   * Authorize params beyond the PKCE/client ones main adds itself:
   * `prompt`, `tone_id`, `gears`, `format`, `architecture`, `menubar`, …
   */
  params: Record<string, string>
}

/** Where to place the embedded view, in CSS pixels relative to the window content. */
export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Outcome of an embedded flow.
 * - `connected`: tokens were issued. `toneId` is set for select/load flows;
 *   `canceled` means the user signed in but closed the flow before picking.
 * - `canceled`: the user closed the flow before signing in.
 */
export type AuthResult =
  | { status: 'connected'; tokens: T3KTokens; toneId?: string; canceled?: boolean }
  | { status: 'canceled' }
  | { status: 'error'; error: string }

/** `window.t3k`, exposed to the app renderer by the preload script. */
export interface T3KBridge {
  auth: {
    begin(req: BeginAuthRequest, bounds: ViewBounds): Promise<void>
    setBounds(bounds: ViewBounds): void
    cancel(): Promise<void>
    /** Subscribe to flow results. Returns an unsubscribe function. */
    onResult(callback: (result: AuthResult) => void): () => void
  }
  /** Persisted in main with Electron safeStorage. */
  tokens: {
    get(): Promise<T3KTokens | null>
    set(tokens: T3KTokens): Promise<void>
    clear(): Promise<void>
  }
  /** Save a URL through Electron's download manager (https only). */
  download(url: string): Promise<void>
}

export const IPC = {
  beginAuth: 'auth:begin',
  setAuthBounds: 'auth:bounds',
  cancelAuth: 'auth:cancel',
  authResult: 'auth:result',
  tokensGet: 'tokens:get',
  tokensSet: 'tokens:set',
  tokensClear: 'tokens:clear',
  download: 'download:url',
} as const
