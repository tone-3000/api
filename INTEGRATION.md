# Tone3000 OAuth API — Integration Guide

This guide covers how to integrate with the Tone3000 API. There are two integration patterns:

- **OAuth PKCE** — for client-side and browser-based apps. The user connects their Tone3000 account via a one-time OAuth redirect. All subsequent requests are direct API calls with no further redirects.
- **Secret key** — for server-side integrations. No browser, no redirects. Send a `Bearer t3k_cs_` token with every request.

---

## Getting Started

### Get your API keys

1. Go to [tone3000.com/api](https://www.tone3000.com/api) and open your settings.
2. Copy your **publishable key** (`t3k_pub_...`) — this goes in your frontend code. It is safe to ship in client-side bundles.
3. Copy your **secret key** (`t3k_cs_...`) — this is for server-side use only. Never include it in client code or commit it to source control.

### Environment variables

```bash
# .env (based on env.example)
VITE_PUBLISHABLE_KEY=t3k_pub_your_key_here
VITE_OAUTH_REDIRECT_URI=http://localhost:3001
```

---

## Client-Side Integration (OAuth PKCE)

The `tone3000-client.ts` helper (included in this repo) handles all PKCE mechanics and token management. It has no dependencies — it uses the built-in `WebCrypto` and `fetch` APIs.

### How it works

1. **Connect** — call `startOAuthFlow()` to redirect the user to Tone3000. This is a one-time step.
2. **Callback** — Tone3000 redirects back to your `redirect_uri` with an auth code. Call `handleOAuthCallback()` to exchange it for tokens.
3. **Make requests** — use a `T3KClient` instance to make authenticated API calls. It handles token storage and refresh automatically.

After the initial connection, all API calls are direct — no more redirects unless the refresh token expires.

### Flow 1: Standard OAuth

Use this when your app controls tone discovery (e.g. you fetch tones by ID from your own catalogue or database). The user connects once; your app fetches tones programmatically.

```tsx
import { useState, useEffect } from 'react';
import { startOAuthFlow, handleOAuthCallback, T3KClient } from './tone3000-client';

const PUBLISHABLE_KEY = import.meta.env.VITE_PUBLISHABLE_KEY;
const REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI;

// Instantiate once — tokens persist in sessionStorage across page refreshes
// within the tab. onAuthRequired is called if the refresh token expires.
const t3kClient = new T3KClient(PUBLISHABLE_KEY, () => {
  startOAuthFlow(PUBLISHABLE_KEY, REDIRECT_URI);
});

export function MyApp() {
  const [tone, setTone] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const isConnected = !!t3kClient.getTokens();

  // Handle the OAuth callback after redirect from Tone3000
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('code')) return;

    // Guard against React StrictMode double-invocation: the first call consumes
    // the PKCE verifier from sessionStorage. If it's already gone, this is the
    // second (duplicate) invocation — skip it.
    if (!sessionStorage.getItem('t3k_code_verifier')) return;

    handleOAuthCallback(PUBLISHABLE_KEY, REDIRECT_URI)
      .then(({ tokens }) => {
        t3kClient.setTokens(tokens);
        setError(null);
        window.history.replaceState({}, '', '/');
      })
      .catch((err) => {
        console.error('OAuth callback failed:', err);
        setError('Connection failed. Please try again.');
        window.history.replaceState({}, '', '/');
      });
  }, []);

  async function loadTone(toneId: number) {
    try {
      const tone = await t3kClient.getTone(toneId);
      setTone(tone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tone');
    }
  }

  async function loadModels(toneId: number) {
    try {
      const { data } = await t3kClient.listModels(toneId);
      // data is Model[]
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    }
  }

  if (!isConnected) {
    return (
      <button onClick={() => startOAuthFlow(PUBLISHABLE_KEY, REDIRECT_URI)}>
        Connect Tone3000 Account
      </button>
    );
  }

  return (
    <div>
      {error && <p>{error}</p>}
      <button onClick={() => loadTone(42)}>Load Tone</button>
      {tone && <pre>{JSON.stringify(tone, null, 2)}</pre>}
    </div>
  );
}
```

### Flow 2: Select Flow

Use this when you want Tone3000 to handle tone discovery. The user browses the Tone3000 catalogue and picks a tone. The selected `tone_id` comes back in the callback alongside the auth code, so you can fetch the tone immediately after token exchange.

The only difference from Flow 1 is `{ toneSelect: true }` passed to `startOAuthFlow`. This adds `prompt=select_tone` to the authorize URL, which tells Tone3000 to show the tone browsing UI before redirecting back.

```tsx
import { useState, useEffect } from 'react';
import { startOAuthFlow, handleOAuthCallback, T3KClient } from './tone3000-client';

const PUBLISHABLE_KEY = import.meta.env.VITE_PUBLISHABLE_KEY;
const REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI;

const t3kClient = new T3KClient(PUBLISHABLE_KEY, () => {
  startOAuthFlow(PUBLISHABLE_KEY, REDIRECT_URI, { toneSelect: true });
});

export function SelectFlow() {
  const [tone, setTone] = useState(null);
  const [error, setError] = useState<string | null>(null);

  // Handle callback — tone_id is included alongside the auth code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('code')) return;

    // Guard against React StrictMode double-invocation (see Flow 1 for explanation).
    if (!sessionStorage.getItem('t3k_code_verifier')) return;

    handleOAuthCallback(PUBLISHABLE_KEY, REDIRECT_URI)
      .then(async ({ tokens, toneId }) => {
        t3kClient.setTokens(tokens);
        setError(null);
        window.history.replaceState({}, '', '/');

        // toneId is present when the user selected a tone on Tone3000
        if (toneId) {
          const data = await t3kClient.getTone(toneId);
          setTone(data);
        }
      })
      .catch((err) => {
        console.error('OAuth callback failed:', err);
        setError('Connection failed. Please try again.');
        window.history.replaceState({}, '', '/');
      });
  }, []);

  return (
    <div>
      {error && (
        <div>
          <p>{error}</p>
          <button onClick={() => {
            setError(null);
            startOAuthFlow(PUBLISHABLE_KEY, REDIRECT_URI, { toneSelect: true });
          }}>
            Try Again
          </button>
        </div>
      )}
      <button onClick={() => startOAuthFlow(PUBLISHABLE_KEY, REDIRECT_URI, { toneSelect: true })}>
        Browse Tones on Tone3000
      </button>
      {tone && <pre>{JSON.stringify(tone, null, 2)}</pre>}
    </div>
  );
}
```

### Token storage and refresh

`T3KClient` stores tokens in `sessionStorage` under the key `t3k_tokens`. Tokens survive page refreshes within a tab but are cleared when the tab is closed.

**Proactive refresh:** `T3KClient` refreshes the access token 60 seconds before it expires. If multiple requests are in-flight at the same time, only one refresh call is made — subsequent calls wait for the same promise.

**Expiry race condition:** If a `401` is returned despite proactive refresh (e.g. the token was revoked server-side), the client forces an immediate refresh and retries the original request once.

**Refresh token expiry:** If the refresh token itself is expired or revoked, `T3KClient` clears all stored tokens and calls the `onAuthRequired` callback you provide. Restart the OAuth flow from there. Because Tone3000 uses auto-grant, users with an active Tone3000 session will be redirected back almost instantly without seeing a login screen.

**Cross-session persistence:** By default, tokens are cleared when the tab closes. If you need tokens to survive across sessions without requiring a new OAuth redirect, store the refresh token server-side and call `POST /api/v1/oauth/token` with `grant_type=refresh_token` on each page load to obtain a fresh access token.

### Downloading models

Model download URLs are proxied through the Tone3000 API and require Bearer auth. Use `t3kClient.fetch()` (not plain `fetch`) to download them:

```tsx
async function downloadModel(modelUrl: string) {
  // Strip the base URL — t3kClient.fetch prepends https://www.tone3000.com
  const path = modelUrl.replace('https://www.tone3000.com', '');
  const response = await t3kClient.fetch(path);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = modelUrl.split('/').pop()!;
  a.click();
  window.URL.revokeObjectURL(url);
}
```

---

## Server-Side Integration (Secret Key)

For backends that fetch tones or models without any user interaction. No redirects, no browser involvement.

Use your secret key (`t3k_cs_...`) as a Bearer token:

```typescript
// server.ts
const SECRET_KEY = process.env.T3K_SECRET_KEY; // never in client code

async function fetchTone(toneId: number) {
  const response = await fetch(`https://www.tone3000.com/api/v1/tones/${toneId}`, {
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Tone fetch failed: ${response.status}`);
  return response.json();
}

async function fetchModel(modelId: number) {
  const response = await fetch(`https://www.tone3000.com/api/v1/models/${modelId}`, {
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Model fetch failed: ${response.status}`);
  return response.json();
}

async function listModels(toneId: number, page = 1, pageSize = 10) {
  const url = new URL('https://www.tone3000.com/api/v1/models');
  url.searchParams.set('tone_id', String(toneId));
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(pageSize));
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Models fetch failed: ${response.status}`);
  return response.json(); // { data: Model[], page, page_size, total, total_pages }
}
```

The secret key works with these endpoints:

| Endpoint | Description |
|---|---|
| `GET /api/v1/tones/{id}` | Fetch a tone by ID |
| `GET /api/v1/models/{id}` | Fetch a model by ID |
| `GET /api/v1/models?tone_id={id}` | List models for a tone (paginated) |
| Model download URL | Download the model file |

---

## API Reference

All endpoints are on `https://www.tone3000.com`.

### OAuth endpoints

#### `GET /api/v1/oauth/authorize`

Redirect the user here to begin the OAuth flow. Parameters:

| Parameter | Value |
|---|---|
| `client_id` | Your publishable key (`t3k_pub_...`) |
| `redirect_uri` | Your registered callback URL |
| `response_type` | `code` |
| `code_challenge` | PKCE S256 code challenge |
| `code_challenge_method` | `S256` |
| `state` | Random value for CSRF protection |
| `prompt` _(optional)_ | `select_tone` to show the tone browsing UI |

#### `POST /api/v1/oauth/token`

Exchange an auth code for tokens, or refresh an existing access token.

**Authorization code exchange:**

```json
{
  "grant_type": "authorization_code",
  "code": "<auth_code>",
  "code_verifier": "<pkce_verifier>",
  "redirect_uri": "<your_redirect_uri>",
  "client_id": "<publishable_key>"
}
```

**Token refresh:**

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "<refresh_token>",
  "client_id": "<publishable_key>"
}
```

**Response (both):**

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "bearer"
}
```

### Resource endpoints

#### `GET /api/v1/tones/{id}`

Returns a tone object. Requires Bearer auth (OAuth access token or secret key).

#### `GET /api/v1/models/{id}`

Returns a model object including `model_url` for download. Requires Bearer auth.

#### `GET /api/v1/models`

Returns a paginated list of models for a tone. Requires Bearer auth.

| Parameter | Required | Description |
|---|---|---|
| `tone_id` | Yes | ID of the tone whose models to list |
| `page` | No | Page number (default: `1`) |
| `page_size` | No | Results per page (default: `10`) |

**Response:**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Standard",
      "size": "standard",
      "tone_id": 42,
      "model_url": "https://www.tone3000.com/api/v1/models/1/download",
      "created_at": "...",
      "updated_at": "...",
      "user_id": "..."
    }
  ],
  "page": 1,
  "page_size": 10,
  "total": 3,
  "total_pages": 1
}
```

Each model object includes a `model_url` pointing to the authenticated download endpoint. Use `t3kClient.fetch()` (not plain `fetch`) to download it — see [Downloading models](#downloading-models).

---

## Error Handling

### OAuth callback errors

Check for an `error` query parameter in the callback URL before calling `handleOAuthCallback`. The authorize endpoint may redirect back with `?error=<code>&error_description=<text>` instead of `?code=<code>`.

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');

  if (error) {
    window.history.replaceState({}, '', '/');
    if (error === 'access_denied') {
      setError('You cancelled the Tone3000 connection.');
    } else {
      setError('Connection failed — please try again.');
    }
    return;
  }

  if (!params.get('code')) return;
  // ... handleOAuthCallback ...
}, []);
```

Common error codes:

| Error | Cause | Recovery |
|---|---|---|
| `access_denied` | User cancelled or denied the request | Show connect button |
| `invalid_request` | Malformed parameters sent to authorize | Check your `startOAuthFlow` call |
| `server_error` | Unexpected error on Tone3000 | Retry — show "Connection failed" |

### Token errors

| Error | Endpoint | Cause | Recovery |
|---|---|---|---|
| `invalid_grant` | `POST /oauth/token` (code exchange) | Auth code expired (>30 min) or already used | Restart OAuth flow |
| `invalid_grant` | `POST /oauth/token` (refresh) | Refresh token expired or revoked | Clear tokens, restart OAuth flow |
| `invalid_client` | `POST /oauth/token` | Publishable key not recognised | Developer action: check/rotate key in dashboard |
| State mismatch | Callback | Possible CSRF or stale tab | Show error, restart OAuth flow |

`T3KClient` handles `401` responses from API calls automatically (proactive refresh + one retry). If a 401 persists after retry, `onAuthRequired` is called.

### Resource errors

| Status | Cause | User-facing message |
|---|---|---|
| `401` | Access token expired or invalid | Handled automatically by `T3KClient` |
| `403` | Tone is private and user does not have access | "This tone is not available." |
| `404` | Tone or model does not exist or was deleted | "This tone is no longer available." |
| `429` | Rate limit exceeded | Retry with exponential backoff |

---

## Security Notes

**Publishable key (`t3k_pub_...`):** Safe to include in frontend code and client-side bundles. It identifies your app to Tone3000 but cannot be used to make secret-key-only API calls.

**Secret key (`t3k_cs_...`):** Must never leave your server. Do not include it in frontend code, environment variables shipped to the browser, or commit it to source control. If exposed, rotate it immediately in the Tone3000 dashboard.

**PKCE:** The OAuth flow uses PKCE (Proof Key for Code Exchange) with S256. This means no client secret is required in the browser — the code verifier stored in `sessionStorage` is single-use and tied to the session. `handleOAuthCallback` verifies the `state` parameter against the stored value; a mismatch is treated as a potential CSRF attack and the callback is rejected.

**Token storage:** Tokens are stored in `sessionStorage`, which is tab-scoped and cleared when the tab is closed. Do not move tokens to `localStorage` without considering the cross-site scripting implications.
