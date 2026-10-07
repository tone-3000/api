// OAuth 2.0 authorization-code + PKCE (S256) helpers for the TONE3000 API.
// Mirrors the PKCE / authorize-URL / callback code in web/src/tone3000-client.ts.
#pragma once

#include <JuceHeader.h>

namespace t3k::oauth
{
    struct Pkce
    {
        juce::String codeVerifier;      // 43..128 unreserved characters
        juce::String codeChallenge;     // base64url(SHA-256(codeVerifier))
        juce::String state;             // CSRF token, echoed back on the callback

        static Pkce generate();
    };

    /// Build the /api/v1/oauth/authorize URL.
    ///
    /// `extra` holds the TONE3000-specific parameters: `prompt=select_tone`,
    /// `tone_id`, catalog filters (`gears`, `format`, `calibrated`, `preview`,
    /// `locale`) and `menubar=true`.
    juce::URL authorizeUrl (const juce::String& apiOrigin,
                            const juce::String& publishableKey,
                            const juce::String& redirectUri,
                            const Pkce& pkce,
                            const juce::StringPairArray& extra);

    /// Parsed redirect: `redirect_uri?code=…&state=…[&tone_id=…]`,
    /// `…?error=…&state=…` or `…?canceled=true&state=…`.
    struct Callback
    {
        juce::String code, state, error, toneId;
        bool canceled = false;

        /// Parse the query string (with or without the leading '?') of a redirect URL.
        static Callback parse (const juce::String& queryOrUrl);
    };
}
