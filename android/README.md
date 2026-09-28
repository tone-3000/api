# Android example (Jetpack Compose)

The three demo apps in Compose (Android 8.0+ / API 26), with the shared C++ preview
engine built through CMake and played with [Oboe](https://github.com/google/oboe).

## Run it

```bash
git submodule update --init --recursive     # NeuralAmpModelerCore, from the repo root
```

Open `android/` in Android Studio, or build from the command line:

```bash
cd android
./gradlew :app:installDebug
```

Gradle 8.12 needs **JDK 17 or 21**. Newer Android Studio releases bundle JDK 25, which
this Gradle version rejects. Set **Settings → Build Tools → Gradle → Gradle JDK**
accordingly, or export `JAVA_HOME` for command-line builds. The NDK and CMake versions
are picked up from the SDK.

Add your settings to `android/local.properties` (gitignored), or pass them as `-P`
Gradle properties:

```properties
T3K_PUBLISHABLE_KEY=t3k_pub_your_key_here
# T3K_REDIRECT_SCHEME=tone3000-example      # redirect URI is <scheme>://oauth/callback
# T3K_API_BASE=https://www.tone3000.com
```

## How it works

- **OAuth** (`t3k/AuthManager.kt`, `t3k/AuthBrowser.kt`): flows run in
  `AuthBrowserActivity`, which hosts one retained `WebView`. Cookies persist, so later flows skip sign-in.
  Navigation to the redirect URI is intercepted in `shouldOverrideUrlLoading`, then the
  code is exchanged with PKCE.
- **Tokens** (`t3k/TokenStore.kt`): stored in EncryptedSharedPreferences backed by an
  Android Keystore key. `t3k/T3KClient.kt` refreshes proactively, and on 401.
- **Preview** (`audio/`, `src/main/cpp/`): a JNI bridge feeds the C++ engine from an
  Oboe stream at 48 kHz. `PreviewChain.kt` picks the model, IR and fallback assets.
  Assets are packaged from `native/preview-assets`.
- **Demos** (`ui/`): `DemoScreens.kt` (landing, Select, Load Tone, tone detail) and
  `FullApiDemoScreen.kt`.

Native libraries are built for 16 KB page sizes, which Google Play requires for new
apps targeting Android 15+.
