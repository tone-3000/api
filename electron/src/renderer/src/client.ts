// client.ts — the one shared T3KClient instance
import { PUBLISHABLE_KEY } from './config';
import { T3KClient } from './tone3000-client';

const authRequiredListeners = new Set<() => void>();

/** Notified when the session ends (no tokens, or the refresh token expired). */
export function onAuthRequired(listener: () => void): () => void {
  authRequiredListeners.add(listener);
  return () => authRequiredListeners.delete(listener);
}

export const t3kClient = new T3KClient(PUBLISHABLE_KEY, () => {
  authRequiredListeners.forEach((listener) => listener());
});
