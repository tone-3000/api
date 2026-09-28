// usePopupCallback.ts — receive OAuth results relayed from a flow popup
import { useEffect, useRef } from 'react';
import { REDIRECT_URI } from './config';
import { handleOAuthCallbackFromPopup, type OAuthCallbackResult } from './tone3000-client';

/**
 * The popup's redirect page relays the callback with `postMessage`, or with
 * `BroadcastChannel('t3k_oauth')` when the browser dropped `window.opener`
 * (e.g. after a cross-origin sign-in). Listen on both.
 *
 * `onRelayed` fires synchronously when a callback arrives — before the token
 * exchange — so the UI can switch to a loading state immediately.
 */
export function usePopupCallback(
  publishableKey: string,
  onResult: (result: OAuthCallbackResult) => void,
  onRelayed?: () => void,
): void {
  const handlers = useRef({ onResult, onRelayed });
  handlers.current = { onResult, onRelayed };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 't3k_oauth_callback') return;
      handlers.current.onRelayed?.();
      const result = await handleOAuthCallbackFromPopup(publishableKey, REDIRECT_URI, event);
      if (result) handlers.current.onResult(result);
    };

    window.addEventListener('message', handleMessage);
    const bc = new BroadcastChannel('t3k_oauth');
    bc.onmessage = handleMessage;
    return () => {
      window.removeEventListener('message', handleMessage);
      bc.close();
    };
  }, [publishableKey]);
}

/** Poll a popup so the UI can leave its "waiting" state if the user closes it. */
export function useWatchPopupClosed(
  popup: React.MutableRefObject<Window | null>,
  active: boolean,
  onClosed: () => void,
): void {
  const closed = useRef(onClosed);
  closed.current = onClosed;

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        closed.current();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [active, popup]);
}
