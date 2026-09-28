// config.ts — TONE3000 API configuration (from .env)
export const T3K_API = (
  (import.meta.env.VITE_T3K_API_DOMAIN as string | undefined) ?? 'https://www.tone3000.com'
).replace(/\/+$/, '');

export const PUBLISHABLE_KEY = (import.meta.env.VITE_PUBLISHABLE_KEY as string | undefined) ?? '';

// Main intercepts the embedded view's navigation to this URL; nothing serves it.
export const REDIRECT_URI =
  (import.meta.env.VITE_REDIRECT_URI as string | undefined) ?? 'http://localhost:3001/callback';
