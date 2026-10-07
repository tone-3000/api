#include "ToneDetail.h"

#include "T3K/Client.h"

namespace ui
{
    // ---- ToneDetailView ---------------------------------------------------------------

    ToneDetailView::ToneDetailView()
    {
        addChildComponent (hero);
        hero.setCornerRadius (10.0f);
        addChildComponent (creator);
        for (auto* l : { &title, &note, &description, &meta })
            addChildComponent (*l);
        styleLabel (title, 24.0f, theme::text, true);
        styleLabel (note, 12.0f, theme::text2);
        styleLabel (description, 14.0f, theme::text2, false, juce::Justification::topLeft);
        styleLabel (meta, 13.0f, theme::text3);

        addChildComponent (favorite);
        addChildComponent (zip);
        addChildComponent (open);
        style (favorite, ButtonStyle::secondary);
        style (zip, ButtonStyle::secondary);
        style (open, ButtonStyle::secondary);
        favorite.onClick = [this] { toggleFavorite(); };
        zip.onClick = [this] { downloadZip(); };
        open.onClick = [this] { if (data) openExternal (data->tone.url); };

        addChildComponent (models);
        models.onError = [this] (const juce::String& e) { if (onError) onError (e); };
    }

    void ToneDetailView::set (t3k::ToneWithModels tone, ToneDetailOptions o)
    {
        data = std::move (tone);
        options = std::move (o);
        render();
    }

    void ToneDetailView::clear()
    {
        data.reset();
        for (auto* c : getChildren())
            c->setVisible (false);
        repaint();
    }

    void ToneDetailView::render()
    {
        if (! data)
            return;
        auto& tone = data->tone;

        hero.setUrl (tone.images.isEmpty() ? juce::String() : tone.images[0]);
        hero.setVisible (! tone.images.isEmpty());

        title.setText (tone.title, juce::dontSendNotification);
        creator.set (tone.user, true);
        note.setText (options.note, juce::dontSendNotification);
        description.setText (tone.description, juce::dontSendNotification);

        juce::StringArray stats;
        stats.add (arrowDown + juce::String (tone.downloadsCount) + " downloads");
        stats.add (star + juce::String (tone.favoritesCount) + " favorites");
        stats.add (tone.modelCountLabel());
        stats.add ("License: " + t3k::licenseLabel (tone.license));
        if (tone.publishedAt.isNotEmpty())
            stats.add ("Published " + tone.publishedAt.substring (0, 10));
        meta.setText (stats.joinIntoString (dot), juce::dontSendNotification);

        badges.clear();
        for (auto& m : tone.makes) badges.add (m.name);
        for (auto& t : tone.tags) badges.add ("#" + t.name);

        favorite.setButtonText (tone.isFavorite ? star + "Favorited" : starOutline + "Favorite");
        favorite.setToggleState (tone.isFavorite, juce::dontSendNotification);

        for (auto* c : std::initializer_list<juce::Component*> { &title, &creator, &meta, &open, &models })
            c->setVisible (true);
        description.setVisible (tone.description.isNotEmpty());
        note.setVisible (options.note.isNotEmpty());
        favorite.setVisible (options.allowFavorite);
        zip.setVisible (options.allowDownloads);

        models.setModels (data->models, tone, options.allowDownloads);

        resized();
        repaint();
    }

    void ToneDetailView::toggleFavorite()
    {
        if (! data) return;
        auto& tone = data->tone;
        favorite.setEnabled (false);
        auto done = scope.wrap ([this, wasFavorite = tone.isFavorite] (t3k::Result<t3k::Nothing> r)
        {
            favorite.setEnabled (true);
            if (! r.ok()) { if (onError) onError (r.error.userMessage ("Updating favorite")); return; }
            data->tone.isFavorite = ! wasFavorite;
            data->tone.favoritesCount += wasFavorite ? -1 : 1;
            render();
            if (onToneChanged) onToneChanged (data->tone);
        });
        if (tone.isFavorite) t3k::client().unfavoriteTone (tone.id, done);
        else t3k::client().favoriteTone (tone.id, done);
    }

    void ToneDetailView::downloadZip()
    {
        if (! data) return;
        zip.setEnabled (false);
        t3k::client().getToneDownload (data->tone.id, scope.wrap ([this] (t3k::Result<t3k::ToneDownload> r)
        {
            zip.setEnabled (true);
            if (! r.ok())
            {
                if (onError)
                    onError (r.error.isForbidden() ? "Zip downloads are available to approved partners only. Download individual models instead."
                                                   : r.error.userMessage ("Zip download"));
                return;
            }
            // The pre-signed URL needs no auth; hand it to the browser like the web example.
            openExternal (r->url);
        }));
    }

    static int buttonWidth (const juce::TextButton& b)
    {
        return juce::GlyphArrangement::getStringWidthInt (theme::font (14.0f, true), b.getButtonText()) + 28;
    }

    int ToneDetailView::layout (int width, bool apply)
    {
        if (! data)
            return 0;
        auto& tone = data->tone;
        int y = 0;
        auto place = [&] (juce::Component& c, int height)
        {
            if (apply) c.setBounds (0, y, width, height);
            y += height;
        };

        if (hero.isVisible())
        {
            place (hero, juce::jmin (280, width * 9 / 16));
            y += 16;
        }

        // Header: title + creator on the left, gear/format badges on the right (painted).
        {
            const int badgesWidth = badgeWidth (t3k::gearLabel (tone.gear)) + 6 + badgeWidth (t3k::formatLabel (tone.format));
            if (apply) title.setBounds (0, y, juce::jmax (0, width - badgesWidth - 12), 30);
            y += 30;
        }
        y += 4;
        place (creator, 28);
        if (note.isVisible()) { y += 4; place (note, 18); }
        y += 16;

        // Actions
        {
            auto row = juce::Rectangle<int> (0, y, width, theme::control);
            for (auto* b : { &favorite, &zip, &open })
            {
                if (! b->isVisible()) continue;
                const int w = buttonWidth (*b);
                if (apply) b->setBounds (row.removeFromLeft (w));
                else row.removeFromLeft (w);
                row.removeFromLeft (theme::gapSmall);
            }
            y += theme::control + 16;
        }

        if (description.isVisible())
        {
            place (description, wrappedHeight (tone.description, description.getFont(), width));
            y += 12;
        }

        place (meta, 18);
        y += 12;

        // Make / tag badges, wrapped (painted in paint()).
        badgeRowsHeight = 0;
        if (! badges.isEmpty())
        {
            int x = 0, rows = 1;
            for (auto& b : badges)
            {
                const int w = badgeWidth (b);
                if (x > 0 && x + w > width) { x = 0; ++rows; }
                x += w + 6;
            }
            badgeRowsHeight = rows * (badgeHeight + 6);
            y += badgeRowsHeight + 12;
        }

        place (models, models.preferredHeight());
        return y;
    }

    int ToneDetailView::preferredHeight (int width)
    {
        return layout (width, false);
    }

    void ToneDetailView::resized()
    {
        layout (getWidth(), true);
    }

    void ToneDetailView::paint (juce::Graphics& g)
    {
        if (! data)
            return;
        auto& tone = data->tone;

        // Gear / format badges to the right of the title.
        int x = getWidth();
        const int by = title.getY() + 5;
        x -= badgeWidth (t3k::formatLabel (tone.format));
        drawBadge (g, x, by, t3k::formatLabel (tone.format), BadgeStyle::format);
        x -= 6 + badgeWidth (t3k::gearLabel (tone.gear));
        drawBadge (g, x, by, t3k::gearLabel (tone.gear), BadgeStyle::gear);

        if (badges.isEmpty())
            return;
        int bx = 0, y = models.getY() - 12 - badgeRowsHeight;
        for (auto& b : badges)
        {
            const int w = badgeWidth (b);
            if (bx > 0 && bx + w > getWidth()) { bx = 0; y += badgeHeight + 6; }
            drawBadge (g, bx, y, b, BadgeStyle::neutral);
            bx += w + 6;
        }
    }

    // ---- ToneDetailScreen -------------------------------------------------------------

    ToneDetailScreen::ToneDetailScreen (Navigator& n, Brand brand, int toneId, ToneDetailOptions options)
        : Screen (n, brand.name, brand.tagline, "Back")
    {
        mainMaxWidth = 720;
        viewport.setViewedComponent (&view, false);
        viewport.setScrollBarsShown (true, false);
        addAndMakeVisible (viewport);
        view.onError = [this] (const juce::String& e) { showError (e); };
        view.onToneChanged = [this] (const t3k::Tone& t) { if (onToneChanged) onToneChanged (t); };

        styleLabel (loading, 14.0f, theme::text2, false, juce::Justification::centred);
        loading.setText ("Loading tone...", juce::dontSendNotification);
        addAndMakeVisible (loading);

        t3k::client().getToneWithModels (toneId, scope.wrap ([this, options] (t3k::Result<t3k::ToneWithModels> r)
        {
            if (! r.ok())
            {
                loading.setText (r.error.isNotFound() ? "This tone is no longer available." : r.error.userMessage ("Loading the tone"),
                                 juce::dontSendNotification);
                return;
            }
            loading.setVisible (false);
            view.set (*r, options);
            resized();
        }));
    }

    ToneDetailScreen::ToneDetailScreen (Navigator& n, Brand brand, t3k::ToneWithModels tone, ToneDetailOptions options)
        : Screen (n, brand.name, brand.tagline, "Back")
    {
        mainMaxWidth = 720;
        viewport.setViewedComponent (&view, false);
        viewport.setScrollBarsShown (true, false);
        addAndMakeVisible (viewport);
        view.onError = [this] (const juce::String& e) { showError (e); };
        view.onToneChanged = [this] (const t3k::Tone& t) { if (onToneChanged) onToneChanged (t); };
        view.set (std::move (tone), std::move (options));
    }

    void ToneDetailScreen::layoutContent (juce::Rectangle<int> area)
    {
        loading.setBounds (area);
        viewport.setBounds (area);
        const int width = contentWidth (viewport);
        view.setSize (width, view.preferredHeight (width));
    }
}
