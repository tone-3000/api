// TONE3000 API resource types, mirroring web/src/types.ts.
//
// Enumerations are kept as their wire strings (e.g. "amp-cab", "nam") so the
// same constants work for query parameters and for parsing responses.
#pragma once

#include <JuceHeader.h>
#include <functional>
#include <optional>

namespace t3k
{
    // ---- Wire-string enumerations ---------------------------------------------

    namespace gear
    {
        inline constexpr const char* amp = "amp";
        inline constexpr const char* ampCab = "amp-cab";
        inline constexpr const char* pedal = "pedal";
        inline constexpr const char* outboard = "outboard";
        inline constexpr const char* cab = "cab";
        inline constexpr const char* space = "space";
        inline constexpr const char* experimental = "experimental";
        inline const juce::StringArray all { amp, ampCab, pedal, outboard, cab, space, experimental };
    }

    namespace format
    {
        inline constexpr const char* nam = "nam";
        inline constexpr const char* ir = "ir";
        inline constexpr const char* aidaX = "aida-x";
        inline constexpr const char* aaSnapshot = "aa-snapshot";
        inline constexpr const char* proteus = "proteus";
        /// The formats the preview engine can load; the only ones the demos filter by.
        inline const juce::StringArray previewable { nam, ir };
    }

    namespace tonesSort
    {
        inline constexpr const char* bestMatch = "best-match";
        inline constexpr const char* newest = "newest";
        inline constexpr const char* oldest = "oldest";
        inline constexpr const char* trending = "trending";
        inline constexpr const char* downloadsAllTime = "downloads-all-time";
    }

    namespace usersSort
    {
        inline constexpr const char* tones = "tones";
        inline constexpr const char* downloads = "downloads";
        inline constexpr const char* favorites = "favorites";
        inline constexpr const char* models = "models";
    }

    namespace taxonomySort
    {
        inline constexpr const char* tones = "tones";
        inline constexpr const char* name = "name";
    }

    /// Human-readable labels for the wire strings (web/src/labels.ts).
    juce::String gearLabel (const juce::String& gear);
    juce::String formatLabel (const juce::String& format);
    juce::String licenseLabel (const juce::String& license);
    juce::String formatCount (int n, const juce::String& singular, const juce::String& plural = {});

    // ---- Resources --------------------------------------------------------------

    struct EmbeddedUser
    {
        int id = 0;
        juce::String username, displayName, avatarUrl, url;
        bool isVerified = false;

        /// display_name when set, otherwise username.
        juce::String creatorName() const { return displayName.isNotEmpty() ? displayName : username; }
        static EmbeddedUser fromVar (const juce::var& v);
    };

    struct User : EmbeddedUser
    {
        juce::String bio, createdAt;
        juce::StringArray links;
        static User fromVar (const juce::var& v);
    };

    struct PublicUser : EmbeddedUser
    {
        juce::String bio;
        juce::StringArray links;
        int downloadsCount = 0, favoritesCount = 0, modelsCount = 0, tonesCount = 0;
        static PublicUser fromVar (const juce::var& v);
    };

    /// A make or a tag: `tones_count` and `url` are only present on the public listings.
    struct Taxonomy
    {
        int id = 0;
        juce::String name, url;
        int tonesCount = 0;
        static Taxonomy fromVar (const juce::var& v);
    };

    struct Tone
    {
        int id = 0;
        EmbeddedUser user;
        juce::String title, description, gear, format, license, url, publishedAt;
        juce::StringArray images, links;
        bool isPublic = true;
        juce::Array<Taxonomy> makes, tags;
        int modelsCount = 0, irsCount = 0, downloadsCount = 0, favoritesCount = 0;
        bool isFavorite = false;

        /// "5 models" for NAM tones, "3 IRs" for IR tones.
        juce::String modelCountLabel() const;
        static Tone fromVar (const juce::var& v);
    };

    struct Model
    {
        int id = 0, toneId = 0;
        juce::String name, modelUrl, size;
        /// "1", "2" or "custom" (null for non-NAM formats).
        juce::String architectureVersion;

        /// File extension from the storage URL (".nam", ".wav").
        juce::String extension() const;
        static Model fromVar (const juce::var& v);
    };

    struct ToneDownload
    {
        juce::String url, filename, expiresAt;
        static ToneDownload fromVar (const juce::var& v);
    };

    template <typename T>
    struct Page
    {
        juce::Array<T> data;
        int page = 1, pageSize = 0, total = 0, totalPages = 0;

        static Page fromVar (const juce::var& v)
        {
            Page p;
            p.page = (int) v.getProperty ("page", 1);
            p.pageSize = (int) v.getProperty ("page_size", 0);
            p.total = (int) v.getProperty ("total", 0);
            p.totalPages = (int) v.getProperty ("total_pages", 0);
            if (auto* arr = v.getProperty ("data", juce::var()).getArray())
                for (auto& item : *arr)
                    p.data.add (T::fromVar (item));
            return p;
        }
    };

    /// A tone with the models the demos list for it.
    struct ToneWithModels
    {
        Tone tone;
        juce::Array<Model> models;
    };

    // ---- Request parameters -----------------------------------------------------

    struct PageParams
    {
        int page = 1;
        int pageSize = 0;      // 0 = server default
    };

    struct SearchTonesParams : PageParams
    {
        juce::String query, sort, format;
        juce::StringArray gears, tags, makes, creators;
        std::optional<int> architecture;
        bool calibrated = false, verified = false;
    };

    struct ListLibraryParams : PageParams
    {
        juce::String gear, query;
    };

    struct ListUsersParams : PageParams
    {
        juce::String sort, query;
    };

    struct ListTaxonomyParams : PageParams
    {
        juce::String sort, query;
    };

    /// Catalog filters for the Select / Load Tone authorize URL.
    struct CatalogOptions
    {
        juce::String gears;         // underscore-separated gear list, e.g. "amp_amp-cab"
        juce::String format;        // "nam" / "ir"
        bool calibrated = false;
        bool preview = false;       // show preview players in the catalog
        juce::String locale;        // e.g. "en", "es"
        /// NAM architecture the catalog should offer. Always A2 in the demos:
        /// omitting it falls back to A1 + Custom, which excludes A2.
        int architecture = 2;

        juce::StringPairArray toAuthorizeParams() const;
    };

    // ---- Errors -----------------------------------------------------------------

    struct Error
    {
        int status = 0;             // HTTP status, or 0 for transport / local errors
        juce::String message;

        bool isNotFound() const { return status == 404; }
        bool isForbidden() const { return status == 403; }
        bool isRateLimited() const { return status == 429; }

        /// Message suitable for showing to a user.
        juce::String userMessage (const juce::String& context = {}) const;
    };

    /// Result of an async API call: either a value or an Error.
    template <typename T>
    struct Result
    {
        std::optional<T> value;
        Error error;
        bool ok() const { return value.has_value(); }
        const T& operator*() const { return *value; }
        const T* operator->() const { return &*value; }

        static Result success (T v) { Result r; r.value = std::move (v); return r; }
        static Result failure (Error e) { Result r; r.error = std::move (e); return r; }
    };

    struct Nothing {};

    template <typename T>
    using Callback = std::function<void (Result<T>)>;
}
