// Tone detail: hero image, metadata, actions, model list with previews.
// `ToneDetailView` is embedded inline by the Select / Load Tone demos (like the
// web example); `ToneDetailScreen` wraps it in a page for the Full API demo.
#pragma once

#include "Widgets.h"

namespace ui
{
    struct ToneDetailOptions
    {
        bool allowFavorite = false;     // PUT/DELETE /tones/{id}/favorite
        bool allowDownloads = false;    // model files + zip (approved partners)
        juce::String note;              // optional line under the title (e.g. "Replacement for …")
    };

    class ToneDetailView : public juce::Component
    {
    public:
        ToneDetailView();
        void set (t3k::ToneWithModels tone, ToneDetailOptions options);
        void clear();
        bool hasTone() const { return data.has_value(); }
        const t3k::Tone* tone() const { return data ? &data->tone : nullptr; }

        std::function<void (const juce::String&)> onError;
        std::function<void (const t3k::Tone&)> onToneChanged;   // after favorite toggles

        int preferredHeight (int width);
        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        void render();
        void toggleFavorite();
        void downloadZip();
        int layout (int width, bool apply);

        std::optional<t3k::ToneWithModels> data;
        ToneDetailOptions options;
        juce::StringArray badges;        // make / tag badges drawn in paint

        RemoteImage hero;
        CreatorBadge creator;
        juce::Label title, note, description, meta;
        juce::TextButton favorite { "Favorite" }, zip { "Download all (zip)" }, open { "View on TONE3000" };
        ModelList models;
        int badgeRowsHeight = 0;
        t3k::AsyncScope scope;
    };

    class ToneDetailScreen : public Screen
    {
    public:
        struct Brand { juce::String name, tagline; };

        /// Fetch the tone and its models by id.
        ToneDetailScreen (Navigator& nav, Brand brand, int toneId, ToneDetailOptions options);
        /// Show an already-fetched tone.
        ToneDetailScreen (Navigator& nav, Brand brand, t3k::ToneWithModels tone, ToneDetailOptions options);

        std::function<void (const t3k::Tone&)> onToneChanged;

    private:
        void layoutContent (juce::Rectangle<int> area) override;

        juce::Viewport viewport;
        ToneDetailView view;
        juce::Label loading;
    };
}
