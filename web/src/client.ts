// client.ts — the one shared T3KClient instance
import { PUBLISHABLE_KEY_FULL, REDIRECT_URI } from './config';
import { T3KClient, startStandardFlow } from './tone3000-client';
import type { Demo } from './types';

export function getActiveDemo(): Demo | null {
  return new URLSearchParams(window.location.search).get('demo') as Demo | null;
}

// sessionStorage tokens survive page refreshes within the tab
export const t3kClient = new T3KClient(PUBLISHABLE_KEY_FULL, () => {
  const demo = getActiveDemo();
  // Popup-based demos re-authenticate through their own popup; a full-page
  // redirect here would break that UX.
  if (demo === 'select' || demo === 'load-tone') return;
  // Re-authenticate silently; the user won't see a login if still signed into TONE3000
  sessionStorage.setItem('t3k_pending_demo', demo ?? 'full-api');
  void startStandardFlow(PUBLISHABLE_KEY_FULL, REDIRECT_URI);
});
