# TONE3000 API Integration Guide

This project demonstrates how to integrate with the TONE3000 API. This guide will walk you through user authentication, session management, and available API endpoints. For the complete API documentation, visit [https://www.tone3000.com/api/docs](https://www.tone3000.com/api/docs).

## Environment Setup

1. Copy the example environment file:
```bash
cp env.example .env
```

2. Configure your environment variables in `.env`:
```
VITE_TONE3000_API_DOMAIN=https://www.tone3000.com
```

The `VITE_` prefix is required for Vite to expose the environment variable to the client-side code.

## Authentication

### Initial Setup

1. Redirect users to the TONE3000 authentication page:
```typescript
const redirectUrl = encodeURIComponent(APP_URL);
window.location.href = `https://www.tone3000.com/api/v1/auth?redirectUrl=${redirectUrl}`;
```

2. After successful authentication, TONE3000 will redirect back to your application with an `api_key` parameter.

3. Exchange the API key for session tokens:
```typescript
interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;  // seconds until token expires
  token_type: 'bearer';
}

const response = await fetch('https://www.tone3000.com/api/v1/auth/session', {
  method: 'POST',
  body: JSON.stringify({ api_key: apiKey })
});

const data = await response.json() as Session;
```

### Session Management

1. **Initial Authentication**
   - After successful authentication, you receive an `access_token`, `refresh_token`, and `expires_in` (seconds until token expires)
   - Store these tokens and expiration time securely (e.g., in localStorage):
   ```typescript
   localStorage.setItem('tone3000_access_token', data.access_token);
   localStorage.setItem('tone3000_refresh_token', data.refresh_token);
   localStorage.setItem('tone3000_expires_at', String(Date.now() + (data.expires_in * 1000)));
   ```

2. **Making API Requests**
   - Before making a request, check if the token is about to expire
   - If the token is expired or will expire soon (e.g., within 30 seconds), refresh it proactively
   - Include the access token in the Authorization header:
   ```typescript
   const expiresAt = parseInt(localStorage.getItem('tone3000_expires_at') || '0');
   
   // Check if token is expired or about to expire (within 30 seconds)
   if (Date.now() > expiresAt - 30000) {
     // Refresh token before making the request
     await refreshTokens();
   }

   const response = await fetch(url, {
     headers: {
       'Authorization': `Bearer ${accessToken}`,
       'Content-Type': 'application/json'
     }
   });
   ```

3. **Token Refresh Flow**
   - When proactively refreshing or when an API request returns 401 (Unauthorized):
     1. Use the refresh token to get a new access token
     2. Store the new tokens and expiration time
     3. Retry the original request if needed
   ```typescript
   const refreshResponse = await fetch('https://www.tone3000.com/api/v1/auth/session/refresh', {
     method: 'POST',
     body: JSON.stringify({
       refresh_token: refreshToken,
       access_token: accessToken
     })
   });

   const tokens = await refreshResponse.json() as Session;
   
   // Store new tokens and expiration
   localStorage.setItem('tone3000_access_token', tokens.access_token);
   localStorage.setItem('tone3000_refresh_token', tokens.refresh_token);
   localStorage.setItem('tone3000_expires_at', String(Date.now() + (tokens.expires_in * 1000)));
   ```

4. **Handling Refresh Failure**
   - If token refresh fails:
     1. Clear all stored tokens and expiration time
     2. Redirect user to login page to restart auth flow
   ```typescript
   localStorage.removeItem('tone3000_access_token');
   localStorage.removeItem('tone3000_refresh_token');
   localStorage.removeItem('tone3000_expires_at');
   window.location.href = `https://www.tone3000.com/api/v1/auth?redirectUrl=${redirectUrl}`;
   ```

#### Using the tone3000Fetch Utility

The example `tone3000Fetch` utility handles all of this automatically, including proactive token refresh based on expiration time. Use it for all API requests:

```typescript
// Example: Fetching user data
const response = await tone3000Fetch('https://www.tone3000.com/api/v1/user');
const userData = await response.json();
```

This ensures consistent token handling across your application, including:
- Proactive token refresh before expiration
- Automatic retry on 401 errors
- Proper token storage and cleanup
- Seamless user experience without token expiration interruptions

## API Endpoints

### User Information

```typescript
GET https://www.tone3000.com/api/v1/user

interface EmbeddedUser {
  id: string;
  username: string;
  avatar_url: string | null;
  url: string;
}

// Response Type
interface User extends EmbeddedUser {
  bio: string | null;
  links: string[] | null;
  created_at: string;
  updated_at: string;
}
```

### Tones

#### Get Created Tones
```typescript
GET https://www.tone3000.com/api/v1/tones/created?page=1&pageSize=10

interface Make {
  id: number;
  name: string;
}

interface Tag {
  id: number;
  name: string;
}

// Response Type
interface PaginatedResponse<Tone> {
  data: Tone[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Tone {
  id: number;
  user_id: string;
  user: EmbeddedUser;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  gear: GearType;
  images: string[] | null;
  is_public: boolean | null;
  links: string[] | null;
  platform: Platform;
  license: License;
  sizes: Size[];
  makes: Make[];
  tags: Tag[];
  models_count: number;
  downloads_count: number;
  favorites_count: number;
  url: string;
}
```

#### Get Favorited Tones
```typescript
GET https://www.tone3000.com/api/v1/tones/favorited?page=1&pageSize=10
```

### Models

```typescript
GET https://www.tone3000.com/api/v1/models?toneId={toneId}&page=1&pageSize=10

// Response Type
interface PaginatedResponse<Model> {
  data: Model[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Model {
  id: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  model_url: string;
  name: string;
  size: Size;
  tone_id: number;
}
```

## Enums

### Gear Types
```typescript
enum GearType {
  Amp = 'amp',
  FullRig = 'full-rig',
  Pedal = 'pedal',
  Outboard = 'outboard',
  Ir = 'ir'
}
```

### Platforms
```typescript
enum Platform {
  Nam = 'nam',
  Ir = 'ir',
  AidaX = 'aida-x',
  AaSnapshot = 'aa-snapshot',
  Proteus = 'proteus'
}
```

### Licenses
```typescript
enum License {
  T3k = 't3k',
  CcBy = 'cc-by',
  CcBySa = 'cc-by-sa',
  CcByNc = 'cc-by-nc',
  CcByNcSa = 'cc-by-nc-sa',
  CcByNd = 'cc-by-nd',
  CcByNcNd = 'cc-by-nc-nd',
  Cco = 'cco'
}
```

### Sizes
```typescript
enum Size {
  Standard = 'standard',
  Lite = 'lite',
  Feather = 'feather',
  Nano = 'nano',
  Custom = 'custom'
}
```

## Development

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3001`.