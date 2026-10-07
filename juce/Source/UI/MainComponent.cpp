#include "MainComponent.h"

#include "Audio/PreviewPlayer.h"
#include "FullApiDemo.h"
#include "LoadToneDemo.h"
#include "SelectDemo.h"
#include "T3K/Client.h"
#include "T3KConfig.h"

namespace ui
{
    // ---- Landing ----------------------------------------------------------------------

    namespace
    {
        /// One demo card (web .demo-card): tag, title, product, description, use case, CTA.
        class DemoCard : public juce::Component
        {
        public:
            DemoCard (juce::String tag, juce::String title, juce::String product, juce::String description, juce::String useCase,
                      std::function<void()> onOpen)
                : tagText (std::move (tag)), titleText (std::move (title)), productText (std::move (product)),
                  descriptionText (std::move (description)), useCaseText (std::move (useCase)), open (std::move (onOpen))
            {
                setMouseCursor (juce::MouseCursor::PointingHandCursor);
            }

            int preferredHeight (int width) const
            {
                const int inner = width - 48;
                return 24 + 14 + 8 + 28 + 4 + 16 + 12 + wrappedHeight (descriptionText, theme::font (14.0f), inner) + 16
                       + useCaseHeight (inner) + 16 + 20 + 24;
            }

            void paint (juce::Graphics& g) override
            {
                auto bounds = getLocalBounds().toFloat().reduced (0.5f);
                if (hover)
                {
                    g.setColour (theme::accent.withAlpha (0.08f));
                    g.fillRoundedRectangle (bounds.translated (0, 4.0f).expanded (2.0f), 14.0f);
                }
                g.setColour (theme::surface);
                g.fillRoundedRectangle (bounds, 12.0f);
                g.setColour (hover ? theme::accent : theme::border);
                g.drawRoundedRectangle (bounds, 12.0f, 1.0f);

                auto area = getLocalBounds().reduced (24);
                g.setColour (theme::accent);
                g.setFont (theme::font (11.0f, true));
                g.drawText (tagText.toUpperCase(), area.removeFromTop (14), juce::Justification::centredLeft, false);
                area.removeFromTop (8);
                g.setColour (theme::text);
                g.setFont (theme::font (22.0f, true));
                g.drawText (titleText, area.removeFromTop (28), juce::Justification::centredLeft, true);
                area.removeFromTop (4);
                g.setColour (theme::text2);
                g.setFont (theme::font (12.0f, false).italicised());
                g.drawText (productText, area.removeFromTop (16), juce::Justification::centredLeft, true);
                area.removeFromTop (12);

                const int descHeight = wrappedHeight (descriptionText, theme::font (14.0f), area.getWidth());
                g.setColour (theme::text2);
                g.setFont (theme::font (14.0f));
                g.drawFittedText (descriptionText, area.removeFromTop (descHeight), juce::Justification::topLeft, 8, 1.0f);
                area.removeFromTop (16);

                auto useCase = area.removeFromTop (useCaseHeight (area.getWidth()));
                g.setColour (theme::surface2);
                g.fillRoundedRectangle (useCase.toFloat(), 6.0f);
                g.setColour (theme::accent);
                g.fillRect (useCase.removeFromLeft (2));
                g.setColour (theme::text3);
                g.setFont (theme::font (12.0f));
                g.drawFittedText (useCaseText, useCase.reduced (12, 8), juce::Justification::centredLeft, 3, 1.0f);
                area.removeFromTop (16);

                g.setColour (theme::accent);
                g.setFont (theme::font (14.0f, true));
                g.drawText (juce::String (juce::CharPointer_UTF8 ("Open Demo \xE2\x86\x92")), area.removeFromTop (20), juce::Justification::centredLeft, false);
            }

            void mouseEnter (const juce::MouseEvent&) override { hover = true; repaint(); }
            void mouseExit (const juce::MouseEvent&) override { hover = false; repaint(); }
            void mouseUp (const juce::MouseEvent& e) override { if (open && getLocalBounds().contains (e.getPosition())) open(); }

        private:
            int useCaseHeight (int width) const { return wrappedHeight (useCaseText, theme::font (12.0f), width - 24) + 16; }

            juce::String tagText, titleText, productText, descriptionText, useCaseText;
            std::function<void()> open;
            bool hover = false;
        };
    }

    class LandingScreen : public juce::Component
    {
    public:
        explicit LandingScreen (Navigator& n) : nav (n)
        {
            viewport.setViewedComponent (&content, false);
            viewport.setScrollBarsShown (true, false);
            addAndMakeVisible (viewport);

            title.setText ("TONE3000 API Examples", juce::dontSendNotification);
            styleLabel (title, 36.0f, theme::text, true, juce::Justification::centred);
            content.addAndMakeVisible (title);
            subtitle.setText ("Reference integrations showing how to build against the TONE3000 API from a JUCE app.",
                              juce::dontSendNotification);
            styleLabel (subtitle, 16.0f, theme::text2, false, juce::Justification::centred);
            content.addAndMakeVisible (subtitle);
            style (docs, ButtonStyle::primary);
            docs.onClick = [] { openExternal ("https://www.tone3000.com/api"); };
            content.addAndMakeVisible (docs);

            content.addChildComponent (banner);
            if (juce::String (t3k::config::publishableKey).isEmpty())
            {
                banner.show ("T3K_PUBLISHABLE_KEY is not set. Copy juce/.env.example to juce/.env, add your key and re-run CMake.", true);
                banner.onDismiss = [this] { resized(); };
            }

            cards.push_back (std::make_unique<DemoCard> (
                "Select Flow", "Acme Inc", "Guitar Amp Simulation Plugin",
                "Acme Inc lets users browse the TONE3000 catalog and select a tone to load into the app. No tone UI to build: "
                "TONE3000 handles selection, in the system browser or an embedded WebView.",
                "Best for: Plugins, DAWs, apps where TONE3000 drives tone discovery",
                [this] { nav.push (std::make_unique<SelectDemoScreen> (nav)); }));
            cards.push_back (std::make_unique<DemoCard> (
                "Load Tone Flow", "Beacon Inc", "Rig Preset Management App",
                "Beacon Inc stores tone IDs and syncs them from TONE3000 on demand. The user authenticates once; "
                "Beacon Inc handles access errors gracefully and accepts replacements.",
                "Best for: Apps with saved tone references that need auth + access checking",
                [this] { nav.push (std::make_unique<LoadToneDemoScreen> (nav)); }));
            cards.push_back (std::make_unique<DemoCard> (
                "Full API Integration", "Chord Inc", "Tone Discovery & Management App",
                "Chord Inc builds its own tone UI on the REST API: the user's library, trending and latest feeds, search, "
                "makes and tags, creators, favorites, downloads and native previews.",
                "Best for: Apps with a custom tone browsing and management experience",
                [this] { nav.push (std::make_unique<FullApiDemoScreen> (nav)); }));
            for (auto& card : cards)
                content.addAndMakeVisible (*card);
        }

        void paint (juce::Graphics& g) override { g.fillAll (theme::bg); }

        void resized() override
        {
            viewport.setBounds (getLocalBounds());
            const int width = contentWidth (viewport);
            auto area = juce::Rectangle<int> (0, 0, width, 0).withSizeKeepingCentre (juce::jmin (width - 48, 1100), 0);
            int y = 48;

            if (banner.isShowing())
            {
                const int h = banner.preferredHeight (area.getWidth());
                banner.setBounds (area.getX(), y, area.getWidth(), h);
                y += h + 24;
            }
            title.setBounds (area.getX(), y, area.getWidth(), 44);
            y += 44 + 12;
            subtitle.setBounds (area.getX(), y, area.getWidth(), 24);
            y += 24 + 24;
            docs.setBounds (area.withSizeKeepingCentre (200, theme::control).getX(), y, 200, theme::control);
            y += theme::control + 56;

            const int columns = area.getWidth() >= 900 ? 3 : area.getWidth() >= 600 ? 2 : 1;
            const int cardWidth = (area.getWidth() - (columns - 1) * 24) / columns;
            int x = area.getX(), column = 0, rowHeight = 0;
            for (auto& card : cards)
            {
                const int h = card->preferredHeight (cardWidth);
                rowHeight = juce::jmax (rowHeight, h);
                card->setBounds (x, y, cardWidth, h);
                if (++column == columns) { column = 0; x = area.getX(); y += rowHeight + 24; rowHeight = 0; }
                else x += cardWidth + 24;
            }
            // Equalise card heights per row for a tidy grid.
            for (size_t i = 0; i < cards.size(); i += (size_t) columns)
            {
                int h = 0;
                for (size_t j = i; j < juce::jmin (cards.size(), i + (size_t) columns); ++j) h = juce::jmax (h, cards[j]->getHeight());
                for (size_t j = i; j < juce::jmin (cards.size(), i + (size_t) columns); ++j) cards[j]->setSize (cardWidth, h);
            }
            if (column != 0) y += rowHeight + 24;
            content.setSize (width, juce::jmax (getHeight(), y + 24));
        }

    private:
        Navigator& nav;
        juce::Viewport viewport;
        juce::Component content;
        juce::Label title, subtitle;
        juce::TextButton docs { juce::String (juce::CharPointer_UTF8 ("View API Documentation \xE2\x86\x92")) };
        Banner banner;
        std::vector<std::unique_ptr<DemoCard>> cards;
    };

    // ---- MainComponent ----------------------------------------------------------------

    MainComponent::MainComponent()
    {
        setLookAndFeel (&lookAndFeel);
        setSize (1100, 760);
        push (std::make_unique<LandingScreen> (*this));
    }

    MainComponent::~MainComponent()
    {
        stack.clear();
        setLookAndFeel (nullptr);
    }

    void MainComponent::push (std::unique_ptr<juce::Component> screen)
    {
        addAndMakeVisible (*screen);
        stack.push_back (std::move (screen));
        showTop();
    }

    void MainComponent::pop()
    {
        if (stack.size() <= 1)
            return;
        // Leaving a screen stops any preview it started.
        t3k::audio::player().stop();
        // The caller is usually a button on the screen being popped: delete it next tick.
        auto screen = std::shared_ptr<juce::Component> (stack.back().release());
        stack.pop_back();
        screen->setVisible (false);
        juce::MessageManager::callAsync ([screen] { juce::ignoreUnused (screen); });
        showTop();
    }

    void MainComponent::showTop()
    {
        for (size_t i = 0; i < stack.size(); ++i)
            stack[i]->setVisible (i + 1 == stack.size());
        resized();
    }

    void MainComponent::paint (juce::Graphics& g)
    {
        g.fillAll (theme::bg);
    }

    void MainComponent::resized()
    {
        for (auto& screen : stack)
            screen->setBounds (getLocalBounds());
    }
}
