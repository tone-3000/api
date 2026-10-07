#include "Client.h"

#include "T3KConfig.h"

namespace t3k
{
    namespace
    {
        constexpr juce::int64 kRefreshLeadMs = 60 * 1000;
        constexpr const char* kTokenEndpoint = "/api/v1/oauth/token";
        constexpr int kModelsPageSize = 100;

        Client* sharedClient = nullptr;

        juce::URL withPage (juce::URL url, const PageParams& p)
        {
            if (p.page > 0) url = url.withParameter ("page", juce::String (p.page));
            if (p.pageSize > 0) url = url.withParameter ("page_size", juce::String (p.pageSize));
            return url;
        }

        /// Path + encoded query of a URL built with withParameter (the origin is re-added by the client).
        juce::String pathOf (const juce::URL& url)
        {
            auto full = url.toString (true);
            auto afterScheme = full.fromFirstOccurrenceOf ("://", false, false);
            return afterScheme.contains ("/") ? afterScheme.fromFirstOccurrenceOf ("/", true, false) : "/";
        }

        juce::URL relative (const juce::String& path) { return juce::URL ("https://x" + path); }

        juce::String formEncode (std::initializer_list<std::pair<juce::String, juce::String>> fields)
        {
            juce::StringArray parts;
            for (auto& [k, v] : fields)
                parts.add (juce::URL::addEscapeChars (k, true) + "=" + juce::URL::addEscapeChars (v, true));
            return parts.joinIntoString ("&");
        }

        juce::String sanitizeFilename (const juce::String& name)
        {
            auto s = name.toLowerCase().retainCharacters ("abcdefghijklmnopqrstuvwxyz0123456789-_ ").replaceCharacter (' ', '-');
            while (s.contains ("--")) s = s.replace ("--", "-");
            s = s.trimCharactersAtStart ("-").trimCharactersAtEnd ("-");
            return s.isEmpty() ? "model" : s;
        }

        juce::Array<Tone> parseToneFeed (const juce::var& v)
        {
            juce::Array<Tone> out;
            if (auto* arr = v.getProperty ("data", juce::var()).getArray())
                for (auto& t : *arr) out.add (Tone::fromVar (t));
            return out;
        }

        juce::String errorMessage (const HttpResponse& res)
        {
            auto body = res.json();
            auto description = body.getProperty ("error_description", juce::var());
            if (! description.isVoid()) return description.toString();
            auto error = body.getProperty ("error", juce::var());
            return error.isVoid() ? juce::String() : error.toString();
        }
    }

    // ---- Tokens -------------------------------------------------------------------

    juce::String Tokens::toJson() const
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("access_token", accessToken);
        obj->setProperty ("refresh_token", refreshToken);
        obj->setProperty ("expires_at", expiresAtMs);
        return juce::JSON::toString (juce::var (obj), true);
    }

    Tokens Tokens::fromJson (const juce::String& json)
    {
        auto v = juce::JSON::parse (json);
        Tokens t;
        t.accessToken = v.getProperty ("access_token", "").toString();
        t.refreshToken = v.getProperty ("refresh_token", "").toString();
        t.expiresAtMs = (juce::int64) v.getProperty ("expires_at", 0);
        return t;
    }

    Tokens Tokens::fromTokenResponse (const juce::var& body)
    {
        Tokens t;
        t.accessToken = body.getProperty ("access_token", "").toString();
        t.refreshToken = body.getProperty ("refresh_token", "").toString();
        auto expiresIn = (double) body.getProperty ("expires_in", 3600);
        t.expiresAtMs = juce::Time::currentTimeMillis() + (juce::int64) (expiresIn * 1000.0);
        return t;
    }

    // ---- Lifecycle ----------------------------------------------------------------

    Client::Client()
        : origin (juce::String (config::apiOrigin).trimCharactersAtEnd ("/")),
          key (config::publishableKey),
          store ("com.example.tone3000.juce", "oauth-tokens")
    {
        tokens = Tokens::fromJson (store.load());
        if (sharedClient == nullptr)
            sharedClient = this;
    }

    Client::~Client()
    {
        pool.removeAllJobs (true, 5000);
        if (sharedClient == this)
            sharedClient = nullptr;
    }

    Client& client()
    {
        jassert (sharedClient != nullptr);   // create one Client in the application's initialise()
        return *sharedClient;
    }

    juce::File Client::modelCacheDirectory()
    {
        return juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("TONE3000 Example").getChildFile ("models");
    }

    Tokens Client::currentTokens() const
    {
        const juce::ScopedLock sl (tokenLock);
        return tokens;
    }

    bool Client::isConnected() const
    {
        return currentTokens().isValid();
    }

    void Client::storeTokens (const Tokens& t, bool notify)
    {
        {
            const juce::ScopedLock sl (tokenLock);
            tokens = t;
        }
        if (t.isValid()) store.save (t.toJson());
        else store.remove();
        if (notify)
            sendChangeMessage();     // ChangeBroadcaster delivers on the message thread
    }

    void Client::setTokens (Tokens t) { storeTokens (t, true); }
    void Client::clearTokens() { storeTokens ({}, true); }

    // ---- Auth plumbing (worker thread) --------------------------------------------

    bool Client::refreshTokensNow()
    {
        std::lock_guard<std::mutex> single (refreshMutex);

        auto current = currentTokens();
        if (! current.isValid())
            return false;
        // Another worker may have refreshed while we waited for the lock.
        if (juce::Time::currentTimeMillis() < current.expiresAtMs - kRefreshLeadMs)
            return true;

        HttpRequest req;
        req.url = juce::URL (origin + kTokenEndpoint);
        req.method = "POST";
        req.headers.set ("Content-Type", "application/x-www-form-urlencoded");
        req.body = formEncode ({ { "grant_type", "refresh_token" },
                                 { "refresh_token", current.refreshToken },
                                 { "client_id", key } });

        auto res = Http::sendSync (req);
        if (res.ok())
        {
            storeTokens (Tokens::fromTokenResponse (res.json()), false);
            return true;
        }

        if (res.status == 400 || res.status == 401)
        {
            // invalid_grant: the refresh token itself is dead. Session over.
            storeTokens ({}, true);
            return false;
        }

        // Transient (network, 5xx): keep the tokens; this one request will fail.
        return true;
    }

    juce::String Client::accessTokenForRequest (bool forceRefresh)
    {
        auto current = currentTokens();
        if (! current.isValid())
            return {};

        if (forceRefresh || juce::Time::currentTimeMillis() > current.expiresAtMs - kRefreshLeadMs)
        {
            if (forceRefresh)
            {
                // Force the refresh path even if the clock says the token is fine.
                const juce::ScopedLock sl (tokenLock);
                tokens.expiresAtMs = 0;
            }
            if (! refreshTokensNow())
                return {};
            current = currentTokens();
        }
        return current.accessToken;
    }

    Client::Response Client::authenticatedRequest (const juce::String& method, const juce::String& path, const juce::String& body)
    {
        Response out;
        auto token = accessTokenForRequest (false);
        if (token.isEmpty())
        {
            out.error = { 401, "Not connected to TONE3000." };
            return out;
        }

        auto send = [&] (const juce::String& bearer)
        {
            HttpRequest req;
            req.url = juce::URL (origin + path);
            req.method = method;
            req.headers.set ("Authorization", "Bearer " + bearer);
            req.headers.set ("Accept", "application/json");
            if (body.isNotEmpty())
            {
                req.headers.set ("Content-Type", "application/json");
                req.body = body;
            }
            return Http::sendSync (req);
        };

        out.http = send (token);

        // Retry once on 401: the token may have expired between the check and the request.
        if (out.http.status == 401)
        {
            auto fresh = accessTokenForRequest (true);
            if (fresh.isNotEmpty())
                out.http = send (fresh);
        }

        if (out.http.status == 0)
            out.error = { 0, out.http.error };

        auto deprecations = out.http.header ("X-Tone3000-Deprecations");
        if (deprecations.isNotEmpty())
            juce::Logger::writeToLog ("[TONE3000] Deprecated API usage on " + path + ": " + deprecations);

        return out;
    }

    template <typename T>
    void Client::request (const juce::String& method, const juce::String& path, const juce::String& body,
                          std::function<T (const juce::var&)> parse, Callback<T> done)
    {
        pool.addJob ([this, method, path, body, parseFn = std::move (parse), cb = std::move (done)]
        {
            auto response = authenticatedRequest (method, path, body);

            Result<T> result;
            if (response.failed())
                result = Result<T>::failure (response.error);
            else if (! response.http.ok())
                result = Result<T>::failure ({ response.http.status, errorMessage (response.http) });
            else
                result = Result<T>::success (parseFn (response.http.json()));

            juce::MessageManager::callAsync ([cb, r = std::move (result)]() mutable { cb (std::move (r)); });
        });
    }

    // ---- OAuth --------------------------------------------------------------------

    void Client::redeemCode (const juce::String& code, const juce::String& codeVerifier,
                             const juce::String& redirectUri, Callback<Nothing> done)
    {
        HttpRequest req;
        req.url = juce::URL (origin + kTokenEndpoint);
        req.method = "POST";
        req.headers.set ("Content-Type", "application/x-www-form-urlencoded");
        req.body = formEncode ({ { "grant_type", "authorization_code" },
                                 { "code", code },
                                 { "code_verifier", codeVerifier },
                                 { "redirect_uri", redirectUri },
                                 { "client_id", key } });

        transport.send (req, [this, done] (HttpResponse res)
        {
            if (! res.ok())
            {
                auto message = res.status == 0 ? res.error : errorMessage (res);
                done (Result<Nothing>::failure ({ res.status, message.isNotEmpty() ? message : "token_exchange_failed" }));
                return;
            }
            setTokens (Tokens::fromTokenResponse (res.json()));
            done (Result<Nothing>::success ({}));
        });
    }

    // ---- User ---------------------------------------------------------------------

    void Client::getUser (Callback<User> done)
    {
        request<User> ("GET", "/api/v1/user", {}, User::fromVar, std::move (done));
    }

    void Client::listUsers (ListUsersParams p, Callback<Page<PublicUser>> done)
    {
        auto url = withPage (relative ("/api/v1/users"), p);
        if (p.sort.isNotEmpty()) url = url.withParameter ("sort", p.sort);
        if (p.query.isNotEmpty()) url = url.withParameter ("query", p.query);
        request<Page<PublicUser>> ("GET", pathOf (url), {}, Page<PublicUser>::fromVar, std::move (done));
    }

    // ---- Tones --------------------------------------------------------------------

    void Client::getTone (int id, Callback<Tone> done)
    {
        auto url = relative ("/api/v1/tones/" + juce::String (id))
                       .withParameter ("architecture", juce::String (config::demoArchitecture));
        request<Tone> ("GET", pathOf (url), {}, Tone::fromVar, std::move (done));
    }

    void Client::getToneWithModels (int id, Callback<ToneWithModels> done)
    {
        getTone (id, [this, id, done] (Result<Tone> tone)
        {
            if (! tone.ok())
            {
                done (Result<ToneWithModels>::failure (tone.error));
                return;
            }
            listModels (id, [t = *tone, done] (Result<juce::Array<Model>> models)
            {
                if (! models.ok())
                    done (Result<ToneWithModels>::failure (models.error));
                else
                    done (Result<ToneWithModels>::success ({ t, *models }));
            });
        });
    }

    void Client::searchTones (SearchTonesParams p, Callback<Page<Tone>> done)
    {
        auto url = withPage (relative ("/api/v1/tones/search"), p);
        if (p.query.isNotEmpty()) url = url.withParameter ("query", p.query);
        if (p.sort.isNotEmpty()) url = url.withParameter ("sort", p.sort);
        if (! p.gears.isEmpty()) url = url.withParameter ("gears", p.gears.joinIntoString ("_"));
        if (p.format.isNotEmpty()) url = url.withParameter ("format", p.format);
        if (! p.tags.isEmpty()) url = url.withParameter ("tags", p.tags.joinIntoString ("_"));
        if (! p.makes.isEmpty()) url = url.withParameter ("makes", p.makes.joinIntoString ("_"));
        if (! p.creators.isEmpty()) url = url.withParameter ("creators", p.creators.joinIntoString (","));
        if (p.architecture) url = url.withParameter ("architecture", juce::String (*p.architecture));
        if (p.calibrated) url = url.withParameter ("calibrated", "true");
        if (p.verified) url = url.withParameter ("verified", "true");
        request<Page<Tone>> ("GET", pathOf (url), {}, Page<Tone>::fromVar, std::move (done));
    }

    namespace
    {
        juce::String libraryPath (const char* endpoint, const ListLibraryParams& p)
        {
            auto url = withPage (relative (juce::String ("/api/v1/tones/") + endpoint), p);
            if (p.gear.isNotEmpty()) url = url.withParameter ("gear", p.gear);
            if (p.query.isNotEmpty()) url = url.withParameter ("query", p.query);
            return pathOf (url);
        }
    }

    void Client::listCreatedTones (ListLibraryParams p, Callback<Page<Tone>> done)
    {
        request<Page<Tone>> ("GET", libraryPath ("created", p), {}, Page<Tone>::fromVar, std::move (done));
    }

    void Client::listFavoritedTones (ListLibraryParams p, Callback<Page<Tone>> done)
    {
        request<Page<Tone>> ("GET", libraryPath ("favorited", p), {}, Page<Tone>::fromVar, std::move (done));
    }

    void Client::listDownloadedTones (ListLibraryParams p, Callback<Page<Tone>> done)
    {
        request<Page<Tone>> ("GET", libraryPath ("downloaded", p), {}, Page<Tone>::fromVar, std::move (done));
    }

    void Client::listTrendingTones (const juce::String& gear, Callback<juce::Array<Tone>> done)
    {
        auto url = relative ("/api/v1/tones/trending");
        if (gear.isNotEmpty()) url = url.withParameter ("gear", gear);
        request<juce::Array<Tone>> ("GET", pathOf (url), {}, parseToneFeed, std::move (done));
    }

    void Client::listLatestTones (Callback<juce::Array<Tone>> done)
    {
        request<juce::Array<Tone>> ("GET", "/api/v1/tones/latest", {}, parseToneFeed, std::move (done));
    }

    void Client::favoriteTone (int id, Callback<Nothing> done)
    {
        request<Nothing> ("PUT", "/api/v1/tones/" + juce::String (id) + "/favorite", {},
                          [] (const juce::var&) { return Nothing {}; }, std::move (done));
    }

    void Client::unfavoriteTone (int id, Callback<Nothing> done)
    {
        request<Nothing> ("DELETE", "/api/v1/tones/" + juce::String (id) + "/favorite", {},
                          [] (const juce::var&) { return Nothing {}; }, std::move (done));
    }

    void Client::getToneDownload (int id, Callback<ToneDownload> done)
    {
        request<ToneDownload> ("GET", "/api/v1/tones/" + juce::String (id) + "/download", {},
                               ToneDownload::fromVar, std::move (done));
    }

    // ---- Models -------------------------------------------------------------------

    void Client::listModels (int toneId, Callback<juce::Array<Model>> done)
    {
        auto url = relative ("/api/v1/models")
                       .withParameter ("tone_id", juce::String (toneId))
                       .withParameter ("architecture", juce::String (config::demoArchitecture))
                       .withParameter ("page_size", juce::String (kModelsPageSize));
        request<juce::Array<Model>> ("GET", pathOf (url), {},
                                     [] (const juce::var& v) { return Page<Model>::fromVar (v).data; }, std::move (done));
    }

    void Client::downloadModelFile (const Model& model, Callback<juce::File> done)
    {
        auto target = modelCacheDirectory().getChildFile (juce::String (model.id) + "-" + sanitizeFilename (model.name) + model.extension());
        if (target.existsAsFile() && target.getSize() > 0)
        {
            juce::MessageManager::callAsync ([done, target] { done (Result<juce::File>::success (target)); });
            return;
        }

        // model_url is absolute; strip the origin so the client re-adds it with the Bearer header.
        auto path = pathOf (juce::URL (model.modelUrl));

        pool.addJob ([this, path, target, done]
        {
            auto response = authenticatedRequest ("GET", path);
            Result<juce::File> result;
            if (response.failed())
                result = Result<juce::File>::failure (response.error);
            else if (! response.http.ok())
                result = Result<juce::File>::failure ({ response.http.status, "Model download" });
            else if (target.getParentDirectory().createDirectory() && target.replaceWithData (response.http.body.getData(), response.http.body.getSize()))
                result = Result<juce::File>::success (target);
            else
                result = Result<juce::File>::failure ({ 0, "Could not write " + target.getFullPathName() });

            juce::MessageManager::callAsync ([done, r = std::move (result)]() mutable { done (std::move (r)); });
        });
    }

    // ---- Taxonomy -----------------------------------------------------------------

    namespace
    {
        juce::String taxonomyPath (const char* endpoint, const ListTaxonomyParams& p)
        {
            auto url = withPage (relative (endpoint), p);
            if (p.query.isNotEmpty()) url = url.withParameter ("query", p.query);
            if (p.sort.isNotEmpty()) url = url.withParameter ("sort", p.sort);
            return pathOf (url);
        }
    }

    void Client::listMakes (ListTaxonomyParams p, Callback<Page<Taxonomy>> done)
    {
        request<Page<Taxonomy>> ("GET", taxonomyPath ("/api/v1/makes", p), {}, Page<Taxonomy>::fromVar, std::move (done));
    }

    void Client::listTags (ListTaxonomyParams p, Callback<Page<Taxonomy>> done)
    {
        request<Page<Taxonomy>> ("GET", taxonomyPath ("/api/v1/tags", p), {}, Page<Taxonomy>::fromVar, std::move (done));
    }
}
