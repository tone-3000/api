// config.ts — TONE3000 API configuration (from .env, see .env.example)
export const T3K_API = (process.env.EXPO_PUBLIC_T3K_API_DOMAIN ?? 'https://www.tone3000.com').replace(/\/+$/, '');

export const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_T3K_PUBLISHABLE_KEY ?? '';

/**
 * OAuth redirect URI. The in-app WebView intercepts navigation to it, so the
 * scheme doesn't need to be registered with the OS. If your key has
 * registered redirect URIs, this must be one of them.
 */
export const REDIRECT_URI = process.env.EXPO_PUBLIC_T3K_REDIRECT_URI ?? 'tone3000-example://oauth/callback';
