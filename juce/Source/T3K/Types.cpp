#include "Types.h"

#include <map>

namespace t3k
{
    namespace
    {
        juce::String str (const juce::var& v, const char* key)
        {
            auto p = v.getProperty (key, juce::var());
            return p.isVoid() ? juce::String() : p.toString();
        }

        int num (const juce::var& v, const char* key) { return (int) v.getProperty (key, 0); }

        juce::StringArray strings (const juce::var& v, const char* key)
        {
            juce::StringArray out;
            if (auto* arr = v.getProperty (key, juce::var()).getArray())
                for (auto& s : *arr)
                    out.add (s.toString());
            return out;
        }

        void fillEmbedded (EmbeddedUser& u, const juce::var& v)
        {
            u.id = num (v, "id");
            u.username = str (v, "username");
            u.displayName = str (v, "display_name");
            u.avatarUrl = str (v, "avatar_url");
            u.url = str (v, "url");
            u.isVerified = (bool) v.getProperty ("is_verified", false);
        }
    }

    juce::String gearLabel (const juce::String& gear)
    {
        static const std::map<juce::String, juce::String> labels {
            { "amp", "Amp Head" }, { "amp-cab", "Amp + Cab" }, { "full-rig", "Amp + Cab" },
            { "pedal", "Pedal" }, { "outboard", "Outboard" }, { "cab", "Cabinet" },
            { "space", "Spaces" }, { "experimental", "Experimental" }, { "ir", "Impulse Response" },
        };
        auto it = labels.find (gear);
        return it != labels.end() ? it->second : gear;
    }

    juce::String formatLabel (const juce::String& format)
    {
        static const std::map<juce::String, juce::String> labels {
            { "nam", "NAM" }, { "ir", "IR" }, { "aida-x", "AIDA-X" },
            { "aa-snapshot", "Snapshot" }, { "proteus", "Proteus" },
        };
        auto it = labels.find (format);
        return it != labels.end() ? it->second : format;
    }

    juce::String licenseLabel (const juce::String& license)
    {
        if (license == "t3k") return "TONE3000";
        if (license == "cco") return "CC0";
        return license.toUpperCase();
    }

    juce::String formatCount (int n, const juce::String& singular, const juce::String& plural)
    {
        return juce::String (n) + " " + (n == 1 ? singular : (plural.isNotEmpty() ? plural : singular + "s"));
    }

    EmbeddedUser EmbeddedUser::fromVar (const juce::var& v)
    {
        EmbeddedUser u;
        fillEmbedded (u, v);
        return u;
    }

    User User::fromVar (const juce::var& v)
    {
        User u;
        fillEmbedded (u, v);
        u.bio = str (v, "bio");
        u.createdAt = str (v, "created_at");
        u.links = strings (v, "links");
        return u;
    }

    PublicUser PublicUser::fromVar (const juce::var& v)
    {
        PublicUser u;
        fillEmbedded (u, v);
        u.bio = str (v, "bio");
        u.links = strings (v, "links");
        u.downloadsCount = num (v, "downloads_count");
        u.favoritesCount = num (v, "favorites_count");
        u.modelsCount = num (v, "models_count");
        u.tonesCount = num (v, "tones_count");
        return u;
    }

    Taxonomy Taxonomy::fromVar (const juce::var& v)
    {
        Taxonomy t;
        t.id = num (v, "id");
        t.name = str (v, "name");
        t.url = str (v, "url");
        t.tonesCount = num (v, "tones_count");
        return t;
    }

    juce::String Tone::modelCountLabel() const
    {
        return format == format::ir ? formatCount (irsCount, "IR") : formatCount (modelsCount, "model");
    }

    Tone Tone::fromVar (const juce::var& v)
    {
        Tone t;
        t.id = num (v, "id");
        t.user = EmbeddedUser::fromVar (v.getProperty ("user", juce::var()));
        t.title = str (v, "title");
        t.description = str (v, "description");
        t.gear = str (v, "gear");
        t.format = str (v, "format");
        t.license = str (v, "license");
        t.url = str (v, "url");
        t.publishedAt = str (v, "published_at");
        t.images = strings (v, "images");
        t.links = strings (v, "links");
        t.isPublic = (bool) v.getProperty ("is_public", true);
        if (auto* arr = v.getProperty ("makes", juce::var()).getArray())
            for (auto& m : *arr) t.makes.add (Taxonomy::fromVar (m));
        if (auto* arr = v.getProperty ("tags", juce::var()).getArray())
            for (auto& m : *arr) t.tags.add (Taxonomy::fromVar (m));
        t.modelsCount = num (v, "models_count");
        t.irsCount = num (v, "irs_count");
        t.downloadsCount = num (v, "downloads_count");
        t.favoritesCount = num (v, "favorites_count");
        t.isFavorite = (bool) v.getProperty ("is_favorite", false);
        return t;
    }

    juce::String Model::extension() const
    {
        auto path = juce::URL (modelUrl).getSubPath();
        auto file = path.fromLastOccurrenceOf ("/", false, false);
        return file.contains (".") ? "." + file.fromLastOccurrenceOf (".", false, false) : juce::String();
    }

    Model Model::fromVar (const juce::var& v)
    {
        Model m;
        m.id = num (v, "id");
        m.toneId = num (v, "tone_id");
        m.name = str (v, "name");
        m.modelUrl = str (v, "model_url");
        m.size = str (v, "size");
        m.architectureVersion = str (v, "architecture_version");
        return m;
    }

    ToneDownload ToneDownload::fromVar (const juce::var& v)
    {
        ToneDownload d;
        d.url = str (v, "url");
        d.filename = str (v, "filename");
        d.expiresAt = str (v, "expires_at");
        return d;
    }

    juce::StringPairArray CatalogOptions::toAuthorizeParams() const
    {
        juce::StringPairArray p;
        if (gears.isNotEmpty()) p.set ("gears", gears);
        if (format.isNotEmpty()) p.set ("format", format);
        if (calibrated) p.set ("calibrated", "true");
        if (preview) p.set ("preview", "true");
        if (locale.isNotEmpty()) p.set ("locale", locale);
        if (architecture > 0) p.set ("architecture", juce::String (architecture));
        return p;
    }

    juce::String Error::userMessage (const juce::String& context) const
    {
        if (status == 429) return "Too many requests. Wait a moment and try again.";
        if (status == 401) return "Your TONE3000 session has ended. Connect again.";
        if (status == 0) return message.isNotEmpty() ? message : "Could not reach TONE3000.";
        auto what = context.isNotEmpty() ? context : juce::String ("Request");
        return what + " failed (HTTP " + juce::String (status) + ")" + (message.isNotEmpty() ? ": " + message : "");
    }
}
