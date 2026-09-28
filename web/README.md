# Web example (React + Vite)

The three demo apps as a browser app, plus a LAN-relay demo for headless hardware. The
preview player uses [`neural-amp-modeler-wasm`](https://www.npmjs.com/package/neural-amp-modeler-wasm)
(an AudioWorklet build of NeuralAmpModelerCore).

## Run it

```bash
cd web
cp env.example .env      # then set VITE_PUBLISHABLE_KEY
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). `npm run dev` and `npm run build`
first copy the wasm engine from `node_modules` into `public/engine` (see
`scripts/copy-engine.mjs`).

| Variable | Default | |
|---|---|---|
| `VITE_PUBLISHABLE_KEY` | — | Your `t3k_pub_…` key |
| `VITE_PUBLISHABLE_KEY_SELECT` / `_LOAD` / `_FULL` | `VITE_PUBLISHABLE_KEY` | Optional per-demo keys, so the TONE3000 partner banner shows each company's name |
| `VITE_REDIRECT_URI` | `http://localhost:3001` | Must be registered on your key if any redirect URIs are registered |
| `VITE_T3K_API_DOMAIN` | `https://www.tone3000.com` | API origin override |

When deploying to Vercel, set the project's **Root Directory** to `web`.

## Where to look

| File | What it shows |
|---|---|
| `src/tone3000-client.ts` | Zero-dependency client: flow starters, callback handling, token refresh, every endpoint |
| `src/types.ts`, `src/labels.ts` | API types and display labels |
| `src/apps/SelectApp.tsx` | Select flow in a popup, with catalog options |
| `src/apps/LoadToneApp.tsx` | Load Tone flow with API-first loading and replacements |
| `src/apps/FullApiApp.tsx` | Full API: library, discover, search, catalog, profile |
| `src/usePopupCallback.ts` | Relaying a popup callback via `postMessage` / `BroadcastChannel` |
| `src/components/ModelList.tsx` | Preview player + downloads |
| `src/apps/LanFlowApp.tsx`, `vite-plugin-lan-bridge.ts` | LAN-relay flow (dev only) |

## Using the client

```typescript
import { startSelectFlow, startLoadToneFlow, startStandardFlow, handleOAuthCallback, T3KClient } from './tone3000-client';
import { Architecture, Format, Gear, TonesSort } from './types';

// Select: user browses TONE3000 and picks a tone
await startSelectFlow(PUBLISHABLE_KEY, REDIRECT_URI, {
  gears: 'amp-cab', format: Format.Nam, architecture: Architecture.A2, preview: true,
});

// Load Tone: verify access to a known tone (the user may pick a replacement)
await startLoadToneFlow(PUBLISHABLE_KEY, REDIRECT_URI, toneId, { architecture: Architecture.A2 });

// Standard: connect the account for Full API access
await startStandardFlow(PUBLISHABLE_KEY, REDIRECT_URI);
```

The `…Popup` variants (`startSelectFlowPopup`, `startLoadToneFlowPopup`) keep your page
open; pair them with `handleOAuthCallbackFromPopup`.

```typescript
// On the page at REDIRECT_URI
const result = await handleOAuthCallback(PUBLISHABLE_KEY, REDIRECT_URI);
if (result.ok) {
  client.setTokens(result.tokens);
  // result.toneId for Select / Load Tone; result.canceled if the user closed the flow after signing in
} else if (result.error !== 'canceled') {
  console.error('Auth failed:', result.error);
}

const client = new T3KClient(PUBLISHABLE_KEY, () => {
  // Session over (refresh token expired): prompt the user to reconnect
});

const tone = await client.getTone(42, { architecture: Architecture.A2 });
const { data: models } = await client.listModels(42, { architecture: Architecture.A2 });
const results = await client.searchTones({ query: 'plexi', gears: [Gear.Amp], sort: TonesSort.Trending });
await client.downloadModel(models[0].model_url, models[0].name); // Bearer auth; don't fetch() model_url directly
```

## LAN-relay flow

For devices with a screen but no browser (embedded processors, kiosks). The device
listens on its LAN IP and shows a QR code for the authorize URL, with that LAN address
as `redirect_uri`. The user signs in on their phone, and TONE3000 forwards the code to
the device over its HTTPS bridge. PKCE means only the device can redeem the code.

```
GET /api/v1/oauth/authorize?redirect_uri=http://192.168.x.x:port/cb
  → user signs in on phone → /oauth/lan-bridge → device listener receives code
  → POST /api/v1/oauth/token (same redirect_uri)
```

The phone must be on the same network. In this demo the "device" is the Vite dev
server itself (`vite-plugin-lan-bridge.ts`), so the demo only appears under `npm run dev`.
