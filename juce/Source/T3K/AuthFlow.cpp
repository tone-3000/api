#include "AuthFlow.h"

namespace t3k
{
    // ---- Shared ---------------------------------------------------------------------

    juce::URL AuthFlow::buildAuthorizeUrl (const FlowRequest& request, const juce::String& redirectUri)
    {
        pkce = oauth::Pkce::generate();

        auto extra = request.catalog.toAuthorizeParams();
        if (request.menubar)
            extra.set ("menubar", "true");
        switch (request.kind)
        {
            case FlowRequest::Kind::selectTone:
                extra.set ("prompt", "select_tone");
                break;
            case FlowRequest::Kind::loadTone:
                extra.set ("prompt", "load_tone");
                extra.set ("tone_id", request.toneId);
                break;
            case FlowRequest::Kind::login:
                break;
        }

        auto& c = client();
        return oauth::authorizeUrl (c.apiOrigin(), c.publishableKey(), redirectUri, pkce, extra);
    }

    void AuthFlow::completeWithCallback (const juce::String& query, const juce::String& redirectUri)
    {
        if (! active)
            return;

        auto cb = oauth::Callback::parse (query);

        if (cb.state != pkce.state)
        {
            finish ({ FlowResult::Status::failed, {}, "state_mismatch" });
            return;
        }
        if (cb.canceled && cb.code.isEmpty())
        {
            finish ({ FlowResult::Status::canceled, {}, {} });
            return;
        }
        if (cb.error.isNotEmpty())
        {
            finish ({ FlowResult::Status::failed, {}, cb.error });
            return;
        }
        if (cb.code.isEmpty())
        {
            finish ({ FlowResult::Status::failed, {}, "missing_code" });
            return;
        }

        // Exchange the code. The PKCE verifier is single-use: it goes with this request.
        auto verifier = pkce.codeVerifier;
        pkce = {};
        client().redeemCode (cb.code, verifier, redirectUri, scope.wrap ([this, toneId = cb.toneId] (Result<Nothing> r)
        {
            if (! active)
                return;
            if (r.ok())
                finish ({ FlowResult::Status::connected, toneId, {} });
            else
                finish ({ FlowResult::Status::failed, {}, r.error.message });
        }));
    }

    void AuthFlow::finish (FlowResult result)
    {
        if (! active)
            return;
        active = false;
        pkce = {};
        if (auto done = std::exchange (completion, nullptr))
            done (std::move (result));
    }

    // ---- System browser -----------------------------------------------------------------

    BrowserAuthFlow::BrowserAuthFlow() = default;

    BrowserAuthFlow::~BrowserAuthFlow()
    {
        server.onCallback = nullptr;
        server.stop();
    }

    void BrowserAuthFlow::start (const FlowRequest& request, Completion done)
    {
        jassert (! active);
        completion = std::move (done);
        active = true;

        if (! server.start())
        {
            finish ({ FlowResult::Status::failed, {}, "Could not open a local port for the sign-in redirect." });
            return;
        }

        auto redirectUri = server.redirectUri();
        server.onCallback = [this, redirectUri] (juce::String query)
        {
            server.stop();
            completeWithCallback (query, redirectUri);
        };

        auto url = buildAuthorizeUrl (request, redirectUri);
        if (! url.launchInDefaultBrowser())
        {
            server.stop();
            finish ({ FlowResult::Status::failed, {}, "Could not open your browser." });
        }
    }

    void BrowserAuthFlow::cancel()
    {
        server.stop();
        finish ({ FlowResult::Status::canceled, {}, {} });
    }

    // ---- Factory --------------------------------------------------------------------------

    std::unique_ptr<AuthFlow> makeAuthFlow ([[maybe_unused]] FlowMode mode, [[maybe_unused]] juce::Component* windowToCentreOn)
    {
#if T3K_EMBEDDED_WEBVIEW
        juce::String reason;
        if (mode == FlowMode::embeddedWebView && isWebViewFlowAvailable (reason))
            return std::make_unique<WebViewAuthFlow> (windowToCentreOn);
#endif
        return std::make_unique<BrowserAuthFlow>();
    }

#if ! T3K_EMBEDDED_WEBVIEW
    bool isWebViewFlowAvailable (juce::String& reason)
    {
        reason = "This build was configured with T3K_EMBEDDED_WEBVIEW=OFF.";
        return false;
    }
#endif
}
