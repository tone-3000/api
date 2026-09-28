# iOS example (SwiftUI)

The three demo apps in SwiftUI (iOS 17+), with the shared C++ preview engine compiled
into the app.

## Run it

```bash
git submodule update --init --recursive     # NeuralAmpModelerCore, from the repo root
brew install xcodegen
cd ios
cp Config.local.xcconfig.example Config.local.xcconfig   # then set T3K_PUBLISHABLE_KEY
xcodegen generate
open TONE3000Example.xcodeproj
```

Pick your development team under Signing & Capabilities, then run.

| Setting (`Config.local.xcconfig`) | Default | |
|---|---|---|
| `T3K_PUBLISHABLE_KEY` | — | Your `t3k_pub_…` key |
| `T3K_REDIRECT_SCHEME` | `tone3000-example` | Redirect URI is `<scheme>://oauth/callback`; register it on your key |
| `T3K_API_HOST` | `www.tone3000.com` | Bare hostname (xcconfig treats `//` as a comment) |

## How it works

- **OAuth** (`App/T3K/AuthService.swift`, `AuthBrowser.swift`): flows run in a sheet
  hosting a persistent `WKWebView`, rather than `ASWebAuthenticationSession`. That avoids
  the system "Wants to Use … to Sign In" prompt, and the TONE3000 session persists so
  later flows skip sign-in. Navigation to the redirect URI is intercepted in the web
  view, then the code is exchanged with PKCE.
- **Tokens** (`App/T3K/KeychainStore.swift`): stored in the Keychain.
  `App/T3K/T3KClient.swift` refreshes proactively, and on 401.
- **Preview** (`App/Audio/`): `PreviewEngine.swift` drives the C++ engine from an
  `AVAudioSourceNode` at 48 kHz. `PreviewChain.swift` picks the model, IR and fallback
  assets, and `PreviewPlayer.swift` makes sure only one preview plays at a time.
- **Demos** (`App/UI/`): `SelectDemoView`, `LoadToneDemoView`, `FullApiDemoView` and
  `ToneDetailView`.

The engine sources are compiled at `-O3` even in Debug, because NAM at `-O0` can't keep
up with a realtime audio callback.
