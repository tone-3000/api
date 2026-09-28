// client.ts — the one shared T3KClient instance
import { useSyncExternalStore } from 'react';

import { PUBLISHABLE_KEY } from './config';
import { ApiError, T3KClient } from './tone3000-client';

// When the session ends the client clears its tokens, which flips
// useConnected() and sends the Full API demo back to its connect screen.
export const t3kClient = new T3KClient(PUBLISHABLE_KEY, () => {});

/** User-facing text for an API failure. */
export function userMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isRateLimit) return "You're going a bit fast — wait a moment and try again.";
    if (err.isForbidden) return "Your app doesn't have access to this endpoint.";
    if (err.isNotFound) return 'Not found. It may be private or deleted.';
  }
  if (err instanceof Error && err.message === 'Not authenticated') return 'Connect your TONE3000 account first.';
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/** Re-renders when the user connects or disconnects. */
export function useConnected(): boolean {
  return useSyncExternalStore(t3kClient.subscribe, () => t3kClient.isConnected());
}
