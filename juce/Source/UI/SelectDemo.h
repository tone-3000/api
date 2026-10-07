// "Acme": the Select flow. The user picks a tone on TONE3000 (system browser or
// embedded WebView) and the app receives the tone id in the redirect.
#pragma once

#include "T3K/AuthFlow.h"
#include "ToneDetail.h"
#include "Widgets.h"

namespace ui
{
    class SelectDemoScreen : public Screen
    {
    public:
        explicit SelectDemoScreen (Navigator& nav);

    private:
        void start (t3k::FlowMode mode);
        void handleResult (t3k::FlowResult result);
        void loadTone (int toneId);
        void setBusy (bool busy);
        void layoutContent (juce::Rectangle<int> area) override;
        int layout (int width, bool apply);

        juce::Viewport viewport;
        Canvas content;

        juce::Label sectionTitle;
        juce::TextButton browseAgain { "Browse Different Tone" };

        // Flow options panel
        juce::ComboBox scopeBox, locale;
        juce::ToggleButton preview { "Preview players" };
        Field scopeField { "Catalog", scopeBox }, localeField { "Language", locale };
        juce::TextButton browse { "Browse Tones on TONE3000" }, browseEmbedded { "Open in embedded WebView" };
        juce::Label browserHint, webViewHint;

        // States
        EmptyState emptyState;
        juce::TextButton cancel { "Cancel" };
        juce::Label loading;
        ToneDetailView detail;

        std::unique_ptr<t3k::AuthFlow> flow;
        bool browsing = false, loadingTone = false;
    };
}
