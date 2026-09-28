import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { T3kPlayerProvider } from 'neural-amp-modeler-wasm';
import './index.css';
import App from './App';
import { t3kClient } from './client';

// Load persisted tokens before the first render so demos know if they're connected.
void t3kClient.hydrate().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <T3kPlayerProvider engineAssets={{ assetBaseUrl: '/engine/' }}>
        <App />
      </T3kPlayerProvider>
    </StrictMode>,
  );
});
