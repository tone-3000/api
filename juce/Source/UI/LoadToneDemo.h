// Beacon — the Load Tone flow. A product with locally stored presets that each
// reference a TONE3000 tone id. Presets are added by picking a tone (Select
// flow) and loaded API-first; when the API can't serve the tone (not signed
// in, removed, private) the Load Tone flow asks TONE3000 to confirm access or
// offer a replacement, and the preset is repointed at it.
//
// All flows here open in the system browser.
#pragma once

#include "T3K/AuthFlow.h"
#include "ToneDetail.h"
#include "Widgets.h"

namespace ui
{
    struct Preset
    {
        juce::String id;        // local id
        int toneId = 0;
        juce::String title, creator;

        static Preset fromTone (const t3k::Tone& tone, juce::String existingId = {});
        juce::var toVar() const;
        static Preset fromVar (const juce::var& v);
    };

    /// Presets persisted in the app's settings file.
    class PresetStore
    {
    public:
        PresetStore();
        std::vector<Preset> load();
        void save (const std::vector<Preset>& presets);

    private:
        std::unique_ptr<juce::PropertiesFile> file;
    };

    class LoadToneDemoScreen : public Screen
    {
    public:
        explicit LoadToneDemoScreen (Navigator& nav);
        ~LoadToneDemoScreen() override;

    private:
        class PresetCard;

        void addPreset();
        void loadPreset (const Preset& preset);
        void runLoadToneFlow (const Preset& preset);
        void showTone (const t3k::ToneWithModels& tone, const Preset& preset, int replacedToneId);
        void removePreset (const Preset& preset);
        void persist();
        void rebuildCards();
        void setBusy (bool busy, const juce::String& message = {});
        void layoutContent (juce::Rectangle<int> area) override;
        int layout (int width, bool apply);

        PresetStore store;
        std::vector<Preset> presets;
        juce::String activePresetId;

        juce::Viewport viewport;
        Canvas content;

        juce::Label loadedTitle, presetsTitle, placeholder, presetsPlaceholder, status;
        juce::TextButton syncAgain { "Sync Again" }, add { "+ Add preset" }, cancel { "Cancel" };
        Banner replacement;
        ToneDetailView detail;
        std::vector<std::unique_ptr<PresetCard>> cards;
        std::unique_ptr<t3k::AuthFlow> flow;
    };
}
