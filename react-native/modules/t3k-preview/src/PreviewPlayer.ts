import { useSyncExternalStore } from 'react';

import T3kPreview from './T3kPreviewModule';
import type { PreviewChain } from './T3kPreview.types';

export type PlayerState = {
  /** Player (e.g. model row) that owns the engine. */
  activeId: string | null;
  /** Player currently resolving its chain (downloading the model). */
  loadingId: string | null;
  playing: boolean;
  /** 0–1 through the DI clip. */
  progress: number;
};

let state: PlayerState = { activeId: null, loadingId: null, playing: false, progress: 0 };
let loaded: PreviewChain | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function startPolling() {
  stopPolling();
  timer = setInterval(() => {
    const { playing, position, duration } = T3kPreview.getStatus();
    if (!playing) {
      // The engine auto-stops and rewinds at the end of the clip.
      stopPolling();
      set({ playing: false, progress: 0 });
      return;
    }
    set({ progress: duration > 0 ? Math.min(1, position / duration) : 0 });
  }, 100);
}

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * One engine shared by every preview button, like the web player's
 * T3kPlayerProvider: starting a player stops whichever one was playing.
 */
export const previewPlayer = {
  /**
   * Toggle player `id`. `resolve` returns the chain on first play (typically
   * downloading the model file), so nothing is fetched until the user taps.
   */
  async toggle(id: string, resolve: () => Promise<PreviewChain>): Promise<void> {
    if (state.activeId === id && state.playing) {
      T3kPreview.pause();
      stopPolling();
      set({ playing: false });
      return;
    }

    set({ loadingId: id });
    try {
      const chain = await resolve();
      // Switching players reloads and rewinds; resuming continues in place.
      if (state.activeId !== id || loaded?.model !== chain.model || loaded?.ir !== chain.ir) {
        T3kPreview.stop();
        stopPolling();
        set({ playing: false, progress: 0 });
        loaded = null;
        await T3kPreview.load(chain.model, chain.ir);
        loaded = chain;
      }
      await T3kPreview.play();
      set({ activeId: id, playing: true });
      startPolling();
    } finally {
      set({ loadingId: null });
    }
  },

  stop(): void {
    T3kPreview.stop();
    stopPolling();
    set({ activeId: null, playing: false, progress: 0 });
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreviewPlayer(): PlayerState {
  return useSyncExternalStore(subscribe, () => state);
}
