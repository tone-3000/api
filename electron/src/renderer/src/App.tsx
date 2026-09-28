// App.tsx
import { useState } from 'react';
import { SelectApp } from './apps/SelectApp';
import { LoadToneApp } from './apps/LoadToneApp';
import { FullApiApp } from './apps/FullApiApp';
import type { Demo } from './types';
import t3kLogo from './assets/t3k.svg';

export default function App() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const back = () => setDemo(null);

  if (demo === 'select') return <SelectApp onBack={back} />;
  if (demo === 'load-tone') return <LoadToneApp onBack={back} />;
  if (demo === 'full-api') return <FullApiApp onBack={back} />;

  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className="landing-title">TONE3000 API Examples</h1>
        <p className="landing-subtitle">
          Reference desktop integrations showing how to build against the TONE3000 API.
        </p>
        <a className="landing-api-link" href="https://www.tone3000.com/api" target="_blank" rel="noopener noreferrer">
          <img src={t3kLogo} alt="TONE3000 API" className="landing-t3k-logo" />
          <span>View API Documentation →</span>
        </a>
      </header>

      <div className="demo-grid">
        <button className="demo-card" onClick={() => setDemo('select')}>
          <div className="demo-card-tag">Select Flow</div>
          <h2 className="demo-card-title">Acme Inc</h2>
          <p className="demo-card-product">Guitar Amp Simulation App</p>
          <p className="demo-card-desc">
            Acme Inc lets users browse the TONE3000 catalog and select a tone to load
            into the app. No tone UI to build — TONE3000 handles selection.
          </p>
          <div className="demo-card-use-case">
            Best for: Plugins, DAWs, apps where TONE3000 drives tone discovery
          </div>
          <span className="demo-card-cta">Open Demo →</span>
        </button>

        <button className="demo-card" onClick={() => setDemo('load-tone')}>
          <div className="demo-card-tag">Load Tone Flow</div>
          <h2 className="demo-card-title">Beacon Inc</h2>
          <p className="demo-card-product">Rig Preset Management App</p>
          <p className="demo-card-desc">
            Beacon Inc stores tone IDs and syncs them from TONE3000 on demand.
            The user authenticates once; Beacon Inc handles access errors gracefully.
          </p>
          <div className="demo-card-use-case">
            Best for: Apps with saved tone references that need auth + access checking
          </div>
          <span className="demo-card-cta">Open Demo →</span>
        </button>

        <button className="demo-card" onClick={() => setDemo('full-api')}>
          <div className="demo-card-tag">Full API Integration</div>
          <h2 className="demo-card-title">Chord Inc</h2>
          <p className="demo-card-product">Tone Discovery & Management App</p>
          <p className="demo-card-desc">
            Chord Inc builds its own tone UI on the REST API: the user's library,
            trending and latest feeds, search, makes and tags, creators, favorites,
            and model downloads, plus a “Browse TONE3000” Select entry point.
          </p>
          <div className="demo-card-use-case">
            Best for: Apps with a custom tone browsing and management experience
          </div>
          <span className="demo-card-cta">Open Demo →</span>
        </button>
      </div>
    </div>
  );
}
