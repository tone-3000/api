import { useEffect, useState } from 'react';

import { userMessage } from '@/t3k/client';

export interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Re-runs `load` `delayMs` after `key` stops changing and drops stale
 * responses. `key` should capture every input `load` depends on.
 */
export function useLoad<T>(key: string, load: () => Promise<T>, delayMs = 300): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      load().then(
        (data) => current && setState({ data, error: null, loading: false }),
        (err) => current && setState((s) => ({ ...s, error: userMessage(err), loading: false })),
      );
    }, delayMs);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key]);

  return state;
}
