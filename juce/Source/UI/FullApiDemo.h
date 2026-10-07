// Chord — the full API. Sign in (system browser), then browse the user's
// library, discover trending/latest tones, search with filters, explore makes,
// tags and creators, favorite tones and download models — all through the
// authenticated API with previews rendered by the native engine.
#pragma once

#include "T3K/AuthFlow.h"
#include "Widgets.h"

namespace ui
{
    class FullApiDemoScreen : public Screen, private juce::ChangeListener
    {
    public:
        explicit FullApiDemoScreen (Navigator& nav);
        ~FullApiDemoScreen() override;

        // Used by the sections
        void openTone (const t3k::Tone& tone);
        void searchFor (const t3k::SearchTonesParams& params);
        void reportError (const t3k::Error& error, const juce::String& context);

    private:
        class Section;
        class LibrarySection;
        class DiscoverSection;
        class SearchSection;
        class TaxonomySection;
        class CreatorsSection;
        class ProfileSection;
        class SidebarItem;

        void changeListenerCallback (juce::ChangeBroadcaster*) override;
        void connect();
        void disconnect();
        void refreshConnectionState();
        void showSection (int index);
        void paint (juce::Graphics&) override;
        void layoutContent (juce::Rectangle<int> area) override;

        // Signed-out state
        EmptyState connectState;
        juce::TextButton cancel { "Cancel" };
        std::unique_ptr<t3k::AuthFlow> flow;

        // Signed-in state
        CreatorBadge userBadge;
        juce::TextButton browseButton { "Browse TONE3000" }, disconnectButton { "Disconnect" };
        std::vector<std::unique_ptr<SidebarItem>> sidebar;
        std::vector<std::unique_ptr<Section>> sections;
        int current = 0;
        SearchSection* searchSection = nullptr;
        bool connected = false;
        juce::Rectangle<int> sidebarArea;
    };
}
