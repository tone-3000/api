// useEmbeddedFlow.ts — run a TONE3000 OAuth flow in the embedded view
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PUBLISHABLE_KEY, REDIRECT_URI, T3K_API } from './config';
import type { AuthResult, ViewBounds } from '../../shared/ipc';

export interface EmbeddedFlow {
  active: boolean;
  /** Start a flow with authorize params from selectToneParams() etc. */
  start: (params: Record<string, string>) => void;
  cancel: () => void;
  /** Attach to the element the TONE3000 view should cover. */
  hostRef: React.RefObject<HTMLDivElement>;
}

function boundsOf(el: HTMLElement): ViewBounds {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/**
 * The TONE3000 page renders in a native view layered above the app, so the app
 * reserves space for it with a placeholder element (`hostRef`) and keeps the
 * view's bounds in sync with that element. Results arrive from main over IPC.
 */
export function useEmbeddedFlow(onResult: (result: AuthResult) => void): EmbeddedFlow {
  const [active, setActive] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const pendingParams = useRef<Record<string, string> | null>(null);
  const activeRef = useRef(false);
  const handler = useRef(onResult);
  handler.current = onResult;

  useEffect(() => window.t3k.auth.onResult((result) => {
    activeRef.current = false;
    setActive(false);
    handler.current(result);
  }), []);

  // Leaving the screen mid-flow tears the view down.
  useEffect(() => () => {
    if (activeRef.current) void window.t3k.auth.cancel();
  }, []);

  const start = useCallback((params: Record<string, string>) => {
    if (!PUBLISHABLE_KEY) {
      handler.current({ status: 'error', error: 'missing_publishable_key' });
      return;
    }
    pendingParams.current = params;
    activeRef.current = true;
    setActive(true);
  }, []);

  const cancel = useCallback(() => { void window.t3k.auth.cancel(); }, []);

  // Once the placeholder is mounted, open the view over it and track its bounds.
  useLayoutEffect(() => {
    const el = hostRef.current;
    const params = pendingParams.current;
    if (!active || !el) return;
    if (params) {
      pendingParams.current = null;
      void window.t3k.auth.begin(
        { apiBase: T3K_API, publishableKey: PUBLISHABLE_KEY, redirectUri: REDIRECT_URI, params },
        boundsOf(el),
      );
    }
    const sync = () => window.t3k.auth.setBounds(boundsOf(el));
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [active]);

  return { active, start, cancel, hostRef };
}

/** User-facing text for a failed flow. */
export function flowErrorMessage(error: string): string {
  if (error === 'missing_publishable_key') return 'Set VITE_PUBLISHABLE_KEY in electron/.env and restart.';
  if (error.startsWith('authorize_failed')) {
    return 'TONE3000 rejected the request. Check your publishable key and registered redirect URI.';
  }
  if (error === 'load_failed') return "Couldn't reach TONE3000. Check your connection and try again.";
  return 'Authentication failed. Please try again.';
}
