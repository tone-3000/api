// Loopback redirect receiver for the system-browser OAuth flow (RFC 8252 §7.3).
//
// Binds an ephemeral port on 127.0.0.1 and serves exactly one page: the
// redirect landing. The authorization server redirects the browser to
//   http://127.0.0.1:<port>/callback?code=…&state=…
// and the server hands the query string to `onCallback` on the message thread.
//
// Loopback redirect URIs are always accepted by TONE3000, so nothing needs
// to be registered on your publishable key for this flow.
#pragma once

#include <JuceHeader.h>
#include <functional>

namespace t3k
{
    class LoopbackServer : private juce::Thread
    {
    public:
        LoopbackServer();
        ~LoopbackServer() override;

        /// Start listening. Returns false if no port could be bound.
        bool start();
        void stop();
        bool isRunning() const { return port != 0; }

        /// e.g. "http://127.0.0.1:52713/callback". Empty until started.
        juce::String redirectUri() const;

        /// Called on the message thread with the raw query string of the redirect.
        std::function<void (juce::String query)> onCallback;

        /// Text shown in the browser after the redirect.
        juce::String landingTitle { "You're all set" };
        juce::String landingMessage { "You can close this tab and return to the app." };

    private:
        void run() override;
        void handleConnection (juce::StreamingSocket& connection);
        juce::String landingPageHtml() const;

        juce::StreamingSocket listener;
        std::atomic<int> port { 0 };
    };
}
