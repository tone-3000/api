# TONE3000 API — Integration Examples

A blueprint for integrating your product with [TONE3000](https://www.tone3000.com), the
tone library for Neural Amp Modeler (NAM) captures and impulse responses (IRs).

The same three demo apps are implemented in six frameworks, so you can start from
whichever matches your stack and compare the platform-specific pieces side by side.
Full API documentation lives at [tone3000.com/api](https://www.tone3000.com/api).

A live build of the web example is at [t3k-api-demo.vercel.app](https://t3k-api-demo.vercel.app/).

| Example | Stack | OAuth runs in | Preview player |
|---|---|---|---|
| [`web/`](./web) | React + Vite | Same-tab redirect or popup | `neural-amp-modeler-wasm` (AudioWorklet) |
| [`electron/`](./electron) | Electron + React | Embedded `WebContentsView` | `neural-amp-modeler-wasm` (AudioWorklet) |
| [`ios/`](./ios) | SwiftUI | In-app `WKWebView` | Shared C++ engine via AVAudioEngine |
| [`android/`](./android) | Jetpack Compose | In-app `WebView` | Shared C++ engine via Oboe |
| [`react-native/`](./react-native) | Expo (React Native) | `react-native-webview` | Shared C++ engine via a local Expo module |
| [`juce/`](./juce) | JUCE (macOS, Windows) | System browser + loopback, or optional in-app WebView | Shared C++ engine via `AudioDeviceManager` |

[`native/`](./native) holds the C++ preview engine and audio assets shared by the iOS,
Android, React Native and JUCE examples.

---

## The demo apps

Every example contains the same three fictional products. Each shows a different way to
integrate, and every one of them lets users audition models with the preview player
before downloading.

### Acme Inc — Select flow
*Best for plugins, DAWs and apps where TONE3000 drives tone discovery.*

A guitar amp simulator. "Browse TONE3000" opens the TONE3000 catalog; the user signs in,
picks a tone and comes back with a `tone_id`. The app fetches the tone and its models,
then previews them. Catalog options (`gears`, `format`, `architecture`, `calibrated`,
`preview`, `locale`) scope the catalog to what your product can load.

```
GET /api/v1/oauth/authorize?prompt=select_tone&gears=amp-cab&format=nam&architecture=2&preview=true
  → redirect_uri?code=…&state=…&tone_id=…
  → POST /api/v1/oauth/token
  → GET /api/v1/tones/{id} + GET /api/v1/models?tone_id={id}
```

### Beacon Inc — Load Tone flow
*Best for apps that store TONE3000 tone IDs, such as presets or rigs.*

A rig preset manager whose presets reference tone IDs. Users add presets by picking a
tone in the Select flow, and the app saves them locally. When connected, it loads them
straight from the API. When the user isn't connected, or a tone turns out to be private
or deleted, `prompt=load_tone` lets TONE3000 check access and offer a replacement. The
returned `tone_id` may therefore differ from the one requested; if it does, the preset
is repointed at the replacement.

```
GET /api/v1/oauth/authorize?prompt=load_tone&tone_id=42&gears=amp-cab&architecture=2
  → redirect_uri?code=…&state=…&tone_id=…
```

### Chord Inc — Full API
*Best for products with their own tone browsing and library UI.*

A custom tone UI built on the REST API: the user's library (created, favorited,
downloaded), trending and latest feeds, filtered search, makes, tags and creators, tone
detail with favorites and zip downloads, and a profile. A persistent "Browse" button
opens the Select flow alongside it. The account is connected with the standard flow (no
`prompt`).

The web example also includes a **LAN-relay** demo (dev server only) for headless
hardware that has no browser. See [`web/README.md`](./web/README.md).

---

## Integration checklist

These apply to every platform.

1. **Get a publishable key.** Sign in to [tone3000.com](https://www.tone3000.com), open
   **Settings → API Keys** and create a key. The `t3k_pub_…` publishable key is your OAuth `client_id` and is safe to
   ship in client apps. Never ship the `t3k_cs_…` secret key in a client.
2. **Register your redirect URIs.** Once any redirect URI is registered on the key,
   TONE3000 accepts only registered ones. The examples default to:

   | Example | Default redirect URI |
   |---|---|
   | Web | `http://localhost:3001` |
   | Electron | `http://localhost:3001/callback` |
   | iOS, Android, React Native | `tone3000-example://oauth/callback` |
   | JUCE | `http://127.0.0.1:<port>/callback` (loopback; never needs registering) |

   The native and desktop examples intercept the redirect inside their embedded
   browser, so nothing needs to serve that URL. Loopback URIs (`localhost`, `127.0.0.1`,
   `[::1]`, any port) are always accepted, which is what lets the JUCE example open the
   flow in the system browser without registering anything. Each example's README shows
   how to change it.
3. **Use PKCE (S256) and check `state`.** All examples generate a fresh verifier, challenge
   and `state` for every flow, and reject callbacks whose `state` doesn't match.
4. **Handle every callback outcome.** Besides `code` (and `tone_id` for Select/Load Tone),
   the callback may carry `error`, or `canceled=true` when the user closes the flow. A
   canceled callback can still include a `code`: the user signed in but didn't pick a
   tone. The examples keep those tokens.
5. **Manage tokens.** Store them in platform-secure storage. Refresh about 60 seconds
   before expiry, run only one refresh at a time, and retry a request once on 401. If a
   refresh fails with 400/401, the session is over: clear the tokens and reconnect.
   Keeping the TONE3000 web session in a persistent cookie store means reconnecting
   usually skips sign-in.
6. **Download models with your Bearer token.** `model_url` requires the
   `Authorization` header.
7. **Pass `architecture` explicitly.** Omitting it returns the legacy A1 + Custom set,
   which excludes A2. The examples request A2 (`architecture=2`); pass whatever your
   engine loads.
8. **Watch for deprecations.** Deprecated params (`platform`, the `full-rig` and `ir`
   gear values) still work, but responses flag them in an `X-Tone3000-Deprecations`
   header. Every client logs it.
9. **Respect rate limits.** The default is 100 requests per minute, and search is limited
   more heavily. For browsing, prefer the Select flow. For production limits, email
   [support@tone3000.com](mailto:support@tone3000.com).

### The preview player

All examples play the same audio chain: a bundled DI guitar clip goes through the
selected NAM model, then an optional cab IR.

- **NAM amp heads** play through a bundled fallback cab IR, because they're captured
  without one.
- **Other NAM captures** (amp + cab, pedals, …) play as-is.
- **IRs** play a bundled fallback amp into the IR.
- **Other formats** show "Preview unavailable".

Only one player plays at a time, and models download on first play.

---

## Commercial terms

Evaluating and developing against the API is free. Shipping a product falls into one of
two tiers (see Commercial Terms in the [API docs](https://www.tone3000.com/api)):

- **Free:** non-commercial products, such as open source projects, DIY hardware,
  research and community tools. These may use only the OAuth prompt flows and the
  bounded list endpoints: `created`, `favorited`, `downloaded`, `trending` and `latest`.
  The Select and Load Tone demos stay within these limits.
- **Commercial:** paid products, or products that accompany a paid product. These
  require an agreement and may use the full API, as the Full API demo does. Commercial
  integrations are reviewed by TONE3000 before launch.

Also follow the Design Requirements in the [API docs](https://www.tone3000.com/api),
which cover attribution, tone detail views and logo usage.

---

## Repository layout

```
web/            React + Vite web example (deployed to Vercel with Root Directory = web)
electron/       Electron desktop example
ios/            SwiftUI example (XcodeGen project)
android/        Jetpack Compose example
react-native/   Expo example + local native preview module
juce/           JUCE desktop example (macOS + Windows), browser or WebView OAuth
native/         Shared C++ preview engine, NAM Core submodule, preview audio assets
```

The iOS, Android, React Native and JUCE examples build NeuralAmpModelerCore from a git
submodule. After cloning, run:

```bash
git submodule update --init --recursive
```

## Support

Questions? Email [support@tone3000.com](mailto:support@tone3000.com) or open an issue in this repo.
