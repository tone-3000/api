import { NativeModule, requireNativeModule } from 'expo';

import type { PreviewStatus } from './T3kPreview.types';

declare class T3kPreviewModule extends NativeModule {
  /**
   * Load a preview chain. Each argument is a local file path, a bundled asset
   * token (`'fallback-amp'` / `'fallback-cab'`), or `''` to skip that stage.
   * The bundled DI guitar clip is always the input.
   */
  load(modelPath: string, irPath: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  /** Stop and rewind to the start of the clip. */
  stop(): void;
  /** Playback auto-stops and rewinds at the end of the clip. */
  getStatus(): PreviewStatus;
}

export default requireNativeModule<T3kPreviewModule>('T3kPreview');
