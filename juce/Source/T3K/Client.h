// Authenticated TONE3000 API client, mirroring web/src/tone3000-client.ts:
//
//   - Tokens persist in OS-protected storage (SecureStore).
//   - Proactive refresh 60 s before expiry; concurrent callers share one refresh.
//   - Retry once on 401 (expiry races between the check and the request).
//   - A 400/401 from the token endpoint (`invalid_grant`) ends the session and
//     clears tokens; other refresh failures are transient and keep them.
//   - Deprecated-parameter warnings (X-Tone3000-Deprecations) are logged.
//
// Every call runs its HTTP on a worker thread and invokes the callback on the
// message thread. Wrap callbacks with AsyncScope::wrap in components.
#pragma once

#include "Http.h"
#include "SecureStore.h"
#include "Types.h"

#include <mutex>

namespace t3k
{
    struct Tokens
    {
        juce::String accessToken, refreshToken;
        juce::int64 expiresAtMs = 0;

        bool isValid() const { return accessToken.isNotEmpty() && refreshToken.isNotEmpty(); }
        juce::String toJson() const;
        static Tokens fromJson (const juce::String& json);
        /// Parse a POST /oauth/token response body (`expires_in` -> absolute time).
        static Tokens fromTokenResponse (const juce::var& body);
    };

    /// Broadcasts a change message (on the message thread) whenever the
    /// connection state changes: connected, disconnected, or session expired.
    class Client : public juce::ChangeBroadcaster
    {
    public:
        Client();
        ~Client() override;

        juce::String apiOrigin() const { return origin; }
        juce::String publishableKey() const { return key; }

        bool isConnected() const;
        void setTokens (Tokens tokens);
        void clearTokens();

        // ---- OAuth ----------------------------------------------------------------

        /// Exchange an authorization code for tokens and store them.
        void redeemCode (const juce::String& code, const juce::String& codeVerifier,
                         const juce::String& redirectUri, Callback<Nothing> done);

        // ---- User -----------------------------------------------------------------

        void getUser (Callback<User> done);
        void listUsers (ListUsersParams params, Callback<Page<PublicUser>> done);

        // ---- Tones ----------------------------------------------------------------

        /// GET /tones/{id} with the demo architecture (A2).
        void getTone (int id, Callback<Tone> done);
        /// The tone plus its A2 models, in one call.
        void getToneWithModels (int id, Callback<ToneWithModels> done);
        void searchTones (SearchTonesParams params, Callback<Page<Tone>> done);
        void listCreatedTones (ListLibraryParams params, Callback<Page<Tone>> done);
        void listFavoritedTones (ListLibraryParams params, Callback<Page<Tone>> done);
        void listDownloadedTones (ListLibraryParams params, Callback<Page<Tone>> done);
        void listTrendingTones (const juce::String& gear, Callback<juce::Array<Tone>> done);
        void listLatestTones (Callback<juce::Array<Tone>> done);
        void favoriteTone (int id, Callback<Nothing> done);
        void unfavoriteTone (int id, Callback<Nothing> done);
        /// Approved partners only (403 otherwise). The URL expires after an hour.
        void getToneDownload (int id, Callback<ToneDownload> done);

        // ---- Models ---------------------------------------------------------------

        /// All A2 models of a tone (page_size 100).
        void listModels (int toneId, Callback<juce::Array<Model>> done);
        /// Download a model file (Bearer auth) into the local cache; returns the file.
        void downloadModelFile (const Model& model, Callback<juce::File> done);

        // ---- Taxonomy -------------------------------------------------------------

        void listMakes (ListTaxonomyParams params, Callback<Page<Taxonomy>> done);
        void listTags (ListTaxonomyParams params, Callback<Page<Taxonomy>> done);

        /// Where downloaded model files are cached.
        static juce::File modelCacheDirectory();

        /// Fetch any URL (no auth) on a worker thread, e.g. tone images.
        void fetch (const juce::URL& url, std::function<void (HttpResponse)> done)
        {
            HttpRequest request;
            request.url = url;
            transport.send (std::move (request), std::move (done));
        }

    private:
        /// Authenticated request on the calling (worker) thread. On a usable HTTP
        /// response `error.status == 0 && error.message.isEmpty()`.
        struct Response
        {
            HttpResponse http;
            Error error;
            bool failed() const { return error.status != 0 || error.message.isNotEmpty(); }
        };
        Response authenticatedRequest (const juce::String& method, const juce::String& path, const juce::String& body = {});

        /// Current access token, refreshing if needed. Empty when not authenticated.
        juce::String accessTokenForRequest (bool forceRefresh);
        /// Refresh on the calling thread; returns false if the session has ended.
        bool refreshTokensNow();

        /// Run an authenticated request on the pool, parse the JSON body with
        /// `parse`, and deliver a Result on the message thread.
        template <typename T>
        void request (const juce::String& method, const juce::String& path, const juce::String& body,
                      std::function<T (const juce::var&)> parse, Callback<T> done);

        Tokens currentTokens() const;
        void storeTokens (const Tokens& t, bool notify);

        juce::String origin, key;
        Http transport;
        SecureStore store;
        mutable juce::CriticalSection tokenLock;
        Tokens tokens;
        std::mutex refreshMutex;    // single-flight refresh across worker threads
        juce::ThreadPool pool { 4 };
    };

    /// The shared client every demo uses.
    Client& client();
}
