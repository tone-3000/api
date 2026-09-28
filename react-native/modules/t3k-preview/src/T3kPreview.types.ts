export type PreviewStatus = {
  playing: boolean;
  /** Seconds into the DI clip. */
  position: number;
  /** Length of the DI clip in seconds. */
  duration: number;
};

/**
 * What to play for one preview:
 * - `model`: a NAM file path, `'fallback-amp'`, or `''` for none
 * - `ir`: an IR file path, `'fallback-cab'`, or `''` for none
 */
export type PreviewChain = {
  model: string;
  ir: string;
};
