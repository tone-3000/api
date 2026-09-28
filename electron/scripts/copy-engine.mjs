// Copies the preview player's AudioWorklet + WASM into the renderer's public/engine
// so they're served from a stable URL (see engineAssets in src/renderer/src/main.tsx).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', 'neural-amp-modeler-wasm', 'dist', 'engine');
const outDir = join(root, 'src', 'renderer', 'public', 'engine');

mkdirSync(outDir, { recursive: true });
for (const file of ['nam-worklet.js', 'nam-engine.wasm']) {
  cpSync(join(srcDir, file), join(outDir, file));
}
