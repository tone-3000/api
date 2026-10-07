#include "Widgets.h"

#include "T3K/Client.h"

namespace ui
{
    // ---- Theme ----------------------------------------------------------------------

    juce::Font theme::font (float size, bool bold)
    {
        return juce::Font (juce::FontOptions (size, bold ? juce::Font::bold : juce::Font::plain));
    }

    LookAndFeel::LookAndFeel()
    {
        setColour (juce::ResizableWindow::backgroundColourId, theme::bg);
        setColour (juce::TextButton::buttonColourId, theme::surface);
        setColour (juce::TextButton::buttonOnColourId, theme::accent);
        setColour (juce::TextButton::textColourOffId, theme::text);
        setColour (juce::TextButton::textColourOnId, juce::Colours::white);
        setColour (juce::ComboBox::backgroundColourId, theme::surface);
        setColour (juce::ComboBox::outlineColourId, theme::border);
        setColour (juce::ComboBox::textColourId, theme::text);
        setColour (juce::ComboBox::arrowColourId, theme::text2);
        setColour (juce::PopupMenu::backgroundColourId, theme::surface);
        setColour (juce::PopupMenu::textColourId, theme::text);
        setColour (juce::PopupMenu::highlightedBackgroundColourId, theme::surface2);
        setColour (juce::PopupMenu::highlightedTextColourId, theme::text);
        setColour (juce::TextEditor::backgroundColourId, theme::surface);
        setColour (juce::TextEditor::outlineColourId, theme::border);
        setColour (juce::TextEditor::focusedOutlineColourId, theme::accent);
        setColour (juce::TextEditor::textColourId, theme::text);
        setColour (juce::TextEditor::highlightColourId, theme::accent.withAlpha (0.25f));
        setColour (juce::CaretComponent::caretColourId, theme::text);
        setColour (juce::Label::textColourId, theme::text);
        setColour (juce::ToggleButton::textColourId, theme::text);
        setColour (juce::ToggleButton::tickColourId, theme::accent);
        setColour (juce::ToggleButton::tickDisabledColourId, theme::text3);
        setColour (juce::ListBox::backgroundColourId, theme::surface);
        setColour (juce::ListBox::outlineColourId, theme::border);
        setColour (juce::ScrollBar::thumbColourId, theme::border2);
        setColour (juce::AlertWindow::backgroundColourId, theme::surface);
        setColour (juce::AlertWindow::textColourId, theme::text);
        setColour (juce::TooltipWindow::backgroundColourId, theme::text);
        setColour (juce::TooltipWindow::textColourId, juce::Colours::white);
        setColour (juce::TooltipWindow::outlineColourId, theme::text);
    }

    static ButtonStyle styleOf (const juce::Button& b)
    {
        return static_cast<ButtonStyle> ((int) b.getProperties().getWithDefault ("style", (int) ButtonStyle::secondary));
    }

    void style (juce::Button& button, ButtonStyle s)
    {
        button.getProperties().set ("style", (int) s);
        button.repaint();
    }

    void LookAndFeel::drawButtonBackground (juce::Graphics& g, juce::Button& button, const juce::Colour&, bool highlighted, bool down)
    {
        auto bounds = button.getLocalBounds().toFloat().reduced (0.5f);
        auto s = styleOf (button);
        const bool on = button.getToggleState();
        juce::Colour fill, outline;

        if (s == ButtonStyle::primary || on)
        {
            fill = down ? theme::accentHover.darker (0.1f) : highlighted ? theme::accentHover : theme::accent;
            outline = fill;
        }
        else if (s == ButtonStyle::secondary)
        {
            fill = down ? theme::surface2.darker (0.05f) : highlighted ? theme::surface2 : theme::surface;
            outline = highlighted ? theme::border2 : theme::border;
        }
        else
        {
            fill = down ? theme::surface2 : highlighted ? theme::surface2.withAlpha (0.7f) : juce::Colours::transparentBlack;
            outline = juce::Colours::transparentBlack;
        }

        if (! button.isEnabled())
        {
            fill = fill.withMultipliedAlpha (0.5f);
            outline = outline.withMultipliedAlpha (0.5f);
        }
        g.setColour (fill);
        g.fillRoundedRectangle (bounds, theme::radius);
        g.setColour (outline);
        g.drawRoundedRectangle (bounds, theme::radius, 1.0f);
    }

    juce::Font LookAndFeel::getTextButtonFont (juce::TextButton& b, int height)
    {
        return theme::font (height < 32 ? 13.0f : 14.0f, styleOf (b) == ButtonStyle::primary || b.getToggleState());
    }

    void LookAndFeel::drawButtonText (juce::Graphics& g, juce::TextButton& button, bool, bool)
    {
        auto s = styleOf (button);
        auto colour = (s == ButtonStyle::primary || button.getToggleState()) ? juce::Colours::white
                    : s == ButtonStyle::ghost ? theme::text2 : theme::text;
        if (! button.isEnabled()) colour = colour.withMultipliedAlpha (0.5f);
        g.setColour (colour);
        g.setFont (getTextButtonFont (button, button.getHeight()));
        g.drawText (button.getButtonText(), button.getLocalBounds().reduced (6, 0), juce::Justification::centred, true);
    }

    void LookAndFeel::drawComboBox (juce::Graphics& g, int width, int height, bool, int, int, int, int, juce::ComboBox& box)
    {
        auto bounds = juce::Rectangle<int> (0, 0, width, height).toFloat().reduced (0.5f);
        g.setColour (theme::surface);
        g.fillRoundedRectangle (bounds, theme::radius);
        g.setColour (box.hasKeyboardFocus (true) ? theme::accent : theme::border);
        g.drawRoundedRectangle (bounds, theme::radius, 1.0f);

        juce::Path arrow;
        auto cx = (float) width - 14.0f, cy = (float) height * 0.5f;
        arrow.addTriangle (cx - 4.0f, cy - 2.0f, cx + 4.0f, cy - 2.0f, cx, cy + 3.0f);
        g.setColour (theme::text2);
        g.fillPath (arrow);
    }

    juce::Font LookAndFeel::getComboBoxFont (juce::ComboBox&) { return theme::font (14.0f); }

    void LookAndFeel::positionComboBoxText (juce::ComboBox& box, juce::Label& label)
    {
        label.setBounds (10, 1, box.getWidth() - 34, box.getHeight() - 2);
        label.setFont (getComboBoxFont (box));
    }

    void LookAndFeel::fillTextEditorBackground (juce::Graphics& g, int width, int height, juce::TextEditor&)
    {
        g.setColour (theme::surface);
        g.fillRoundedRectangle (juce::Rectangle<int> (0, 0, width, height).toFloat(), theme::radius);
    }

    void LookAndFeel::drawTextEditorOutline (juce::Graphics& g, int width, int height, juce::TextEditor& editor)
    {
        g.setColour (editor.hasKeyboardFocus (true) ? theme::accent : theme::border);
        g.drawRoundedRectangle (juce::Rectangle<int> (0, 0, width, height).toFloat().reduced (0.5f), theme::radius, 1.0f);
    }

    void LookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& button, bool highlighted, bool)
    {
        auto box = juce::Rectangle<float> (0.0f, (float) (button.getHeight() - 16) * 0.5f, 16.0f, 16.0f);
        const bool on = button.getToggleState();
        g.setColour (on ? theme::accent : theme::surface);
        g.fillRoundedRectangle (box, 4.0f);
        g.setColour (on ? theme::accent : highlighted ? theme::border2 : theme::border);
        g.drawRoundedRectangle (box.reduced (0.5f), 4.0f, 1.0f);
        if (on)
        {
            juce::Path tick;
            tick.startNewSubPath (box.getX() + 4.0f, box.getCentreY());
            tick.lineTo (box.getX() + 7.0f, box.getBottom() - 4.5f);
            tick.lineTo (box.getRight() - 3.5f, box.getY() + 4.5f);
            g.setColour (juce::Colours::white);
            g.strokePath (tick, juce::PathStrokeType (2.0f));
        }
        g.setColour (button.isEnabled() ? theme::text : theme::text3);
        g.setFont (theme::font (13.0f));
        g.drawText (button.getButtonText(), button.getLocalBounds().withTrimmedLeft (24), juce::Justification::centredLeft, true);
    }

    void LookAndFeel::drawScrollbar (juce::Graphics& g, juce::ScrollBar&, int x, int y, int width, int height,
                                     bool vertical, int thumbStart, int thumbSize, bool, bool)
    {
        juce::Rectangle<int> thumb = vertical ? juce::Rectangle<int> (x + 2, thumbStart, width - 4, thumbSize)
                                              : juce::Rectangle<int> (thumbStart, y + 2, thumbSize, height - 4);
        g.setColour (theme::border2.withAlpha (0.6f));
        g.fillRoundedRectangle (thumb.toFloat(), 4.0f);
    }

    // ---- Text helpers --------------------------------------------------------------------

    void styleLabel (juce::Label& label, float size, const juce::Colour& colour, bool bold, juce::Justification just)
    {
        label.setFont (theme::font (size, bold));
        label.setColour (juce::Label::textColourId, colour);
        label.setJustificationType (just);
        label.setMinimumHorizontalScale (1.0f);
        label.setBorderSize ({ 0, 0, 0, 0 });
    }

    void styleEditor (juce::TextEditor& editor, const juce::String& placeholder)
    {
        editor.setFont (theme::font (14.0f));
        editor.setTextToShowWhenEmpty (placeholder, theme::text3);
        editor.setIndents (10, 8);
        editor.setSelectAllWhenFocused (false);
    }

    void fillCombo (juce::ComboBox& combo, const std::vector<std::pair<juce::String, juce::String>>& items)
    {
        combo.clear (juce::dontSendNotification);
        int id = 1;
        for (auto& [label, value] : items)
            combo.addItem (label, id++);
        combo.setSelectedId (1, juce::dontSendNotification);
    }

    void openExternal (const juce::String& url)
    {
        juce::URL (url).launchInDefaultBrowser();
    }

    int wrappedHeight (const juce::String& text, const juce::Font& font, int width)
    {
        if (text.isEmpty() || width <= 0)
            return 0;
        juce::TextLayout layout;
        juce::AttributedString s (text);
        s.setFont (font);
        layout.createLayout (s, (float) width);
        return (int) std::ceil (layout.getHeight()) + 2;
    }

    // ---- Images -----------------------------------------------------------------------------

    void RemoteImage::setUrl (const juce::String& url)
    {
        if (url == currentUrl)
            return;
        currentUrl = url;
        image = {};
        fitted = {};
        repaint();
        if (url.isEmpty())
        {
            request.cancel();
            return;
        }
        // The request handle is a member, so a destroyed component never gets called back.
        imageLoader().load (url, kind == Kind::art ? ImageLoader::kArtSide : ImageLoader::kAvatarSide, request,
                            [this, url] (const juce::Image& loaded)
        {
            if (url != currentUrl) return;
            image = loaded;
            fitted = {};
            repaint();
        });
    }

    void RemoteImage::paint (juce::Graphics& g)
    {
        auto bounds = getLocalBounds().toFloat();
        juce::Path clip;
        if (circular) clip.addEllipse (bounds);
        else clip.addRoundedRectangle (bounds, corner);

        g.saveState();
        g.reduceClipRegion (clip);
        if (image.isValid())
        {
            // Cover-fit once per size + pixel scale; a plain draw after that.
            const float scale = g.getInternalContext().getPhysicalPixelScaleFactor();
            if (! fitted.isValid() || ! juce::approximatelyEqual (scale, fittedScale))
            {
                fitted = coverFit (image, getWidth(), getHeight(), scale);
                fittedScale = scale;
            }
            g.drawImageTransformed (fitted, juce::AffineTransform::scale ((float) getWidth() / (float) fitted.getWidth(),
                                                                          (float) getHeight() / (float) fitted.getHeight()));
        }
        else
        {
            g.fillAll (theme::surface2);
        }
        g.restoreState();
        g.setColour (theme::border);
        g.strokePath (clip, juce::PathStrokeType (1.0f));
    }

    // ---- Small pieces -------------------------------------------------------------------------

    // Web .badge: 11px/600, uppercase, 0.04em tracking, 2px 8px padding, 4px radius.
    static const juce::Font& badgeFont()
    {
        static const juce::Font f = theme::font (11.0f, true).withExtraKerningFactor (0.04f);
        return f;
    }

    int badgeWidth (const juce::String& text)
    {
        return juce::GlyphArrangement::getStringWidthInt (badgeFont(), text.toUpperCase()) + 16;
    }

    int drawBadge (juce::Graphics& g, int x, int y, const juce::String& label, BadgeStyle s)
    {
        const auto text = label.toUpperCase();
        const int w = badgeWidth (text);
        auto r = juce::Rectangle<int> (x, y, w, badgeHeight).toFloat();
        juce::Colour fg, bgc, line;
        switch (s)
        {
            case BadgeStyle::gear:   fg = juce::Colour (0xff6d28d9); bgc = fg.withAlpha (0.07f); line = juce::Colour (0xffc4b5fd); break;
            case BadgeStyle::format: fg = juce::Colour (0xff1d4ed8); bgc = theme::accent.withAlpha (0.07f); line = juce::Colour (0xff93c5fd); break;
            case BadgeStyle::neutral:
            default:                 fg = theme::text2; bgc = theme::surface2; line = theme::border; break;
        }
        g.setColour (bgc);
        g.fillRoundedRectangle (r, 4.0f);
        g.setColour (line);
        g.drawRoundedRectangle (r.reduced (0.5f), 4.0f, 1.0f);
        g.setColour (fg);
        g.setFont (badgeFont());
        g.drawText (text, r.toNearestInt(), juce::Justification::centred, false);
        return w;
    }

    void CreatorBadge::set (const t3k::EmbeddedUser& u, bool isLarge)
    {
        user = u;
        large = isLarge;
        avatar.setCircular (true);
        avatar.setUrl (user.avatarUrl);
        if (user.avatarUrl.isNotEmpty()) addAndMakeVisible (avatar);
        else avatar.setVisible (false);
        resized();
        repaint();
    }

    void CreatorBadge::resized()
    {
        const int size = large ? 28 : 18;
        avatar.setBounds (0, (getHeight() - size) / 2, size, size);
    }

    void CreatorBadge::paint (juce::Graphics& g)
    {
        const int size = large ? 28 : 18;
        auto area = getLocalBounds();
        auto avatarArea = area.removeFromLeft (size);
        if (! avatar.isVisible())
        {
            // Initial-letter placeholder, like the web version.
            g.setColour (theme::surface2);
            g.fillEllipse (avatarArea.withSizeKeepingCentre (size, size).toFloat());
            g.setColour (theme::border);
            g.drawEllipse (avatarArea.withSizeKeepingCentre (size, size).toFloat().reduced (0.5f), 1.0f);
            g.setColour (theme::text2);
            g.setFont (theme::font (large ? 12.0f : 10.0f, true));
            g.drawText (user.creatorName().substring (0, 1).toUpperCase(), avatarArea, juce::Justification::centred, false);
        }
        area.removeFromLeft (large ? 10 : 6);

        auto font = theme::font (large ? 15.0f : 12.0f, large);
        g.setFont (font);
        g.setColour (large ? theme::text : theme::text2);
        auto name = user.creatorName();
        int nameWidth = juce::jmin (area.getWidth() - (user.isVerified ? 20 : 0),
                                    juce::GlyphArrangement::getStringWidthInt (font, name));
        g.drawText (name, area.removeFromLeft (nameWidth), juce::Justification::centredLeft, true);
        if (user.isVerified && area.getWidth() >= 18)
        {
            area.removeFromLeft (5);
            auto mark = area.removeFromLeft (14).withSizeKeepingCentre (14, 14).toFloat();
            g.setColour (theme::accent);
            g.fillEllipse (mark);
            juce::Path tick;
            tick.startNewSubPath (mark.getX() + 3.5f, mark.getCentreY());
            tick.lineTo (mark.getX() + 6.0f, mark.getBottom() - 4.0f);
            tick.lineTo (mark.getRight() - 3.5f, mark.getY() + 4.0f);
            g.setColour (juce::Colours::white);
            g.strokePath (tick, juce::PathStrokeType (1.6f));
        }
    }

    // ---- Banner ----------------------------------------------------------------------

    Banner::Banner()
    {
        addAndMakeVisible (dismiss);
        style (dismiss, ButtonStyle::ghost);
        dismiss.onClick = [this]
        {
            clear();
            if (onDismiss) onDismiss();
            else if (auto* p = getParentComponent()) p->resized();
        };
        setVisible (false);
    }

    void Banner::show (const juce::String& m, bool isError)
    {
        message = m;
        error = isError;
        setVisible (isShowing());
        repaint();
    }

    void Banner::clear()
    {
        message.clear();
        setVisible (false);
    }

    int Banner::preferredHeight (int width) const
    {
        return juce::jmax (40, wrappedHeight (message, theme::font (13.0f), width - 60) + 20);
    }

    void Banner::paint (juce::Graphics& g)
    {
        auto colour = error ? theme::error : theme::accent;
        auto bounds = getLocalBounds().toFloat().reduced (0.5f);
        g.setColour (colour.withAlpha (error ? 0.06f : 0.07f));
        g.fillRoundedRectangle (bounds, theme::radius);
        g.setColour (colour.withAlpha (0.35f));
        g.drawRoundedRectangle (bounds, theme::radius, 1.0f);
        g.setColour (error ? colour : theme::text);
        g.setFont (theme::font (13.0f));
        g.drawFittedText (message, getLocalBounds().reduced (14, 8).withTrimmedRight (34), juce::Justification::centredLeft, 6);
    }

    void Banner::resized()
    {
        dismiss.setBounds (getLocalBounds().removeFromRight (36).removeFromTop (40).reduced (6));
    }

    // ---- EmptyState ------------------------------------------------------------------------

    EmptyState::EmptyState()
    {
        styleLabel (title, 18.0f, theme::text, true, juce::Justification::centred);
        styleLabel (description, 14.0f, theme::text2, false, juce::Justification::centredTop);
        addAndMakeVisible (title);
        addAndMakeVisible (description);
        addChildComponent (action);
        style (action, ButtonStyle::primary);
    }

    void EmptyState::set (const juce::String& t, const juce::String& d)
    {
        title.setText (t, juce::dontSendNotification);
        description.setText (d, juce::dontSendNotification);
        resized();
    }

    void EmptyState::resized()
    {
        auto area = getLocalBounds();
        const int textWidth = juce::jmin (420, area.getWidth());
        const int descHeight = wrappedHeight (description.getText(), description.getFont(), textWidth);
        const int total = 26 + 8 + descHeight + (action.isVisible() ? 20 + theme::control : 0);
        auto block = area.withSizeKeepingCentre (textWidth, total);
        title.setBounds (block.removeFromTop (26));
        block.removeFromTop (8);
        description.setBounds (block.removeFromTop (descHeight));
        if (action.isVisible())
        {
            block.removeFromTop (20);
            const int w = juce::GlyphArrangement::getStringWidthInt (theme::font (14.0f, true), action.getButtonText()) + 36;
            action.setBounds (block.removeFromTop (theme::control).withSizeKeepingCentre (w, theme::control));
        }
    }

    // ---- Screen ----------------------------------------------------------------------

    Screen::Screen (Navigator& navigator, const juce::String& appName, const juce::String& taglineText,
                    const juce::String& backLabel)
        : nav (navigator)
    {
        name.setText (appName, juce::dontSendNotification);
        styleLabel (name, 18.0f, theme::text, true);
        tagline.setText (taglineText, juce::dontSendNotification);
        styleLabel (tagline, 12.0f, theme::text3);
        addAndMakeVisible (name);
        addAndMakeVisible (tagline);

        back.setButtonText (arrowLeft + (backLabel.isNotEmpty() ? backLabel : juce::String ("Back")));
        style (back, ButtonStyle::ghost);
        back.onClick = [this] { nav.pop(); };
        addAndMakeVisible (back);
        addChildComponent (banner);
    }

    void Screen::paint (juce::Graphics& g)
    {
        g.fillAll (theme::bg);
        g.setColour (theme::surface);
        g.fillRect (0, 0, getWidth(), headerHeight);
        g.setColour (theme::border);
        g.fillRect (0, headerHeight - 1, getWidth(), 1);
        g.fillRect (0, getHeight() - footerHeight, getWidth(), 1);
    }

    void Screen::addHeaderAction (juce::Component& action, int width)
    {
        addAndMakeVisible (action);
        actions.push_back ({ &action, width });
        resized();
    }

    void Screen::resized()
    {
        auto full = getLocalBounds();
        auto header = full.removeFromTop (headerHeight).reduced (theme::pad, 0);
        for (auto& [component, width] : actions)
        {
            component->setBounds (header.removeFromRight (width).withSizeKeepingCentre (width, theme::controlSmall));
            header.removeFromRight (theme::gapSmall);
        }
        auto brand = header.withSizeKeepingCentre (header.getWidth(), 40);
        name.setBounds (brand.removeFromTop (22));
        tagline.setBounds (brand);

        auto footer = full.removeFromBottom (footerHeight).reduced (theme::pad, 0);
        const int backWidth = juce::GlyphArrangement::getStringWidthInt (theme::font (13.0f), back.getButtonText()) + 24;
        back.setBounds (footer.removeFromLeft (backWidth).withSizeKeepingCentre (backWidth, theme::controlSmall));

        auto area = full.reduced (contentPadding, contentPadding);
        if (mainMaxWidth > 0 && area.getWidth() > mainMaxWidth)
            area = area.withSizeKeepingCentre (mainMaxWidth, area.getHeight());

        if (! manualBanner)
            placeBanner (area);
        layoutContent (area);
    }

    void Screen::placeBanner (juce::Rectangle<int>& area)
    {
        if (! banner.isShowing())
            return;
        banner.setBounds (area.removeFromTop (banner.preferredHeight (area.getWidth())));
        area.removeFromTop (theme::gap);
    }

    // ---- ToneCard / ToneGrid -----------------------------------------------------------

    ToneCard::ToneCard (t3k::Tone t, bool isCompact) : tone (std::move (t)), compact (isCompact)
    {
        setMouseCursor (isCompact ? juce::MouseCursor::PointingHandCursor : juce::MouseCursor::NormalCursor);
        cover.setUrl (tone.images.isEmpty() ? juce::String() : tone.images[0]);
        addAndMakeVisible (cover);
        creator.set (tone.user, false);
        addAndMakeVisible (creator);
        creator.setInterceptsMouseClicks (false, false);
        cover.setInterceptsMouseClicks (false, false);
    }

    static juce::String toneStats (const t3k::Tone& tone)
    {
        return arrowDown + juce::String (tone.downloadsCount) + dot + star + juce::String (tone.favoritesCount) + dot + tone.modelCountLabel();
    }

    int ToneCard::preferredHeight (int width) const
    {
        const int inner = width - 32;
        const int image = compact ? inner / 2 : juce::jmin (inner / 2, 220);
        int h = 16 + image + 12 + 22 + 4 + 20 + 8 + badgeHeight + 8 + 18 + 16;
        if (! compact && tone.description.isNotEmpty())
            h += 8 + juce::jmin (120, wrappedHeight (tone.description, theme::font (13.0f), inner));
        return h;
    }

    void ToneCard::resized()
    {
        auto area = getLocalBounds().reduced (16);
        const int image = compact ? area.getWidth() / 2 : juce::jmin (area.getWidth() / 2, 220);
        cover.setBounds (area.removeFromTop (image).withSizeKeepingCentre (image, image));
        area.removeFromTop (12 + 22 + 4);
        creator.setBounds (area.removeFromTop (20));
    }

    void ToneCard::paint (juce::Graphics& g)
    {
        auto bounds = getLocalBounds().toFloat().reduced (0.5f);
        g.setColour (theme::surface);
        g.fillRoundedRectangle (bounds, 12.0f);
        g.setColour (hover && compact ? theme::accent.withAlpha (0.6f) : theme::border);
        g.drawRoundedRectangle (bounds, 12.0f, 1.0f);

        auto area = getLocalBounds().reduced (16);
        area.removeFromTop (cover.getHeight() + 12);
        g.setColour (theme::text);
        g.setFont (theme::font (16.0f, true));
        g.drawText (tone.title, area.removeFromTop (22), juce::Justification::centredLeft, true);
        area.removeFromTop (4 + 20 + 8);          // creator badge

        int x = area.getX();
        x += drawBadge (g, x, area.getY(), t3k::gearLabel (tone.gear), BadgeStyle::gear) + 6;
        x += drawBadge (g, x, area.getY(), t3k::formatLabel (tone.format), BadgeStyle::format) + 6;
        if (tone.isFavorite)
            drawBadge (g, x, area.getY(), "Favorited", BadgeStyle::neutral);
        area.removeFromTop (badgeHeight + 8);

        g.setColour (theme::text3);
        g.setFont (theme::font (12.0f));
        g.drawText (toneStats (tone), area.removeFromTop (18), juce::Justification::centredLeft, true);

        if (! compact && tone.description.isNotEmpty())
        {
            area.removeFromTop (8);
            g.setColour (theme::text2);
            g.setFont (theme::font (13.0f));
            g.drawFittedText (tone.description, area.removeFromTop (juce::jmin (120, area.getHeight())), juce::Justification::topLeft, 6, 1.0f);
        }
    }

    void ToneCard::mouseUp (const juce::MouseEvent& e)
    {
        if (compact && onClick != nullptr && getLocalBounds().contains (e.getPosition()))
            onClick (tone);
    }

    ToneGrid::ToneGrid()
    {
        viewport.setViewedComponent (&content, false);
        viewport.setScrollBarsShown (true, false);
        addAndMakeVisible (viewport);
    }

    void ToneGrid::setTones (const juce::Array<t3k::Tone>& tones)
    {
        cards.clear();
        content.removeAllChildren();
        for (auto& tone : tones)
        {
            auto card = std::make_unique<ToneCard> (tone, true);
            card->onClick = [this] (const t3k::Tone& t) { if (onSelect) onSelect (t); };
            content.addAndMakeVisible (*card);
            cards.push_back (std::move (card));
        }
        loading = false;
        viewport.setViewPosition (0, 0);
        resized();
        repaint();
    }

    void ToneGrid::setLoading (bool l)
    {
        loading = l;
        if (loading)
        {
            cards.clear();
            content.removeAllChildren();
            resized();
        }
        repaint();
    }

    void ToneGrid::paint (juce::Graphics& g)
    {
        if (! cards.empty())
            return;
        g.setColour (theme::text3);
        g.setFont (theme::font (14.0f));
        g.drawText (loading ? "Loading..." : emptyMessage, getLocalBounds().withHeight (juce::jmin (getHeight(), 120)),
                    juce::Justification::centred, true);
    }

    int ToneGrid::preferredHeight (int width) const
    {
        return cards.empty() ? 120 : layoutCards (width, false);
    }

    void ToneGrid::resized()
    {
        viewport.setBounds (getLocalBounds());
        const int width = contentWidth (viewport);
        content.setSize (width, layoutCards (width, true));
    }

    int ToneGrid::layoutCards (int width, bool apply) const
    {
        const int columns = juce::jmax (1, (width + theme::gap) / (220 + theme::gap));
        const int cardWidth = (width - (columns - 1) * theme::gap) / columns;

        int x = 0, y = 0, rowHeight = 0, column = 0;
        for (auto& card : cards)
        {
            const int h = card->preferredHeight (cardWidth);
            if (apply) card->setBounds (x, y, cardWidth, h);
            rowHeight = juce::jmax (rowHeight, h);
            if (++column == columns)
            {
                column = 0;
                x = 0;
                y += rowHeight + theme::gap;
                rowHeight = 0;
            }
            else
            {
                x += cardWidth + theme::gap;
            }
        }
        return column == 0 ? juce::jmax (0, y - theme::gap) : y + rowHeight;
    }

    // ---- Pager -------------------------------------------------------------------------

    Pager::Pager()
    {
        addAndMakeVisible (prev);
        addAndMakeVisible (next);
        addAndMakeVisible (status);
        styleLabel (status, 13.0f, theme::text2, false, juce::Justification::centred);
        prev.onClick = [this] { if (onPage && current > 1) onPage (current - 1); };
        next.onClick = [this] { if (onPage && current < pages) onPage (current + 1); };
        set (1, 1, 0);
    }

    void Pager::set (int page, int totalPages, int total)
    {
        current = juce::jmax (1, page);
        pages = juce::jmax (1, totalPages);
        prev.setEnabled (current > 1);
        next.setEnabled (current < pages);
        status.setText ("Page " + juce::String (current) + " of " + juce::String (pages) + dot + t3k::formatCount (total, "tone"),
                        juce::dontSendNotification);
    }

    void Pager::resized()
    {
        auto area = getLocalBounds().withSizeKeepingCentre (juce::jmin (getWidth(), 440), theme::controlSmall);
        prev.setBounds (area.removeFromLeft (90));
        next.setBounds (area.removeFromRight (90));
        status.setBounds (area);
    }

    // ---- ModelRow / ModelList ------------------------------------------------------------

    ModelRow::ModelRow (t3k::Model m, t3k::Tone t, bool allowDownload) : model (std::move (m)), tone (std::move (t))
    {
        addAndMakeVisible (play);
        play.setEnabled (t3k::audio::isPreviewable (tone));
        play.setTooltip (play.isEnabled() ? "Preview" : t3k::formatLabel (tone.format) + " tones can't be previewed");
        play.onClick = [this]
        {
            auto& p = t3k::audio::player();
            p.togglePlay (playerId(), [theModel = model, theTone = tone] (t3k::Callback<t3k::audio::PreviewChain> done)
            {
                t3k::audio::resolvePreviewChain (theModel, theTone, std::move (done));
            });
        };

        name.setText (model.name, juce::dontSendNotification);
        styleLabel (name, 14.0f, theme::text, true);
        addAndMakeVisible (name);

        juce::StringArray meta;
        if (model.size.isNotEmpty() && model.size != "custom") meta.add (model.size);
        if (model.architectureVersion.isNotEmpty()) meta.add ("A" + model.architectureVersion);
        meta.add (model.extension().isNotEmpty() ? model.extension().substring (1).toUpperCase() : t3k::formatLabel (tone.format));
        note.setText (meta.joinIntoString (dot), juce::dontSendNotification);
        styleLabel (note, 12.0f, theme::text3);
        addAndMakeVisible (note);

        addChildComponent (downloadButton);
        downloadButton.setVisible (allowDownload);
        downloadButton.onClick = [this] { download(); };

        t3k::audio::player().addChangeListener (this);
        refresh();
    }

    ModelRow::~ModelRow()
    {
        t3k::audio::player().removeChangeListener (this);
    }

    void ModelRow::changeListenerCallback (juce::ChangeBroadcaster*)
    {
        refresh();
    }

    void ModelRow::refresh()
    {
        auto& p = t3k::audio::player();
        const bool mine = p.activeId() == playerId();
        const bool loading = p.loadingId() == playerId();
        play.setButtonText (loading ? juce::String (juce::CharPointer_UTF8 ("\xE2\x80\xA6"))              // …
                                    : (mine && p.isPlaying() ? juce::String (juce::CharPointer_UTF8 ("\xE2\x9D\x9A"))   // ❚ pause bar
                                                             : juce::String (juce::CharPointer_UTF8 ("\xE2\x96\xB6"))));  // ▶
        play.setToggleState (mine && p.isPlaying(), juce::dontSendNotification);
        progress = mine ? p.progress() : 0.0;
        if (p.lastErrorId() == playerId() && p.lastError().isNotEmpty() && p.lastError() != reportedError)
        {
            reportedError = p.lastError();
            if (onError) onError (reportedError);
        }
        repaint();
    }

    void ModelRow::download()
    {
        auto suggested = model.name.retainCharacters ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ ") + model.extension();
        auto chooser = std::make_shared<juce::FileChooser> ("Save model", juce::File::getSpecialLocation (juce::File::userDocumentsDirectory).getChildFile (suggested));
        chooser->launchAsync (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::warnAboutOverwriting,
                              scope.wrap ([this, chooser] (const juce::FileChooser& fc)
        {
            auto target = fc.getResult();
            if (target == juce::File())
                return;
            downloadButton.setEnabled (false);
            t3k::client().downloadModelFile (model, scope.wrap ([this, target] (t3k::Result<juce::File> cached)
            {
                downloadButton.setEnabled (true);
                if (! cached.ok())
                {
                    if (onError) onError (cached.error.userMessage ("Download"));
                    return;
                }
                if (! cached->copyFileTo (target) && onError)
                    onError ("Could not write " + target.getFullPathName());
            }));
        }));
    }

    void ModelRow::paint (juce::Graphics& g)
    {
        auto bounds = getLocalBounds().toFloat().reduced (0.5f);
        g.setColour (theme::surface);
        g.fillRoundedRectangle (bounds, theme::radius);
        g.setColour (theme::border);
        g.drawRoundedRectangle (bounds, theme::radius, 1.0f);
        if (progress > 0)
        {
            // Thin progress line along the bottom of the row, like the web player.
            auto track = getLocalBounds().reduced (12, 0).removeFromBottom (3).toFloat();
            g.setColour (theme::surface2);
            g.fillRoundedRectangle (track, 1.5f);
            g.setColour (theme::accent);
            g.fillRoundedRectangle (track.withWidth (track.getWidth() * (float) progress), 1.5f);
        }
    }

    void ModelRow::resized()
    {
        auto area = getLocalBounds().reduced (12, 10);
        play.setBounds (area.removeFromLeft (theme::control).withSizeKeepingCentre (theme::control, theme::control));
        area.removeFromLeft (theme::gap);
        if (downloadButton.isVisible())
        {
            downloadButton.setBounds (area.removeFromRight (96).withSizeKeepingCentre (96, theme::controlSmall));
            area.removeFromRight (theme::gap);
        }
        name.setBounds (area.removeFromTop (18));
        note.setBounds (area);
    }

    void ModelList::setModels (const juce::Array<t3k::Model>& models, const t3k::Tone& tone, bool allowDownload)
    {
        rows.clear();
        heading = (tone.format == t3k::format::ir ? "IRs (" : "Models (") + juce::String (models.size()) + ")";
        for (auto& model : models)
        {
            auto row = std::make_unique<ModelRow> (model, tone, allowDownload);
            row->onError = [this] (const juce::String& e) { if (onError) onError (e); };
            addAndMakeVisible (*row);
            rows.push_back (std::move (row));
        }
        setSize (getWidth(), preferredHeight());
        repaint();
    }

    int ModelList::preferredHeight() const
    {
        return headingHeight + (int) rows.size() * (ModelRow::height + theme::gapSmall);
    }

    void ModelList::paint (juce::Graphics& g)
    {
        g.setColour (theme::text);
        g.setFont (theme::font (16.0f, true));
        g.drawText (heading, getLocalBounds().removeFromTop (headingHeight).withTrimmedBottom (8), juce::Justification::centredLeft, true);
        if (rows.empty())
        {
            g.setColour (theme::text3);
            g.setFont (theme::font (13.0f));
            g.drawText ("No models.", getLocalBounds().withTrimmedTop (headingHeight), juce::Justification::topLeft, true);
        }
    }

    void ModelList::resized()
    {
        int y = headingHeight;
        for (auto& row : rows)
        {
            row->setBounds (0, y, getWidth(), ModelRow::height);
            y += ModelRow::height + theme::gapSmall;
        }
    }

    // ---- SuggestPicker ----------------------------------------------------------------------

    SuggestPicker::SuggestPicker (const juce::String& labelText, const juce::String& placeholder, Suggest s) : suggest (std::move (s))
    {
        label.setText (labelText, juce::dontSendNotification);
        styleLabel (label, 12.0f, theme::text2, true);
        addAndMakeVisible (label);

        styleEditor (input, placeholder);
        input.onTextChange = [this] { startTimer (250); };
        input.onReturnKey = [this]
        {
            auto text = input.getText().trim();
            if (text.isNotEmpty()) { stopTimer(); add (text); input.clear(); }
        };
        addAndMakeVisible (input);
    }

    SuggestPicker::~SuggestPicker()
    {
        stopTimer();
    }

    void SuggestPicker::setValues (const juce::StringArray& v)
    {
        chosen = v;
        rebuildChips();
    }

    void SuggestPicker::timerCallback()
    {
        stopTimer();
        auto query = input.getText().trim();
        if (query.isEmpty() || query == lastQuery)
            return;
        lastQuery = query;
        suggest (query, scope.wrap ([this, query] (juce::Array<Suggestion> results)
        {
            if (query != input.getText().trim())
                return;         // stale
            showMenu (results);
        }));
    }

    void SuggestPicker::showMenu (const juce::Array<Suggestion>& suggestions)
    {
        if (suggestions.isEmpty())
            return;
        juce::PopupMenu menu;
        int id = 1;
        for (auto& s : suggestions)
        {
            auto text = s.name + (s.hint.isNotEmpty() ? "   " + s.hint : juce::String());
            menu.addItem (id++, text, ! chosen.contains (s.name));
        }
        menu.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (input).withMinimumWidth (input.getWidth()),
                            scope.wrap ([this, suggestions] (int result)
        {
            if (result <= 0)
                return;
            add (suggestions[result - 1].name);
            input.clear();
            lastQuery.clear();
            input.grabKeyboardFocus();
        }));
    }

    void SuggestPicker::add (const juce::String& value)
    {
        if (chosen.contains (value))
            return;
        chosen.add (value);
        rebuildChips();
        if (onChange) onChange();
    }

    void SuggestPicker::remove (const juce::String& value)
    {
        chosen.removeString (value);
        rebuildChips();
        if (onChange) onChange();
    }

    void SuggestPicker::rebuildChips()
    {
        chips.clear();
        for (auto& value : chosen)
        {
            auto chip = std::make_unique<juce::TextButton> (value + juce::String (juce::CharPointer_UTF8 ("  \xC3\x97")));   // ×
            chip->setTooltip ("Remove " + value);
            style (*chip, ButtonStyle::secondary);
            chip->onClick = [this, value] { remove (value); };
            addAndMakeVisible (*chip);
            chips.push_back (std::move (chip));
        }
        if (auto* parent = getParentComponent())
            parent->resized();
        else
            resized();
    }

    int SuggestPicker::preferredHeight() const
    {
        return 18 + 4 + theme::control + (chips.empty() ? 0 : 6 + 24);
    }

    void SuggestPicker::resized()
    {
        auto area = getLocalBounds();
        label.setBounds (area.removeFromTop (18));
        area.removeFromTop (4);
        input.setBounds (area.removeFromTop (theme::control));
        if (! chips.empty())
        {
            area.removeFromTop (6);
            auto row = area.removeFromTop (24);
            for (auto& chip : chips)
            {
                int w = juce::jmin (row.getWidth(), juce::GlyphArrangement::getStringWidthInt (theme::font (12.0f), chip->getButtonText()) + 20);
                chip->setBounds (row.removeFromLeft (w));
                row.removeFromLeft (4);
            }
        }
    }

    void SuggestPicker::paint (juce::Graphics&) {}

    // ---- Panels ------------------------------------------------------------------------------------

    void drawPanel (juce::Graphics& g, juce::Rectangle<int> bounds, float radius)
    {
        auto r = bounds.toFloat().reduced (0.5f);
        g.setColour (theme::surface);
        g.fillRoundedRectangle (r, radius);
        g.setColour (theme::border);
        g.drawRoundedRectangle (r, radius, 1.0f);
    }

    void drawCaption (juce::Graphics& g, juce::Rectangle<int> bounds, const juce::String& text)
    {
        g.setColour (theme::text3);
        g.setFont (theme::font (11.0f, true));
        g.drawText (text.toUpperCase(), bounds, juce::Justification::centredLeft, true);
    }

    // ---- Field -------------------------------------------------------------------------------------

    Field::Field (const juce::String& labelText, juce::Component& c) : control (c)
    {
        label.setText (labelText, juce::dontSendNotification);
        styleLabel (label, 12.0f, theme::text2, true);
        addAndMakeVisible (label);
        addAndMakeVisible (control);
    }

    void Field::resized()
    {
        auto area = getLocalBounds();
        label.setBounds (area.removeFromTop (18));
        area.removeFromTop (4);
        control.setBounds (area.removeFromTop (theme::control));
    }
}
