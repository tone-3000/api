// config.ts — TONE3000 API configuration
//
// QA preview build: this branch points at the a2 feature-branch deployment so
// the example app can be tested against unreleased API changes. The domain and
// publishable key are hardcoded here intentionally — do NOT switch them back to
// env vars on this branch. Production examples live on `main`.
//
// Trailing slashes are stripped so `${T3K_API}/api/...` never produces a double
// slash — Vercel 308-redirects double-slash paths, and redirects drop CORS
// headers.
export const T3K_API =
  'https://tone-zone-web-ylwj-git-am-a2-ui-updates-woodyburys-projects.vercel.app'.replace(/\/+$/, '');

export const PUBLISHABLE_KEY = 't3k_pub_BdGeeepny_zJHwNp4qyxGuiOZXB17-qM';

// Per-demo keys collapse to the same hardcoded key on this branch.
export const PUBLISHABLE_KEY_SELECT = PUBLISHABLE_KEY;
export const PUBLISHABLE_KEY_LOAD = PUBLISHABLE_KEY;
export const PUBLISHABLE_KEY_FULL = PUBLISHABLE_KEY;

export const REDIRECT_URI =
  (import.meta.env.VITE_REDIRECT_URI as string | undefined) ?? 'http://localhost:3001';
