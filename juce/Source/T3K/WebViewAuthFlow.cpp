// Embedded WebView Select flow. Compiled only when T3K_EMBEDDED_WEBVIEW=1.
//
// Platform notes
//   macOS   WKWebView, nothing to install. Cookies live in the default
//           WKWebsiteDataStore, so the user stays signed in between flows.
//   Windows Microsoft Edge WebView2 (Chromium). The SDK is linked statically at
//           build time (CMake downloads it). The *runtime* must exist on the
//           user's machine: Windows 11 ships it, Windows 10 usually has it via
//           Edge/Office, and installers should bootstrap it otherwise — see
//           README. isWebViewFlowAvailable() detects a missing runtime so the
//           app can fall back to the system-browser flow.
//
// The redirect URI is a loopback URL that nothing listens on: the WebView
// subclass intercepts the navigation in pageAboutToLoad() before any request
// is made and completes the flow from the query string.
#include "AuthFlow.h"

#if T3K_EMBEDDED_WEBVIEW

namespace t3k
{
    namespace
    {
        constexpr const char* kWebViewRedirectUri = "http://127.0.0.1/callback";
        constexpr int kWindowWidth = 520;
        constexpr int kWindowHeight = 760;

       #if JUCE_WINDOWS
        // WebView2 needs a writable user data folder; next to the .exe (Program
        // Files) is not writable, so use the user's app data.
        juce::File webViewDataFolder()
        {
            return juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                       .getChildFile ("TONE3000 Example")
                       .getChildFile ("WebView2");
        }
       #endif

        /// WebBrowserComponent that reports navigations to its owner.
        class AuthWebView : public juce::WebBrowserComponent
        {
        public:
            explicit AuthWebView (const Options& options) : juce::WebBrowserComponent (options) {}

            std::function<bool (const juce::String&)> onNavigation;   // return false to block
            std::function<void (const juce::String&)> onNetworkError;

            bool pageAboutToLoad (const juce::String& url) override
            {
                return onNavigation == nullptr || onNavigation (url);
            }

            // target=_blank links (terms, help, …) belong in the user's real browser.
            void newWindowAttemptingToLoad (const juce::String& url) override
            {
                juce::URL (url).launchInDefaultBrowser();
            }

            bool pageLoadHadNetworkError (const juce::String& errorInfo) override
            {
                if (onNetworkError != nullptr)
                    onNetworkError (errorInfo);
                return false;      // we show our own message; don't load JUCE's error page
            }
        };
    }

    class WebViewAuthFlow::Window : public juce::DialogWindow
    {
    public:
        Window (WebViewAuthFlow& owner, const juce::WebBrowserComponent::Options& options)
            : juce::DialogWindow ("TONE3000", juce::Colours::black, true, false), flow (&owner)
        {
            auto view = std::make_unique<AuthWebView> (options);
            view->setSize (kWindowWidth, kWindowHeight);
            view->onNavigation = [this] (const juce::String& url) { return handleNavigation (url); };
            view->onNetworkError = [this] (const juce::String& info)
            {
                if (auto* f = std::exchange (flow, nullptr))
                {
                    f->closeWindow();
                    f->finish ({ FlowResult::Status::failed, {}, "Could not reach TONE3000 (" + info + ")." });
                }
            };
            webView = view.get();
            setContentOwned (view.release(), true);
            setUsingNativeTitleBar (true);
            setResizable (true, false);
            setResizeLimits (360, 480, 4096, 4096);
            // The constructor was asked not to add the window to the desktop so the
            // options above apply first; a window never becomes visible until this runs.
            addToDesktop();
        }

        void goToURL (const juce::URL& url)
        {
           #if JUCE_MAC
            // JUCE's WKWebView backend percent-encodes whatever string it is given
            // (NSURLQueryAllowedCharacterSet), so an already-encoded URL arrives
            // double-encoded: redirect_uri would reach the server as "http%3A%2F%2F...".
            // Hand it the decoded form and let it do the one encoding. The OAuth
            // parameters here never contain '&', '=' or '+', so decoding is safe.
            webView->goToURL (juce::URL::removeEscapeChars (url.toString (true)));
           #else
            webView->goToURL (url.toString (true));     // WebView2 navigates the string as-is
           #endif
        }

        void closeButtonPressed() override
        {
            if (auto* f = std::exchange (flow, nullptr))
                f->cancel();
        }

        /// The flow is going away; stop reporting to it.
        void detach() { flow = nullptr; }

    private:
        bool handleNavigation (const juce::String& url)
        {
            if (flow == nullptr || ! url.startsWith (flow->redirectUri))
                return true;

            // Finishing may destroy the flow (and schedule this window's deletion),
            // so hand everything over first and touch nothing afterwards.
            auto* f = std::exchange (flow, nullptr);
            auto uri = f->redirectUri;
            f->closeWindow();
            f->completeWithCallback (url.fromFirstOccurrenceOf ("?", false, false), uri);
            return false;
        }

        WebViewAuthFlow* flow;
        AuthWebView* webView = nullptr;
    };

    juce::WebBrowserComponent::Options WebViewAuthFlow::webViewOptions()
    {
        auto options = juce::WebBrowserComponent::Options {}.withKeepPageLoadedWhenBrowserIsHidden();
       #if JUCE_WINDOWS
        options = options.withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
                      .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2 {}
                                                   .withUserDataFolder (webViewDataFolder())
                                                   .withStatusBarDisabled()
                                                   .withBuiltInErrorPageDisabled()
                                                   .withBackgroundColour (juce::Colours::black));
       #endif
        return options;
    }

    bool isWebViewFlowAvailable (juce::String& reason)
    {
        if (! juce::WebBrowserComponent::areOptionsSupported (WebViewAuthFlow::webViewOptions()))
        {
           #if JUCE_WINDOWS
            reason = "The Microsoft Edge WebView2 Runtime is not installed.";
           #else
            reason = "The system WebView is unavailable.";
           #endif
            return false;
        }
        return true;
    }

    WebViewAuthFlow::WebViewAuthFlow (juce::Component* windowToCentreOn) : centreOn (windowToCentreOn) {}

    WebViewAuthFlow::~WebViewAuthFlow()
    {
        window.reset();
    }

    void WebViewAuthFlow::start (const FlowRequest& request, Completion done)
    {
        jassert (! active);
        completion = std::move (done);
        active = true;
        redirectUri = kWebViewRedirectUri;

        auto embedded = request;
        embedded.menubar = false;
        auto url = buildAuthorizeUrl (embedded, redirectUri);

        window = std::make_unique<Window> (*this, webViewOptions());
        if (centreOn != nullptr)
            window->centreAroundComponent (centreOn, kWindowWidth, kWindowHeight);
        else
            window->centreWithSize (kWindowWidth, kWindowHeight);
        window->setVisible (true);
        window->toFront (true);
        window->goToURL (url);
    }

    void WebViewAuthFlow::cancel()
    {
        closeWindow();
        finish ({ FlowResult::Status::canceled, {}, {} });
    }

    void WebViewAuthFlow::closeWindow()
    {
        // Often called from inside WebView callbacks: hide now, delete on the
        // next message-loop tick, never from within the window's own handler.
        if (window == nullptr)
            return;
        window->detach();
        window->setVisible (false);
        juce::MessageManager::callAsync ([w = std::shared_ptr<Window> (window.release())] { juce::ignoreUnused (w); });
    }
}

#endif
