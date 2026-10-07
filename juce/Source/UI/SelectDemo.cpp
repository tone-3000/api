#include "SelectDemo.h"

#include "T3K/Client.h"

namespace ui
{
    namespace
    {
        struct CatalogScope { const char* label; const char* gears; const char* format; };
        /// Catalog scopes a product might lock the Select flow to.
        constexpr CatalogScope kScopes[] = {
            { "Amp + Cab captures", "amp-cab", "nam" },
            { "Amps and pedals", "amp_pedal", "nam" },
            { "Cabinet IRs", "cab", "ir" },
            { "All NAM captures", "", "nam" },
        };
        constexpr std::pair<const char*, const char*> kLocales[] = {
            { "English", "" }, { "\xE7\xAE\x80\xE4\xBD\x93\xE4\xB8\xAD\xE6\x96\x87", "zh-CN" },
        };

        constexpr int kPanelPad = 16;
    }

    SelectDemoScreen::SelectDemoScreen (Navigator& n) : Screen (n, "Acme Inc", "Guitar Amp Simulation", "All Demos")
    {
        viewport.setViewedComponent (&content, false);
        viewport.setScrollBarsShown (true, false);
        addAndMakeVisible (viewport);

        sectionTitle.setText ("Tone Library", juce::dontSendNotification);
        styleLabel (sectionTitle, 20.0f, theme::text, true);
        content.addAndMakeVisible (sectionTitle);
        content.addChildComponent (browseAgain);
        style (browseAgain, ButtonStyle::secondary);
        browseAgain.onClick = [this] { start (t3k::FlowMode::systemBrowser); };

        for (int i = 0; i < (int) std::size (kScopes); ++i)
            scopeBox.addItem (kScopes[i].label, i + 1);
        scopeBox.setSelectedId (1, juce::dontSendNotification);
        for (int i = 0; i < (int) std::size (kLocales); ++i)
            locale.addItem (juce::String (juce::CharPointer_UTF8 (kLocales[i].first)), i + 1);
        locale.setSelectedId (1, juce::dontSendNotification);
        preview.setToggleState (true, juce::dontSendNotification);
        preview.setTooltip ("Adds preview=true so the catalog shows audio preview players");
        content.addAndMakeVisible (scopeField);
        content.addAndMakeVisible (localeField);
        content.addAndMakeVisible (preview);

        style (browse, ButtonStyle::primary);
        browse.onClick = [this] { start (t3k::FlowMode::systemBrowser); };
        content.addAndMakeVisible (browse);
        browserHint.setText ("Opens tone3000.com in the default browser; the app listens on a loopback port for the redirect. "
                             "Nothing to register or install.", juce::dontSendNotification);
        styleLabel (browserHint, 12.0f, theme::text3, false, juce::Justification::topLeft);
        content.addAndMakeVisible (browserHint);

        style (browseEmbedded, ButtonStyle::secondary);
        browseEmbedded.onClick = [this] { start (t3k::FlowMode::embeddedWebView); };
        content.addAndMakeVisible (browseEmbedded);
        juce::String reason;
        const bool webViewAvailable = t3k::isWebViewFlowAvailable (reason);
        browseEmbedded.setEnabled (webViewAvailable);
        webViewHint.setText (webViewAvailable
                                 ? "The catalog opens in a window of this app (WKWebView on macOS, WebView2 on Windows) and the "
                                   "redirect is intercepted before it loads."
                                 : "Unavailable: " + reason + " Ship the WebView2 Runtime with your installer, or fall back to the browser.",
                             juce::dontSendNotification);
        styleLabel (webViewHint, 12.0f, theme::text3, false, juce::Justification::topLeft);
        content.addAndMakeVisible (webViewHint);

        emptyState.set ("No Tone Loaded",
                        "Browse the TONE3000 catalog to find a tone and load it into Acme Inc. "
                        "You'll be able to preview each model directly.");
        content.addAndMakeVisible (emptyState);
        cancel.onClick = [this] { if (flow) flow->cancel(); };
        style (cancel, ButtonStyle::secondary);
        content.addChildComponent (cancel);

        loading.setText ("Loading tone from TONE3000...", juce::dontSendNotification);
        styleLabel (loading, 14.0f, theme::text2, false, juce::Justification::centred);
        content.addChildComponent (loading);

        content.addChildComponent (detail);
        detail.onError = [this] (const juce::String& e) { showError (e); };

        content.onPaint = [this] (juce::Graphics& g)
        {
            auto panel = juce::Rectangle<int> (0, scopeField.getY() - kPanelPad - 22, content.getWidth(),
                                               webViewHint.getBottom() - scopeField.getY() + kPanelPad * 2 + 22);
            drawPanel (g, panel);
            drawCaption (g, panel.reduced (kPanelPad, 0).withTrimmedTop (12).withHeight (16), "Select flow options");
            g.setColour (theme::border);
            g.fillRect (panel.reduced (kPanelPad, 0).withY (browse.getY() - 12).withHeight (1));
        };
    }

    void SelectDemoScreen::start (t3k::FlowMode mode)
    {
        clearBanner();
        auto& s = kScopes[juce::jmax (0, scopeBox.getSelectedId() - 1)];

        t3k::FlowRequest request;
        request.kind = t3k::FlowRequest::Kind::selectTone;
        request.catalog.gears = s.gears;
        request.catalog.format = s.format;
        request.catalog.preview = preview.getToggleState();
        request.catalog.locale = kLocales[juce::jmax (0, locale.getSelectedId() - 1)].second;

        flow = t3k::makeAuthFlow (mode, nav.window());
        browsing = true;
        detail.clear();
        emptyState.set (mode == t3k::FlowMode::systemBrowser ? "Browsing TONE3000 in your browser..." : "Browsing TONE3000...",
                        "Pick a tone in the TONE3000 window to load it here.");
        setBusy (true);
        flow->start (request, scope.wrap ([this] (t3k::FlowResult r) { handleResult (std::move (r)); }));
    }

    void SelectDemoScreen::handleResult (t3k::FlowResult result)
    {
        browsing = false;
        // We're inside the flow's completion callback: let it finish before it goes away.
        juce::MessageManager::callAsync ([f = std::shared_ptr<t3k::AuthFlow> (flow.release())] { juce::ignoreUnused (f); });
        setBusy (false);

        if (result.canceled())
        {
            showInfo ("You closed the tone browser without selecting a tone.");
            return;
        }
        if (! result.connected())
        {
            showError ("Sign-in failed: " + result.error);
            return;
        }
        if (result.toneId.isEmpty())
        {
            showInfo ("Signed in, but no tone was selected.");
            return;
        }
        loadTone (result.toneId.getIntValue());
    }

    void SelectDemoScreen::loadTone (int toneId)
    {
        loadingTone = true;
        setBusy (false);
        t3k::client().getToneWithModels (toneId, scope.wrap ([this] (t3k::Result<t3k::ToneWithModels> r)
        {
            loadingTone = false;
            if (! r.ok())
            {
                showError (r.error.isNotFound() ? "This tone is no longer available." : r.error.userMessage ("Loading the tone"));
                setBusy (false);
                return;
            }
            detail.set (*r, ToneDetailOptions {});
            setBusy (false);
        }));
    }

    void SelectDemoScreen::setBusy (bool busy)
    {
        juce::String reason;
        browse.setEnabled (! busy);
        browseEmbedded.setEnabled (! busy && t3k::isWebViewFlowAvailable (reason));
        browseAgain.setEnabled (! busy);
        scopeBox.setEnabled (! busy);
        locale.setEnabled (! busy);
        preview.setEnabled (! busy);
        cancel.setVisible (busy);
        if (! busy && ! detail.hasTone())
            emptyState.set ("No Tone Loaded",
                            "Browse the TONE3000 catalog to find a tone and load it into Acme Inc. "
                            "You'll be able to preview each model directly.");
        emptyState.action.setVisible (false);
        emptyState.setVisible (! loadingTone && ! detail.hasTone());
        loading.setVisible (loadingTone);
        detail.setVisible (detail.hasTone());
        browseAgain.setVisible (detail.hasTone());
        resized();
    }

    int SelectDemoScreen::layout (int width, bool apply)
    {
        int y = 0;
        auto place = [&] (juce::Component& c, juce::Rectangle<int> r) { if (apply) c.setBounds (r); };

        // Section header
        {
            auto row = juce::Rectangle<int> (0, y, width, theme::control);
            if (browseAgain.isVisible())
                place (browseAgain, row.removeFromRight (190));
            place (sectionTitle, row);
            y += theme::control + 20;
        }

        // Options panel
        {
            y += 12 + 16 + 10;                                            // caption
            const int inner = width - kPanelPad * 2;
            const int fieldWidth = juce::jmin (260, (inner - theme::gap * 2) / 3);
            auto row = juce::Rectangle<int> (kPanelPad, y, inner, Field::height);
            place (scopeField, row.removeFromLeft (fieldWidth));
            row.removeFromLeft (theme::gap);
            place (localeField, row.removeFromLeft (fieldWidth));
            row.removeFromLeft (theme::gap);
            place (preview, row.removeFromLeft (fieldWidth).withTrimmedTop (22));
            y += Field::height + 12;

            y += 12;                                                      // divider
            const int colWidth = (inner - theme::gap) / 2;
            const int hintHeight = juce::jmax (wrappedHeight (browserHint.getText(), browserHint.getFont(), colWidth),
                                               wrappedHeight (webViewHint.getText(), webViewHint.getFont(), colWidth));
            auto cols = juce::Rectangle<int> (kPanelPad, y, inner, theme::control + 6 + hintHeight);
            auto left = cols.removeFromLeft (colWidth);
            cols.removeFromLeft (theme::gap);
            place (browse, left.removeFromTop (theme::control));
            left.removeFromTop (6);
            place (browserHint, left);
            place (browseEmbedded, cols.removeFromTop (theme::control));
            cols.removeFromTop (6);
            place (webViewHint, cols);
            y += theme::control + 6 + hintHeight + kPanelPad;
            y += 20;
        }

        if (detail.isVisible())
        {
            const int h = detail.preferredHeight (width);
            place (detail, { 0, y, width, h });
            y += h;
        }
        else
        {
            const int h = 220;
            auto block = juce::Rectangle<int> (0, y, width, h);
            place (emptyState, block);
            if (cancel.isVisible())
                place (cancel, block.withSizeKeepingCentre (100, theme::control).translated (0, 60));
            place (loading, block);
            y += h;
        }
        return y + theme::pad;
    }

    void SelectDemoScreen::layoutContent (juce::Rectangle<int> area)
    {
        viewport.setBounds (area);
        const int width = contentWidth (viewport);
        content.setSize (width, juce::jmax (area.getHeight(), layout (width, false)));
        layout (width, true);
        content.repaint();
    }
}
