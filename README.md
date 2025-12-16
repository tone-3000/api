# TONE3000 API Integration Guide

This project demonstrates how to integrate with the TONE3000 API. TONE3000 offers two integration options: a low-code **Select** flow for quick integrations, or **Full API Access** for complete control. For the complete API documentation, visit [https://www.tone3000.com/api](https://www.tone3000.com/api).

![screenshot](https://raw.githubusercontent.com/tone-3000/t3k-api/refs/heads/main/src/assets/screenshot.png)

## Integration Options

### Select Flow (Low-Code)
The fastest way to integrate TONE3000. An OAuth-like flow that handles authentication and tone browsing through TONE3000's interface.

**Best for:**
- Quick integrations
- Plugins and native apps
- Apps that don't need custom browsing UI

### Full API Access
Complete programmatic control over the user experience with access to all API endpoints.

**Best for:**
- Custom user experiences
- Advanced filtering and search
- Apps that need to manage user content

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

## Select Flow

The Select flow is an OAuth-like integration that handles authentication and tone selection through TONE3000's interface. Your app simply redirects users to TONE3000 and receives complete tone data when they return.

### Step 1: Redirect to Select Page

Redirect users to the TONE3000 select page with your app details:

```typescript
const appId = 'your-awesome-app';
const redirectUrl = encodeURIComponent('https://your-app.com/callback');

// Redirect user to TONE3000 select page
window.location.href = `https://www.tone3000.com/api/v1/select?app_id=${appId}&redirect_url=${redirectUrl}`;
```

**For Native Apps (iOS/Android):** Launch the select URL in an in-app browser (e.g., SFSafariViewController on iOS, Chrome Custom Tabs on Android). Use a deep link URL (e.g., `yourapp://callback`) as your `redirect_url`.

### Step 2: User Authentication & Selection

On the TONE3000 select page, users will:
1. Login or create an account via OTP email code (if not already authenticated)
2. Browse and search public tones and their own private tones
3. Select a tone by clicking on it

### Step 3: Handle Callback & Fetch Tone Data

After selection, TONE3000 redirects back to your `redirect_url` with a `tone_url` query parameter. Fetch the tone data from this URL:

```typescript
// On your callback page
const urlParams = new URLSearchParams(window.location.search);
const toneUrl = urlParams.get('tone_url');

if (toneUrl) {
  // Fetch the tone data (includes models with download URLs)
  const response = await fetch(toneUrl);
  const tone = await response.json();
  
  console.log('Selected tone:', tone.title);
  console.log('Models:', tone.models);
  
  // Load the tone into your application
  loadTone(tone);
}
```

**Response Type:** `Tone & { models: Model[] }`

The response includes the complete tone object with an embedded `models` array containing pre-signed downloadable URLs.

**For Native Apps:** Configure your app to handle the deep link URL scheme. When your app is launched via the deep link, parse the `tone_url` parameter and make an HTTP request from your native code to fetch the tone data.

## Full API Access - Authentication

### Initial Setup

1. Redirect users to the TONE3000 authentication page:
```typescript
const redirectUrl = encodeURIComponent(APP_URL);
window.location.href = `https://www.tone3000.com/api/v1/auth?redirect_url=${redirectUrl}`;
```

*Note:* If your application only supports OTP authentication (e.g. IOT devices), include `otp_only=true` in the search parameters.

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
   window.location.href = `https://www.tone3000.com/api/v1/auth?redirect_url=${redirectUrl}`;
   ```

#### Using the t3kFetch Utility

The example `t3kFetch` utility handles all of this automatically, including proactive token refresh based on expiration time. Use it for all API requests:

```typescript
// Example: Fetching user data
const response = await t3kFetch('https://www.tone3000.com/api/v1/user');
const userData = await response.json();
```

This ensures consistent token handling across your application, including:
- Proactive token refresh before expiration
- Automatic retry on 401 errors
- Proper token storage and cleanup
- Seamless user experience without token expiration interruptions

## Full API Access - Endpoints

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
GET https://www.tone3000.com/api/v1/tones/created?page=1&page_size=10

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
  page_size: number;
  total: number;
  total_pages: number;
}

interface Tone {
  id: number;
  user_id: string;
  user: EmbeddedUser;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  gear: Gear;
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
GET https://www.tone3000.com/api/v1/tones/favorited?page=1&page_size=10
```

#### Search Tones
Search and filter tones with various options:

```typescript
GET https://www.tone3000.com/api/v1/tones/search?query=fender&page=1&page_size=10&sort=best-match&gear=amp&sizes=standard,lite

// Query Parameters
interface SearchParams {
  query?: string;        // Search query term (optional)
  page?: number;         // Page number (default: 1)
  page_size?: number;    // Items per page (default: 10, max: 25)
  sort?: TonesSort;      // Sort order (default: 'best-match' if query provided, else 'trending')
  gear?: Gear[];         // Filter by gear type (comma-separated)
  sizes?: Size[];        // Filter by model sizes (comma-separated)
}

// Sort Options
enum TonesSort {
  BestMatch = 'best-match',
  Newest = 'newest',
  Oldest = 'oldest',
  Trending = 'trending',
  DownloadsAllTime = 'downloads-all-time'
}
```

**Response Type:** `PaginatedResponse<Tone[]>`

### Users

Get a list of users with public content, sorted by various metrics:

```typescript
GET https://www.tone3000.com/api/v1/users?sort=tones&page=1&page_size=10

// Query Parameters
interface UsersParams {
  sort?: UsersSort;      // Sort users by stat (default: 'tones')
  page?: number;         // Page number (default: 1)
  page_size?: number;    // Items per page (default: 10, max: 10)
  query?: string;        // Search query to filter users by username
}

// Sort Options
enum UsersSort {
  Tones = 'tones',
  Downloads = 'downloads',
  Favorites = 'favorites',
  Models = 'models'
}

// Response Type
interface PublicUser {
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
```

**Response Type:** `PaginatedResponse<PublicUser[]>`

### Models

```typescript
GET https://www.tone3000.com/api/v1/models?tone_id={toneId}&page=1&page_size=10

// Response Type
interface PaginatedResponse<Model> {
  data: Model[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
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

#### Downloading Models

Use the `model_url` field to download model files. Include the access token in the Authorization header:

```typescript
const response = await fetch(model.model_url, {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

if (!response.ok) {
  throw new Error('Failed to download model');
}

const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = model.name;
document.body.appendChild(a);
a.click();
window.URL.revokeObjectURL(url);
document.body.removeChild(a);
```

**Response Type:** `.nam` or `.wav` file

## Enums

### Gear Types
```typescript
enum Gear {
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

## Rate Limiting

The API has a rate limit of **100 requests per minute** by default. For production applications that need higher limits, please email support@tone3000.com.

## Support & Feedback

Questions, issues, or feedback? Contact support@tone3000.com - we'd love to hear from you!
