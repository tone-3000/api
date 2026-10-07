// The TONE3000 OAuth flows a desktop app runs:
//
//   login        -> sign in only (Full API demo)
//   selectTone   -> prompt=select_tone: the user browses the catalog on
//                   tone3000.com and the callback carries the picked tone_id
//   loadTone     -> prompt=load_tone&tone_id=…: TONE3000 confirms a specific
//                   tone and proposes a replacement if it is gone
//
// and the two ways to show them:
//
//   BrowserAuthFlow  -> system browser + loopback redirect (works everywhere,
//                       nothing to register, user leaves the app for a moment)
//   WebViewAuthFlow  -> the authorize page inside a window of the app
//                       (optional; compiled when T3K_EMBEDDED_WEBVIEW=1)
//
// Both end the same way: verify `state`, exchange the code with PKCE, store
// tokens, and report the FlowResult on the message thread.
#pragma once

#include "Async.h"
#include "Client.h"
#include "LoopbackServer.h"
#include "OAuth.h"

namespace t3k
{
    struct FlowRequest
    {
        enum class Kind { login, selectTone, loadTone };
        Kind kind = Kind::login;
        juce::String toneId;            // loadTone
        CatalogOptions catalog;         // selectTone / loadTone filters
        /// Show TONE3000's menu bar on the authorize pages. Good for a full
        /// browser tab; the embedded WebView turns it off to save space.
        bool menubar = true;
    };

    struct FlowResult
    {
        enum class Status { connected, canceled, failed };
        Status status = Status::failed;
        juce::String toneId;            // selectTone / loadTone: the tone to load (may be empty)
        juce::String error;             // failed: OAuth error code or message

        bool connected() const { return status == Status::connected; }
        bool canceled() const { return status == Status::canceled; }
    };

    enum class FlowMode { systemBrowser, embeddedWebView };

    class AuthFlow
    {
    public:
        using Completion = std::function<void (FlowResult)>;

        virtual ~AuthFlow() = default;

        /// Begin the flow. `done` is called once, on the message thread.
        virtual void start (const FlowRequest& request, Completion done) = 0;
        /// Abort a running flow; `done` receives Status::canceled.
        virtual void cancel() = 0;
        bool isActive() const { return active; }

    protected:
        juce::URL buildAuthorizeUrl (const FlowRequest& request, const juce::String& redirectUri);
        /// Verify state and exchange the code; finishes the flow either way.
        void completeWithCallback (const juce::String& query, const juce::String& redirectUri);
        void finish (FlowResult result);

        oauth::Pkce pkce;
        Completion completion;
        bool active = false;
        AsyncScope scope;
    };

    /// System browser + loopback redirect.
    class BrowserAuthFlow : public AuthFlow
    {
    public:
        BrowserAuthFlow();
        ~BrowserAuthFlow() override;

        void start (const FlowRequest& request, Completion done) override;
        void cancel() override;

    private:
        LoopbackServer server;
    };

    /// Create the flow for a mode. Returns a BrowserAuthFlow for
    /// FlowMode::embeddedWebView when the WebView is unavailable.
    std::unique_ptr<AuthFlow> makeAuthFlow (FlowMode mode, juce::Component* windowToCentreOn = nullptr);

    /// Whether the embedded WebView route can run on this machine. On Windows
    /// this checks for the WebView2 Runtime; `reason` explains a `false`.
    bool isWebViewFlowAvailable (juce::String& reason);

#if T3K_EMBEDDED_WEBVIEW
    /// The authorize page in a window owned by the app.
    class WebViewAuthFlow : public AuthFlow
    {
    public:
        explicit WebViewAuthFlow (juce::Component* windowToCentreOn);
        ~WebViewAuthFlow() override;

        void start (const FlowRequest& request, Completion done) override;
        void cancel() override;

        /// Options shared by every WebBrowserComponent this app creates.
        static juce::WebBrowserComponent::Options webViewOptions();

    private:
        class Window;
        void closeWindow();

        juce::Component::SafePointer<juce::Component> centreOn;
        std::unique_ptr<Window> window;
        juce::String redirectUri;
    };
#endif
}
