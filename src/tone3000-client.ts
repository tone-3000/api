// tone3000-client.ts — drop-in helper for tone3000 OAuth integration
// No dependencies — uses built-in WebCrypto and fetch APIs.

const T3K_API =
  (import.meta.env?.VITE_TONE3000_API_DOMAIN as string | undefined) ?? 'https://www.tone3000.com';

export interface T3KTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Date.now() + expires_in * 1000
}

// ─── PKCE helpers (built-in WebCrypto, no dependencies) ───────────────────────

async function generateCodeVerifier(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── OAuth flow ───────────────────────────────────────────────────────────────

/**
 * Step 1: Redirect the user to tone3000 for authentication.
 * Call this when the user clicks "Connect to Tone3000" or "Browse Tones".
 * This is a one-time redirect — after the initial connection, tone requests
 * and token refreshes are direct API calls with no redirect.
 * Stores code_verifier in sessionStorage for retrieval after redirect.
 */
export async function startOAuthFlow(
  publishableKey: string,
  redirectUri: string,
  options?: { toneSelect?: boolean }
) {
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const stateBytes = crypto.getRandomValues(new Uint8Array(16));
  const state = btoa(String.fromCharCode(...stateBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  sessionStorage.setItem('t3k_code_verifier', codeVerifier);
  sessionStorage.setItem('t3k_oauth_state', state);

  const url = new URL(`${T3K_API}/api/v1/oauth/authorize`);
  url.searchParams.set('client_id', publishableKey);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  if (options?.toneSelect) url.searchParams.set('prompt', 'select_tone');

  window.location.href = url.toString();
}

/**
 * Step 2: Exchange the auth code for tokens.
 * Call this in the callback page after the redirect from tone3000.
 */
export async function handleOAuthCallback(
  publishableKey: string,
  redirectUri: string
): Promise<{ tokens: T3KTokens; toneId?: string }> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const toneId = params.get('tone_id') ?? undefined;

  const storedState = sessionStorage.getItem('t3k_oauth_state');
  const codeVerifier = sessionStorage.getItem('t3k_code_verifier');

  if (!code || returnedState !== storedState || !codeVerifier) {
    throw new Error('Invalid OAuth callback: state mismatch or missing code');
  }

  sessionStorage.removeItem('t3k_code_verifier');
  sessionStorage.removeItem('t3k_oauth_state');

  const response = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: publishableKey,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Token exchange failed: ${err.error}`);
  }

  const data = await response.json();
  const tokens: T3KTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return { tokens, toneId };
}

/**
 * Refresh the access token using the stored refresh token.
 */
export async function refreshTokens(
  refreshToken: string,
  publishableKey: string
): Promise<T3KTokens> {
  const response = await fetch(`${T3K_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: publishableKey,
    }),
  });

  if (!response.ok) throw new Error('Token refresh failed');

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

// ─── Authenticated API client ─────────────────────────────────────────────────

const T3K_STORAGE_KEY = 't3k_tokens';

/**
 * Authenticated fetch with automatic token refresh.
 * Tokens are stored in sessionStorage — they survive page refreshes within a
 * tab but are cleared when the tab is closed. A returning user in a new session
 * will go through the OAuth redirect once (auto-grant skips login if the user
 * still has an active Tone3000 session), then won't be redirected again for the
 * rest of the tab session.
 *
 * For cross-session persistence without redirects, store the refresh token
 * server-side and call POST /api/v1/oauth/token on each page load.
 */
export class T3KClient {
  private refreshPromise: Promise<T3KTokens> | null = null;

  constructor(
    private publishableKey: string,
    private onAuthRequired: () => void
  ) {}

  setTokens(tokens: T3KTokens) {
    sessionStorage.setItem(T3K_STORAGE_KEY, JSON.stringify(tokens));
  }

  getTokens(): T3KTokens | null {
    const stored = sessionStorage.getItem(T3K_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as T3KTokens) : null;
  }

  clearTokens() {
    sessionStorage.removeItem(T3K_STORAGE_KEY);
  }

  private async getValidAccessToken(): Promise<string> {
    const tokens = this.getTokens();
    if (!tokens) {
      this.onAuthRequired();
      throw new Error('Not authenticated');
    }

    // Proactively refresh 60 seconds before expiry
    if (Date.now() > tokens.expires_at - 60_000) {
      if (!this.refreshPromise) {
        this.refreshPromise = refreshTokens(tokens.refresh_token, this.publishableKey)
          .then((newTokens) => {
            this.setTokens(newTokens);
            this.refreshPromise = null;
            return newTokens;
          })
          .catch((err) => {
            this.clearTokens();
            this.refreshPromise = null;
            this.onAuthRequired();
            throw err;
          });
      }
      const newTokens = await this.refreshPromise;
      return newTokens.access_token;
    }

    return tokens.access_token;
  }

  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const accessToken = await this.getValidAccessToken();

    const response = await globalThis.fetch(`${T3K_API}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Handle expiry race condition: retry once with a forced refresh
    if (response.status === 401) {
      const tokens = this.getTokens();
      if (tokens) {
        this.setTokens({ ...tokens, expires_at: 0 });
        const retryToken = await this.getValidAccessToken();
        return globalThis.fetch(`${T3K_API}${path}`, {
          ...init,
          headers: { ...init?.headers, Authorization: `Bearer ${retryToken}` },
        });
      }
    }

    return response;
  }

  async getTone(id: number | string) {
    const res = await this.fetch(`/api/v1/tones/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch tone: ${res.status}`);
    return res.json();
  }

  async getModel(id: number | string) {
    const res = await this.fetch(`/api/v1/models/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch model: ${res.status}`);
    return res.json();
  }

  async listModels(toneId: number | string, page = 1, pageSize = 10) {
    const res = await this.fetch(`/api/v1/models?tone_id=${toneId}&page=${page}&page_size=${pageSize}`)
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`)
    return res.json()
  }
}
