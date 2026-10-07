# Desktop example (JUCE, macOS + Windows)

The three demo apps as a native JUCE desktop application. Everything TONE3000-specific
lives in `Source/T3K/` (about 1,000 lines); the demos in `Source/UI/` show how to use it.

What is different from the other examples:

- **Two ways to show the Select flow.** The Acme demo has a button for each:
  the system browser (loopback redirect) and an embedded WebView inside the app window.
- **The WebView is optional.** It is a CMake option; turn it off and the app has no
  WebView dependency at all. The Load Tone and Full API demos only use the system browser.
- **Previews use the shared native engine** (`native/preview-engine`) through a
  `juce::AudioDeviceManager`.

## Run it

Requirements: CMake 3.22+, a C++20 compiler (Xcode 14+ / Visual Studio 2022), git.
JUCE 9.0.3 is fetched by CMake on the first configure.

```bash
cd juce
cp .env.example .env            # then set T3K_PUBLISHABLE_KEY
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

The app is at `build/TONE3000Example_artefacts/Release/TONE3000 Example.app` (macOS) or
`build\TONE3000Example_artefacts\Release\TONE3000 Example.exe` (Windows). `cmake -B build -G Xcode`
or `-G "Visual Studio 17 2022"` gives you an IDE project instead.

| Setting | Default | |
|---|---|---|
| `T3K_PUBLISHABLE_KEY` (`.env`) | — | Your `t3k_pub_…` key |
| `T3K_API_DOMAIN` (`.env`) | `https://www.tone3000.com` | API origin override |
| `-DT3K_EMBEDDED_WEBVIEW` | `ON` | Build the in-app WebView Select example |

`.env` values can also be passed as `-D` arguments or environment variables; CMake
re-configures automatically when `.env` changes. A `-D` value is cached and wins over
`.env` until you drop it (`cmake -B build -U T3K_PUBLISHABLE_KEY`).

> On Windows, build **Release** or **RelWithDebInfo** for usable previews. The engine is
> forced to `/O2` even in Debug, but a Debug JUCE build still adds overhead on the audio thread.

## Redirect URIs: nothing to register

Both routes use loopback redirect URIs, which TONE3000 always accepts without registering
them on your key (RFC 8252 §7.3):

| Route | Redirect URI | What receives it |
|---|---|---|
| System browser | `http://127.0.0.1:<ephemeral port>/callback` | `LoopbackServer`, a tiny HTTP server the app starts for the duration of the flow |
| Embedded WebView | `http://127.0.0.1/callback` | `pageAboutToLoad()` in the WebView subclass — the navigation is cancelled before any request is made |

If your key has registered redirect URIs for other platforms, the loopback ones still work.

## The two Select routes

### 1. System browser (`BrowserAuthFlow`)

The safest choice, and the only one the Load Tone and Full API demos use.

1. `LoopbackServer` binds an ephemeral port on `127.0.0.1`.
2. The authorize URL (PKCE S256, `state`, `prompt=select_tone`, `preview=true`, catalog filters)
   opens in the user's default browser via `juce::URL::launchInDefaultBrowser()`.
3. TONE3000 redirects to the loopback URL; the server answers with a small "you can close this
   tab" page and hands the query string back to the app on the message thread.
4. `state` is checked, the code is exchanged (`POST /api/v1/oauth/token`), and tokens are stored.

Trade-offs: the user leaves the app for a moment and has to come back. In exchange nothing is
installed, the user's existing browser session is reused, and the flow is the one OAuth
recommends for native apps.

### 2. Embedded WebView (`WebViewAuthFlow`, optional)

The catalog opens in a window of the app, so the user never leaves. The WebView is a
`juce::WebBrowserComponent` subclass:

- `pageAboutToLoad()` intercepts the redirect URI and completes the flow.
- `newWindowAttemptingToLoad()` sends `target=_blank` links (terms, help) to the system browser.
- macOS gotcha: JUCE's WKWebView backend percent-encodes the string passed to `goToURL()`, so an
  already-encoded authorize URL arrives double-encoded (`redirect_uri=http%253A%252F%252F…` →
  "redirect_uri must be a valid URL"). Pass the decoded form on macOS; WebView2 navigates as-is.
- `pageLoadHadNetworkError()` reports connectivity errors instead of showing a browser error page.
- `menubar` is turned off in the authorize URL to save space.

The WebView keeps its own cookies (WKWebView's default data store on macOS, the WebView2 user data
folder on Windows), so the user stays signed in to tone3000.com between flows. "Disconnect" in the
app clears the app's tokens, not that session.

#### Windows: WebView2

JUCE renders the WebView with Microsoft Edge WebView2 (Chromium). Two pieces are involved:

**Build time — the WebView2 SDK.** JUCE links `WebView2LoaderStatic.lib` from the
`Microsoft.Web.WebView2` NuGet package (`NEEDS_WEBVIEW2 TRUE` +
`JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1`). `CMakeLists.txt` downloads the package into
`build/webview2/` on configure, so no NuGet CLI is needed. If you already have it, pass
`-DJUCE_WEBVIEW2_PACKAGE_LOCATION=<folder containing Microsoft.Web.WebView2.*>`.

**Run time — the WebView2 Runtime.** The Evergreen Runtime must be present on the user's PC.
Windows 11 ships it; most Windows 10 machines have it through Edge or Office, but not all.

- The app checks with `WebBrowserComponent::areOptionsSupported()` (`isWebViewFlowAvailable()`)
  and disables the WebView button with an explanation when the runtime is missing. Always keep
  the browser route as the fallback.
- Your installer should bootstrap it. Microsoft's Evergreen bootstrapper
  (`MicrosoftEdgeWebview2Setup.exe`, ~2 MB, from
  [the WebView2 download page](https://developer.microsoft.com/microsoft-edge/webview2/)) can be
  run silently: `MicrosoftEdgeWebview2Setup.exe /silent /install`. Check first by reading
  `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}\pv`
  (per-machine) so machines that already have it are not touched.
- The user data folder is `%APPDATA%\TONE3000 Example\WebView2` (`withUserDataFolder`). WebView2
  cannot write next to the executable under Program Files, so always set one.

#### macOS: WKWebView

Nothing to install; `juce_gui_extra` links WebKit. The app loads `https://` pages only, so no App
Transport Security exceptions are needed.

#### Opting out

`cmake -B build -DT3K_EMBEDDED_WEBVIEW=OFF` removes `WebViewAuthFlow.cpp` from the build, sets
`JUCE_WEB_BROWSER=0`, and skips the WebView2 SDK download. The Select demo then shows the WebView
button disabled with the reason.

## How it works

| File | What it shows |
|---|---|
| `Source/T3K/OAuth.cpp` | PKCE (S256) generation, authorize URL, callback parsing |
| `Source/T3K/LoopbackServer.cpp` | The loopback redirect receiver for the browser route |
| `Source/T3K/AuthFlow.cpp` | Shared flow completion (state check, code exchange); `BrowserAuthFlow` |
| `Source/T3K/WebViewAuthFlow.cpp` | The embedded WebView route, with WebView2 options for Windows |
| `Source/T3K/Client.cpp` | Authenticated client: refresh 60 s before expiry, single-flight refresh, retry once on 401, deprecation header logging, model file cache |
| `Source/T3K/SecureStore.cpp` | Token storage in the macOS Keychain / Windows DPAPI |
| `Source/Audio/PreviewPlayer.cpp` | The native preview engine behind `juce::AudioDeviceManager`; chain rules (amp head → + fallback cab, IR → fallback amp + IR) |
| `Source/UI/SelectDemo.cpp` | Acme: catalog scope, locale, both Select routes |
| `Source/UI/LoadToneDemo.cpp` | Beacon: local presets, API-first load, Load Tone fallback with replacement handling |
| `Source/UI/FullApiDemo.cpp` | Chord: library, discover, search with type-ahead tag/make/creator pickers, makes & tags, creators, profile |
| `Source/UI/ToneDetail.cpp` | Tone page with favorite, zip (approved partners), per-model preview + download |
| `Source/UI/ImageLoader.cpp` | Artwork loading: own thread pool, cancellable requests, cover-cropped to 512 px (covers) / 64 px (avatars) before caching, memory budget |
| `Source/UI/Widgets.cpp` | Shared look (light theme matching the web example), tone cards/grid, badges, model rows, type-ahead picker |

Threading: every API call runs its HTTP on a worker thread and delivers its result on the message
thread. Components wrap callbacks with `AsyncScope::wrap()` so a result arriving after the screen
is gone is dropped instead of touching a dead object.

Images: a browser gives the web example parallel connections and an image cache for free. Here
`ImageLoader` does that job on a pool separate from the API client (so a page of covers never
delays a search), skips downloads nobody is waiting for any more (the card was scrolled away and
deleted), and downsamples each image on the worker before caching it: the originals are ~1000 px
JPEGs, about 4 MB each once decoded, shown at 100–280 logical px.

All demos request NAM architecture 2 only: `architecture=2` is sent on every NAM request that
accepts it (tone lookup, model listing, search) and on the Select / Load Tone authorize URLs, so
the hosted catalog also offers A2 captures. Only NAM / IR filters are exposed, the formats the
preview engine can load.

## Licensing

JUCE is dual-licensed (AGPLv3 or a commercial JUCE licence). This example does not change
JUCE's defaults (e.g. the splash screen); your own product must comply with the JUCE licence you use.
