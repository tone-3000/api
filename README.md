# TONE3000 API — Integration Examples

Reference integrations showing how to connect your app to the TONE3000 API.
TONE3000 is a tone library for guitar and audio software — visit
[tone3000.com/api](https://www.tone3000.com/api) for full API documentation.

Run any of them locally in minutes using your own TONE3000 API key.

## Demo Apps

### 🎸 Amp Hub — Select Flow
*Best for: Plugins, DAWs, and apps where TONE3000 drives tone discovery.*

AmpHub is a guitar amp simulation plugin. When a user clicks "Browse Tones on
TONE3000", they're taken to the TONE3000 catalog to browse and select a tone.
Once selected, AmpHub receives the tone and its downloadable model files.

**Flow:** `GET /api/v1/oauth/authorize?prompt=select_tone` → callback with `tone_id` → `GET /api/v1/tones/{id}`

---

### 🔄 Rig Sync — Load Tone Flow
*Best for: Apps with saved tone references that need authentication and access checking.*

Rig Sync is a rig preset manager. It stores TONE3000 tone IDs in its presets and
loads them on demand. TONE3000 handles the auth check — if a tone is private or
deleted, the user can pick a replacement without leaving the flow.

**Flow:** `GET /api/v1/oauth/authorize?prompt=load_tone&tone_id=42` → callback with `tone_id` + code → fetch tone

---

### 🧠 NAM Loader — Load Model Flow
*Best for: Apps that load specific neural amp model files.*

NAM Loader is a neural amp model loader. It holds model IDs, authenticates the
user on TONE3000, and downloads model files directly. If a model is inaccessible,
TONE3000 notifies the app and NAM Loader shows a clear error.

**Flow:** `GET /api/v1/oauth/authorize?prompt=load_model&model_id=5` → success callback with `model_id`, or `error=access_denied`

---

### 🗄️ Tone Vault — Full API Integration
*Best for: Apps with a custom tone browsing and discovery experience.*

Tone Vault demonstrates every documented TONE3000 endpoint: search with filters,
tone detail views, user profiles, favorites, model listings, and file downloads.
It's the reference implementation for a full API integration.

**Endpoints used:** `GET /user`, `GET /tones/search`, `GET /tones/created`, `GET /tones/favorited`,
`GET /tones/{id}`, `GET /models/{id}`, `GET /models`, `GET /users`

---

## Quick Start

### 1. Get an API Key

1. Log in to [tone3000.com](https://www.tone3000.com)
2. Go to **Settings → API Keys**
3. Click **Create API Key** — you'll receive a `t3k_pub_…` publishable key
4. Copy the publishable key (the secret key is for server-side use only)

### 2. Configure your environment

```bash
cp env.example .env
```

Edit `.env`:

```
VITE_PUBLISHABLE_KEY=t3k_pub_your_key_here
VITE_REDIRECT_URI=http://localhost:3001
```

**Registering your redirect URI:** In TONE3000 Settings → API Keys, add
`http://localhost:3001` to your key's allowed redirect URIs. Localhost origins
are automatically allowed during development — no registration needed.

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) — you'll see the four demo
apps. Each one opens a self-contained integration example.

---

## SDK Client

The `src/tone3000-client.ts` file is a zero-dependency integration helper
that covers all four OAuth flows and the full set of API endpoints. Copy it into
your project as a starting point — it's designed to be close to the public SDK
we'll be releasing.

### OAuth Flow Functions

```typescript
import { startSelectFlow, startLoadToneFlow, startLoadModelFlow, startStandardFlow, handleOAuthCallback, T3KClient } from './tone3000-client';

// Select Flow — user browses TONE3000 and picks a tone
await startSelectFlow(PUBLISHABLE_KEY, REDIRECT_URI);

// Load Tone Flow — TONE3000 authenticates the user and checks access to a specific tone
await startLoadToneFlow(PUBLISHABLE_KEY, REDIRECT_URI, toneId);

// Load Model Flow — TONE3000 authenticates the user and checks access to a specific model
await startLoadModelFlow(PUBLISHABLE_KEY, REDIRECT_URI, modelId);

// Standard Flow — user connects their TONE3000 account; app fetches tones programmatically
await startStandardFlow(PUBLISHABLE_KEY, REDIRECT_URI);
```

### Handling the Callback

```typescript
// In your callback handler (runs when TONE3000 redirects back to your app):
const result = await handleOAuthCallback(PUBLISHABLE_KEY, REDIRECT_URI);

if (result.ok) {
  client.setTokens(result.tokens);
  const { toneId, modelId } = result; // present for select/load_tone/load_model flows
} else {
  // result.error is 'access_denied' for load_model when the model is private
  console.error('Auth failed:', result.error);
}
```

### T3KClient — Authenticated API Requests

```typescript
const client = new T3KClient(PUBLISHABLE_KEY, () => {
  // Called when tokens expire beyond refresh — restart auth
  startStandardFlow(PUBLISHABLE_KEY, REDIRECT_URI);
});

// Set tokens from the callback result
client.setTokens(result.tokens);

// Fetch a tone (includes models array)
const tone = await client.getTone(42);

// Search tones with filters
const results = await client.searchTones({ query: 'fender', gear: [Gear.Amp], sort: TonesSort.Trending });

// Download a model file (requires Bearer auth — use this method, not fetch())
await client.downloadModel(model.model_url, model.name);
```

---

## API Reference

Full reference: [tone3000.com/api](https://www.tone3000.com/api)

### OAuth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/oauth/authorize` | Start an OAuth flow |
| POST | `/api/v1/oauth/token` | Exchange code or refresh token |

### Resource Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/user` | Authenticated user profile |
| GET | `/api/v1/tones/{id}` | Tone by ID (includes models) |
| GET | `/api/v1/tones/search` | Search and filter tones |
| GET | `/api/v1/tones/created` | Tones created by the authenticated user |
| GET | `/api/v1/tones/favorited` | Tones favorited by the authenticated user |
| GET | `/api/v1/models/{id}` | Model by ID |
| GET | `/api/v1/models` | Models for a tone |
| GET | `/api/v1/users` | Public user list |

### Rate Limiting

100 requests/minute. For higher limits, contact support@tone3000.com.

---

## Support

Questions? Email support@tone3000.com or open an issue in this repo.
