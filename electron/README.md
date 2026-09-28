# Desktop example (Electron)

The three demo apps as an Electron desktop app. The renderer reuses the web example's
React UI and wasm preview player. The desktop-specific work (OAuth, token storage,
downloads) lives in the main process.

## Run it

```bash
cd electron
cp .env.example .env     # then set VITE_PUBLISHABLE_KEY
npm install
npm run dev              # or: npm run build && npm start
npm run dist             # package with electron-builder into release/
```

| Variable | Default | |
|---|---|---|
| `VITE_PUBLISHABLE_KEY` | — | Your `t3k_pub_…` key |
| `VITE_REDIRECT_URI` | `http://localhost:3001/callback` | Must be registered on your key if any redirect URIs are registered |
| `VITE_T3K_API_DOMAIN` | `https://www.tone3000.com` | API origin override |

## How it works

- **Embedded OAuth** (`src/main/oauth.ts`): each flow opens a sandboxed
  `WebContentsView` inside a sheet in the app window. The main process generates PKCE
  and `state`, intercepts navigation to the redirect URI before it loads, and exchanges
  the code itself. Nothing serves the redirect URI. The view uses a persistent session
  partition, so later flows skip sign-in. Escape or the Close button cancels.
- **Token storage** (`src/main/tokenStore.ts`): tokens are encrypted with
  `safeStorage` (Keychain, DPAPI or libsecret) under the app's `userData` directory.
- **Downloads**: model files are fetched in the renderer with the Bearer token and saved
  from a blob. Zip downloads go through `webContents.downloadURL` so the OS save dialog
  is used.
- **Hardening** (`src/main/index.ts`): the production build is served from a privileged
  `app://` scheme with a CSP. The main window is sandboxed with a minimal preload
  bridge (`window.t3k`). Every IPC call checks that it came from the app's own origin,
  and external links open in the system browser.

| File | What it shows |
|---|---|
| `src/shared/ipc.ts` | The typed bridge between renderer and main |
| `src/renderer/src/useEmbeddedFlow.ts` | Starting a flow and keeping the view aligned with the sheet |
| `src/renderer/src/tone3000-client.ts` | The web client, with token persistence routed through the bridge |
| `src/renderer/src/apps/` | Select, Load Tone and Full API demos |
