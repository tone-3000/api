# React Native example (Expo)

The three demo apps in React Native with [Expo](https://expo.dev) and Expo Router. The
preview player is a local Expo module (`modules/t3k-preview`) that wraps the shared C++
engine: AVAudioEngine on iOS, Oboe on Android.

Because of that native module, the app runs in a **development build**, not Expo Go.

## Run it

```bash
git submodule update --init --recursive     # NeuralAmpModelerCore, from the repo root
cd react-native
cp .env.example .env      # then set EXPO_PUBLIC_T3K_PUBLISHABLE_KEY
npm install
npm run ios               # expo run:ios — needs Xcode + CocoaPods
npm run android           # expo run:android — needs the Android SDK/NDK and JDK 17 or 21
```

`expo run:*` generates the native `ios/` and `android/` projects (gitignored), builds
them, and starts Metro. Later, `npm start` is enough until native code changes. Restart
Metro after editing `.env`.

| Variable | Default | |
|---|---|---|
| `EXPO_PUBLIC_T3K_PUBLISHABLE_KEY` | — | Your `t3k_pub_…` key |
| `EXPO_PUBLIC_T3K_REDIRECT_URI` | `tone3000-example://oauth/callback` | Must be registered on your key if any redirect URIs are registered |
| `EXPO_PUBLIC_T3K_API_DOMAIN` | `https://www.tone3000.com` | API origin override |

## How it works

- **OAuth** (`src/t3k/auth.tsx`): `AuthFlowProvider` shows flows in a modal
  `react-native-webview`. The WebView keeps the TONE3000 session, so later flows skip
  sign-in. Navigation to the redirect URI is caught in `onShouldStartLoadWithRequest`,
  and the code is exchanged with PKCE (generated with `expo-crypto`).
  - The redirect scheme must be listed in `originWhitelist`. Otherwise the WebView
    hands the URL to the OS instead of the callback.
  - `src/app/oauth/callback.tsx` catches the redirect if it ever does reach the app.
- **Tokens** (`src/t3k/tone3000-client.ts`): cached in memory and persisted with
  `expo-secure-store` (Keychain or Keystore). The client refreshes proactively, and on
  401. `useConnected()` re-renders screens on connect and disconnect.
- **Downloads**: model files are saved to the cache directory with `expo-file-system`
  (Bearer auth) and shared with `expo-sharing`.
- **Preview**: `previewPlayer` / `usePreviewPlayer()` in `modules/t3k-preview` share one
  engine across all buttons. `src/t3k/tones.ts#previewChain` picks the model, IR and
  fallback assets.

| Path | What it shows |
|---|---|
| `src/app/select.tsx` | Select flow with catalog options |
| `src/app/load-tone.tsx` | Load Tone flow with API-first loading and replacements |
| `src/app/full-api.tsx` | Full API: library, discover, search, catalog, profile |
| `src/app/tone/[id].tsx` | Tone detail: favorite, zip download, models |
| `modules/t3k-preview/ios`, `…/android` | Swift and Kotlin/JNI bindings for the engine |

`modules/t3k-preview/ios/native` is a symlink to the repo's `native/` directory, because
CocoaPods only compiles sources inside the pod. Android references `native/` directly
from CMake.
