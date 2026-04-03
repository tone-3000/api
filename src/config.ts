// config.ts — TONE3000 API configuration
// T3K_API points to production. VITE_T3K_API_DOMAIN can override for development.
export const T3K_API =
  (import.meta.env.VITE_T3K_API_DOMAIN as string | undefined) ?? 'https://www.tone3000.com';

export const PUBLISHABLE_KEY = import.meta.env.VITE_PUBLISHABLE_KEY as string;

export const REDIRECT_URI =
  (import.meta.env.VITE_REDIRECT_URI as string | undefined) ?? 'http://localhost:3001';
