#include "FullApiDemo.h"

#include "T3K/Client.h"
#include "T3KConfig.h"
#include "ToneDetail.h"

namespace ui
{
    namespace
    {
        constexpr int kPageSize = 12;
        constexpr int kSuggestionCount = 8;
        constexpr int kSidebarWidth = 200;
        const ToneDetailScreen::Brand kBrand { "Chord Inc", "Tone Management Platform" };

        std::vector<std::pair<juce::String, juce::String>> gearItems (const juce::String& allLabel)
        {
            std::vector<std::pair<juce::String, juce::String>> items { { allLabel, "" } };
            for (auto& g : t3k::gear::all)
                items.push_back ({ t3k::gearLabel (g), g });
            return items;
        }

        juce::String comboValue (const juce::ComboBox& combo, const std::vector<std::pair<juce::String, juce::String>>& items)
        {
            auto index = combo.getSelectedId() - 1;
            return index >= 0 && index < (int) items.size() ? items[(size_t) index].second : juce::String();
        }

        void selectComboValue (juce::ComboBox& combo, const std::vector<std::pair<juce::String, juce::String>>& items, const juce::String& value)
        {
            for (size_t i = 0; i < items.size(); ++i)
                if (items[i].second == value)
                    combo.setSelectedId ((int) i + 1, juce::dontSendNotification);
        }

        juce::Label& makeSectionTitle (juce::Label& label, const juce::String& text)
        {
            label.setText (text, juce::dontSendNotification);
            styleLabel (label, 20.0f, theme::text, true);
            return label;
        }

        /// Underlined text tabs (web .tabs).
        class TabBar : public juce::Component
        {
        public:
            explicit TabBar (juce::StringArray names) : tabs (std::move (names)) {}
            std::function<void (int)> onChange;
            int selected = 0;
            static constexpr int height = 36;

            void paint (juce::Graphics& g) override
            {
                g.setColour (theme::border);
                g.fillRect (0, getHeight() - 1, getWidth(), 1);
                int x = 0;
                for (int i = 0; i < tabs.size(); ++i)
                {
                    const int w = tabWidth (i);
                    const bool active = i == selected;
                    g.setFont (theme::font (14.0f, active));
                    g.setColour (active ? theme::accent : theme::text2);
                    g.drawText (tabs[i], x, 0, w, getHeight() - 2, juce::Justification::centred, false);
                    if (active)
                    {
                        g.setColour (theme::accent);
                        g.fillRect (x, getHeight() - 2, w, 2);
                    }
                    x += w + 4;
                }
            }

            void mouseUp (const juce::MouseEvent& e) override
            {
                int x = 0;
                for (int i = 0; i < tabs.size(); ++i)
                {
                    const int w = tabWidth (i);
                    if (e.x >= x && e.x < x + w)
                    {
                        if (i != selected) { selected = i; repaint(); if (onChange) onChange (i); }
                        return;
                    }
                    x += w + 4;
                }
            }

        private:
            int tabWidth (int i) const { return juce::GlyphArrangement::getStringWidthInt (theme::font (14.0f, true), tabs[i]) + 28; }
            juce::StringArray tabs;
        };

        /// Wrapped chips (web .taxonomy-chips) inside a viewport.
        class ChipList : public juce::Component
        {
        public:
            ChipList()
            {
                viewport.setViewedComponent (&content, false);
                viewport.setScrollBarsShown (true, false);
                addAndMakeVisible (viewport);
            }

            std::function<void (int index)> onPick;

            void setItems (const juce::StringArray& names, const juce::StringArray& hints)
            {
                chips.clear();
                content.removeAllChildren();
                for (int i = 0; i < names.size(); ++i)
                {
                    auto chip = std::make_unique<juce::TextButton> (names[i] + "  " + hints[i]);
                    style (*chip, ButtonStyle::secondary);
                    chip->setTooltip ("Search tones with this");
                    chip->onClick = [this, i] { if (onPick) onPick (i); };
                    content.addAndMakeVisible (*chip);
                    chips.push_back (std::move (chip));
                }
                loading = false;
                resized();
                repaint();
            }

            void setLoading() { loading = true; chips.clear(); content.removeAllChildren(); repaint(); }

            void paint (juce::Graphics& g) override
            {
                if (! chips.empty()) return;
                g.setColour (theme::text3);
                g.setFont (theme::font (13.0f));
                g.drawText (loading ? "Loading..." : "No matches.", getLocalBounds().withHeight (40), juce::Justification::centredLeft, true);
            }

            void resized() override
            {
                viewport.setBounds (getLocalBounds());
                const int width = contentWidth (viewport);
                int x = 0, y = 0;
                for (auto& chip : chips)
                {
                    const int w = juce::jmin (width, juce::GlyphArrangement::getStringWidthInt (theme::font (13.0f), chip->getButtonText()) + 24);
                    if (x > 0 && x + w > width) { x = 0; y += theme::controlSmall + 6; }
                    chip->setBounds (x, y, w, theme::controlSmall);
                    x += w + 6;
                }
                content.setSize (width, chips.empty() ? 0 : y + theme::controlSmall);
            }

        private:
            juce::Viewport viewport;
            juce::Component content;
            std::vector<std::unique_ptr<juce::TextButton>> chips;
            bool loading = false;
        };

        /// Creator rows: avatar, name (+ verified), stats; click to search their tones.
        class CreatorList : public juce::Component
        {
        public:
            CreatorList()
            {
                viewport.setViewedComponent (&content, false);
                viewport.setScrollBarsShown (true, false);
                addAndMakeVisible (viewport);
            }

            std::function<void (const t3k::PublicUser&)> onPick;

            void setUsers (const juce::Array<t3k::PublicUser>& users)
            {
                rows.clear();
                content.removeAllChildren();
                for (auto& u : users)
                {
                    auto row = std::make_unique<Row> (u);
                    row->onClick = [this] (const t3k::PublicUser& user) { if (onPick) onPick (user); };
                    content.addAndMakeVisible (*row);
                    rows.push_back (std::move (row));
                }
                loading = false;
                resized();
                repaint();
            }

            void setLoading() { loading = true; rows.clear(); content.removeAllChildren(); repaint(); }

            void paint (juce::Graphics& g) override
            {
                if (! rows.empty()) return;
                g.setColour (theme::text3);
                g.setFont (theme::font (13.0f));
                g.drawText (loading ? "Loading..." : "No creators found.", getLocalBounds().withHeight (40), juce::Justification::centredLeft, true);
            }

            void resized() override
            {
                viewport.setBounds (getLocalBounds());
                const int width = contentWidth (viewport);
                int y = 0;
                for (auto& row : rows)
                {
                    row->setBounds (0, y, width, Row::height);
                    y += Row::height + theme::gapSmall;
                }
                content.setSize (width, juce::jmax (0, y - theme::gapSmall));
            }

        private:
            class Row : public juce::Component
            {
            public:
                static constexpr int height = 60;
                explicit Row (t3k::PublicUser u) : user (std::move (u))
                {
                    badge.set (user, true);
                    badge.setInterceptsMouseClicks (false, false);
                    addAndMakeVisible (badge);
                    setMouseCursor (juce::MouseCursor::PointingHandCursor);
                }
                std::function<void (const t3k::PublicUser&)> onClick;
                void resized() override { badge.setBounds (getLocalBounds().reduced (14, 0).removeFromTop (34).withY (8)); }
                void mouseEnter (const juce::MouseEvent&) override { hover = true; repaint(); }
                void mouseExit (const juce::MouseEvent&) override { hover = false; repaint(); }
                void mouseUp (const juce::MouseEvent& e) override { if (onClick && getLocalBounds().contains (e.getPosition())) onClick (user); }
                void paint (juce::Graphics& g) override
                {
                    auto r = getLocalBounds().toFloat().reduced (0.5f);
                    g.setColour (theme::surface);
                    g.fillRoundedRectangle (r, theme::radius);
                    g.setColour (hover ? theme::accent.withAlpha (0.6f) : theme::border);
                    g.drawRoundedRectangle (r, theme::radius, 1.0f);
                    g.setColour (theme::text3);
                    g.setFont (theme::font (12.0f));
                    g.drawText (t3k::formatCount (user.tonesCount, "tone") + dot + t3k::formatCount (user.modelsCount, "model")
                                    + dot + t3k::formatCount (user.downloadsCount, "download"),
                                getLocalBounds().reduced (14, 0).withTrimmedTop (36).withHeight (16), juce::Justification::centredLeft, true);
                }
            private:
                t3k::PublicUser user;
                CreatorBadge badge;
                bool hover = false;
            };

            juce::Viewport viewport;
            juce::Component content;
            std::vector<std::unique_ptr<Row>> rows;
            bool loading = false;
        };
    }

    // ---- Sidebar ---------------------------------------------------------------------------

    class FullApiDemoScreen::SidebarItem : public juce::Button
    {
    public:
        explicit SidebarItem (const juce::String& name) : juce::Button (name) { setClickingTogglesState (false); }

        void paintButton (juce::Graphics& g, bool highlighted, bool) override
        {
            const bool active = getToggleState();
            if (active || highlighted)
            {
                g.setColour (active ? theme::accent.withAlpha (0.08f) : theme::surface2);
                g.fillRoundedRectangle (getLocalBounds().toFloat(), theme::radius);
            }
            g.setColour (active ? theme::accent : theme::text2);
            g.setFont (theme::font (14.0f, active));
            g.drawText (getButtonText(), getLocalBounds().reduced (12, 0), juce::Justification::centredLeft, true);
        }
    };

    // ---- Section base --------------------------------------------------------------------------

    class FullApiDemoScreen::Section : public juce::Component
    {
    public:
        explicit Section (FullApiDemoScreen& o) : owner (o) {}
        /// Called when the section becomes visible.
        virtual void activate() {}

    protected:
        FullApiDemoScreen& owner;
        t3k::AsyncScope scope;
        bool loaded = false;
    };

    // ---- Your Tones ---------------------------------------------------------------------

    class FullApiDemoScreen::LibrarySection : public Section, private juce::Timer
    {
    public:
        explicit LibrarySection (FullApiDemoScreen& o) : Section (o)
        {
            addAndMakeVisible (makeSectionTitle (title, "Your Tones"));
            tabs.onChange = [this] (int) { page = 1; load(); };
            addAndMakeVisible (tabs);
            styleEditor (query, "Filter by title...");
            query.onTextChange = [this] { startTimer (300); };
            addAndMakeVisible (query);
            fillCombo (gear, gears);
            gear.onChange = [this] { page = 1; load(); };
            addAndMakeVisible (gear);
            grid.onSelect = [this] (const t3k::Tone& t) { owner.openTone (t); };
            grid.setEmptyMessage ("Nothing here yet.");
            addAndMakeVisible (grid);
            pager.onPage = [this] (int p) { page = p; load(); };
            addAndMakeVisible (pager);
        }

        ~LibrarySection() override { stopTimer(); }

        void activate() override { if (! loaded) load(); }

        void load()
        {
            loaded = true;
            grid.setLoading (true);
            t3k::ListLibraryParams params;
            params.page = page;
            params.pageSize = kPageSize;
            params.gear = comboValue (gear, gears);
            params.query = query.getText().trim();
            auto done = scope.wrap ([this] (t3k::Result<t3k::Page<t3k::Tone>> r)
            {
                if (! r.ok()) { grid.setTones ({}); owner.reportError (r.error, "Loading your tones"); return; }
                grid.setTones (r->data);
                pager.set (r->page, r->totalPages, r->total);
            });
            switch (tabs.selected)
            {
                case 1:  t3k::client().listCreatedTones (params, done); break;
                case 2:  t3k::client().listDownloadedTones (params, done); break;
                default: t3k::client().listFavoritedTones (params, done); break;
            }
        }

        void resized() override
        {
            auto area = getLocalBounds();
            title.setBounds (area.removeFromTop (28));
            area.removeFromTop (16);
            tabs.setBounds (area.removeFromTop (TabBar::height));
            area.removeFromTop (16);
            auto row = area.removeFromTop (theme::control);
            gear.setBounds (row.removeFromRight (180));
            row.removeFromRight (theme::gapSmall);
            query.setBounds (row);
            area.removeFromTop (20);
            pager.setBounds (area.removeFromBottom (Pager::height));
            grid.setBounds (area);
        }

    private:
        void timerCallback() override { stopTimer(); page = 1; load(); }

        const std::vector<std::pair<juce::String, juce::String>> gears = gearItems ("All Gear");
        juce::Label title;
        TabBar tabs { { "Favorites", "Created", "Downloaded" } };
        juce::TextEditor query;
        juce::ComboBox gear;
        ToneGrid grid;
        Pager pager;
        int page = 1;
    };

    // ---- Discover -------------------------------------------------------------------------

    class FullApiDemoScreen::DiscoverSection : public Section
    {
    public:
        explicit DiscoverSection (FullApiDemoScreen& o) : Section (o)
        {
            viewport.setViewedComponent (&content, false);
            viewport.setScrollBarsShown (true, false);
            addAndMakeVisible (viewport);

            content.addAndMakeVisible (makeSectionTitle (trendingTitle, "Trending"));
            content.addAndMakeVisible (makeSectionTitle (latestTitle, "Latest"));
            fillCombo (gear, gears);
            gear.onChange = [this] { loadTrending(); };
            content.addAndMakeVisible (gear);
            for (auto* grid : { &trending, &latest })
            {
                grid->onSelect = [this] (const t3k::Tone& t) { owner.openTone (t); };
                content.addAndMakeVisible (*grid);
            }
        }

        void activate() override
        {
            if (loaded) return;
            loaded = true;
            loadTrending();
            latest.setLoading (true);
            t3k::client().listLatestTones (scope.wrap ([this] (t3k::Result<juce::Array<t3k::Tone>> r)
            {
                if (! r.ok()) { latest.setTones ({}); owner.reportError (r.error, "Loading latest tones"); return; }
                latest.setTones (*r);
                resized();
            }));
        }

        void loadTrending()
        {
            trending.setLoading (true);
            t3k::client().listTrendingTones (comboValue (gear, gears), scope.wrap ([this] (t3k::Result<juce::Array<t3k::Tone>> r)
            {
                if (! r.ok()) { trending.setTones ({}); owner.reportError (r.error, "Loading trending tones"); return; }
                trending.setTones (*r);
                resized();
            }));
        }

        void resized() override
        {
            viewport.setBounds (getLocalBounds());
            const int width = contentWidth (viewport);
            int y = 0;
            auto header = juce::Rectangle<int> (0, y, width, theme::control);
            gear.setBounds (header.removeFromRight (180));
            trendingTitle.setBounds (header);
            y += theme::control + 20;
            int h = trending.preferredHeight (width);
            trending.setBounds (0, y, width, h);
            y += h + 32;
            latestTitle.setBounds (0, y, width, theme::control);
            y += theme::control + 20;
            h = latest.preferredHeight (width);
            latest.setBounds (0, y, width, h);
            y += h;
            content.setSize (width, y);
        }

    private:
        const std::vector<std::pair<juce::String, juce::String>> gears = gearItems ("All Gear");
        juce::Viewport viewport;
        juce::Component content;
        juce::Label trendingTitle, latestTitle;
        juce::ComboBox gear;
        ToneGrid trending, latest;
    };

    // ---- Search -----------------------------------------------------------------------------

    class FullApiDemoScreen::SearchSection : public Section
    {
    public:
        explicit SearchSection (FullApiDemoScreen& o)
            : Section (o),
              tags ("Tags", "Type to find tags...", suggestTaxonomy (true)),
              makes ("Makes", "Type to find makes...", suggestTaxonomy (false)),
              creators ("Creators", "Type to find creators...", suggestCreators())
        {
            addAndMakeVisible (makeSectionTitle (title, "Search"));
            styleEditor (query, "Search tones...");
            query.onReturnKey = [this] { page = 1; load(); };
            addAndMakeVisible (query);
            style (search, ButtonStyle::primary);
            search.onClick = [this] { page = 1; load(); };
            addAndMakeVisible (search);

            fillCombo (gear, gears);
            fillCombo (format, formats);
            fillCombo (sort, sorts);
            for (auto* combo : { &gear, &format, &sort })
                combo->onChange = [this] { page = 1; load(); };
            addAndMakeVisible (panel);
            panel.addAndMakeVisible (gearField);
            panel.addAndMakeVisible (formatField);
            panel.addAndMakeVisible (sortField);
            for (auto* toggle : { &calibrated, &verified })
            {
                toggle->onClick = [this] { page = 1; load(); };
                panel.addAndMakeVisible (*toggle);
            }
            for (auto* picker : { &tags, &makes, &creators })
            {
                picker->onChange = [this] { page = 1; resized(); load(); };
                panel.addAndMakeVisible (*picker);
            }
            hint.setText ("Tags, makes and creators are looked up as you type (GET /tags, /makes, /users). "
                          "Results are limited to architecture " + juce::String (t3k::config::demoArchitecture) + " NAM models.",
                          juce::dontSendNotification);
            styleLabel (hint, 12.0f, theme::text3, false, juce::Justification::topLeft);
            panel.addAndMakeVisible (hint);
            panel.onPaint = [this] (juce::Graphics& g) { drawPanel (g, panel.getLocalBounds()); };

            grid.onSelect = [this] (const t3k::Tone& t) { owner.openTone (t); };
            grid.setEmptyMessage ("No tones match these filters.");
            addAndMakeVisible (grid);
            pager.onPage = [this] (int p) { page = p; load(); };
            addAndMakeVisible (pager);
        }

        void activate() override { if (! loaded) load(); }

        /// Apply filters from another section (make / tag / creator) and search.
        void apply (const t3k::SearchTonesParams& params)
        {
            query.setText (params.query, false);
            selectComboValue (gear, gears, params.gears.isEmpty() ? juce::String() : params.gears[0]);
            if (params.format.isNotEmpty()) selectComboValue (format, formats, params.format);
            tags.setValues (params.tags);
            makes.setValues (params.makes);
            creators.setValues (params.creators);
            page = 1;
            resized();
            load();
        }

        void load()
        {
            loaded = true;
            grid.setLoading (true);

            t3k::SearchTonesParams p;
            p.page = page;
            p.pageSize = kPageSize;
            p.query = query.getText().trim();
            p.sort = comboValue (sort, sorts);
            if (auto g = comboValue (gear, gears); g.isNotEmpty()) p.gears.add (g);
            p.format = comboValue (format, formats);
            p.tags = tags.values();
            p.makes = makes.values();
            p.creators = creators.values();
            p.calibrated = calibrated.getToggleState();
            p.verified = verified.getToggleState();
            p.architecture = t3k::config::demoArchitecture;     // always request A2 models

            t3k::client().searchTones (p, scope.wrap ([this] (t3k::Result<t3k::Page<t3k::Tone>> r)
            {
                if (! r.ok()) { grid.setTones ({}); owner.reportError (r.error, "Search"); return; }
                grid.setTones (r->data);
                pager.set (r->page, r->totalPages, r->total);
            }));
        }

        void resized() override
        {
            auto area = getLocalBounds();
            title.setBounds (area.removeFromTop (28));
            area.removeFromTop (16);
            auto row = area.removeFromTop (theme::control);
            search.setBounds (row.removeFromRight (90));
            row.removeFromRight (theme::gapSmall);
            query.setBounds (row);
            area.removeFromTop (12);

            // Filter panel
            const int pad = 16;
            const int inner = area.getWidth() - pad * 2;
            const int pickerHeight = juce::jmax (tags.preferredHeight(), makes.preferredHeight(), creators.preferredHeight());
            const int hintHeight = wrappedHeight (hint.getText(), hint.getFont(), inner);
            const int panelHeight = pad + Field::height + 12 + theme::controlSmall + 12 + pickerHeight + 10 + hintHeight + pad;
            panel.setBounds (area.removeFromTop (panelHeight));
            auto inside = panel.getLocalBounds().reduced (pad);
            auto fields = inside.removeFromTop (Field::height);
            const int fieldWidth = (inner - theme::gap * 2) / 3;
            gearField.setBounds (fields.removeFromLeft (fieldWidth)); fields.removeFromLeft (theme::gap);
            formatField.setBounds (fields.removeFromLeft (fieldWidth)); fields.removeFromLeft (theme::gap);
            sortField.setBounds (fields);
            inside.removeFromTop (12);
            auto toggles = inside.removeFromTop (theme::controlSmall);
            calibrated.setBounds (toggles.removeFromLeft (120)); toggles.removeFromLeft (theme::gap);
            verified.setBounds (toggles.removeFromLeft (160));
            inside.removeFromTop (12);
            auto pickers = inside.removeFromTop (pickerHeight);
            tags.setBounds (pickers.removeFromLeft (fieldWidth)); pickers.removeFromLeft (theme::gap);
            makes.setBounds (pickers.removeFromLeft (fieldWidth)); pickers.removeFromLeft (theme::gap);
            creators.setBounds (pickers);
            inside.removeFromTop (10);
            hint.setBounds (inside.removeFromTop (hintHeight));

            area.removeFromTop (20);
            pager.setBounds (area.removeFromBottom (Pager::height));
            grid.setBounds (area);
        }

    private:
        static SuggestPicker::Suggest suggestTaxonomy (bool isTags)
        {
            return [isTags] (const juce::String& q, std::function<void (juce::Array<Suggestion>)> done)
            {
                t3k::ListTaxonomyParams p;
                p.query = q;
                p.pageSize = kSuggestionCount;
                p.sort = t3k::taxonomySort::tones;
                auto cb = [done] (t3k::Result<t3k::Page<t3k::Taxonomy>> r)
                {
                    juce::Array<Suggestion> out;
                    if (r.ok())
                        for (auto& t : r->data)
                            out.add ({ t.name, t3k::formatCount (t.tonesCount, "tone") });
                    done (out);
                };
                if (isTags) t3k::client().listTags (p, cb);
                else t3k::client().listMakes (p, cb);
            };
        }

        static SuggestPicker::Suggest suggestCreators()
        {
            return [] (const juce::String& q, std::function<void (juce::Array<Suggestion>)> done)
            {
                t3k::ListUsersParams p;
                p.query = q;
                p.pageSize = kSuggestionCount;
                p.sort = t3k::usersSort::tones;
                t3k::client().listUsers (p, [done] (t3k::Result<t3k::Page<t3k::PublicUser>> r)
                {
                    juce::Array<Suggestion> out;
                    if (r.ok())
                        for (auto& u : r->data)
                            out.add ({ u.username, u.displayName });
                    done (out);
                });
            };
        }

        const std::vector<std::pair<juce::String, juce::String>> gears = gearItems ("All Gear");
        const std::vector<std::pair<juce::String, juce::String>> formats { { "NAM", "nam" }, { "IR", "ir" } };
        const std::vector<std::pair<juce::String, juce::String>> sorts {
            { "Best match", t3k::tonesSort::bestMatch }, { "Newest", t3k::tonesSort::newest }, { "Oldest", t3k::tonesSort::oldest },
            { "Trending", t3k::tonesSort::trending }, { "Most downloaded", t3k::tonesSort::downloadsAllTime },
        };
        juce::Label title, hint;
        juce::TextEditor query;
        juce::TextButton search { "Search" };
        Canvas panel;
        juce::ComboBox gear, format, sort;
        Field gearField { "Gear", gear }, formatField { "Format", format }, sortField { "Sort", sort };
        juce::ToggleButton calibrated { "Calibrated only" }, verified { "Verified creators" };
        SuggestPicker tags, makes, creators;
        ToneGrid grid;
        Pager pager;
        int page = 1;
    };

    // ---- Makes & Tags -------------------------------------------------------------------------

    class FullApiDemoScreen::TaxonomySection : public Section, private juce::Timer
    {
    public:
        explicit TaxonomySection (FullApiDemoScreen& o) : Section (o)
        {
            addAndMakeVisible (makeSectionTitle (makesTitle, "Makes"));
            addAndMakeVisible (makeSectionTitle (tagsTitle, "Tags"));
            styleEditor (makesQuery, "Search makes...");
            styleEditor (tagsQuery, "Search tags...");
            makesQuery.onTextChange = [this] { startTimer (300); };
            tagsQuery.onTextChange = [this] { startTimer (300); };
            addAndMakeVisible (makesQuery);
            addAndMakeVisible (tagsQuery);
            makesList.onPick = [this] (int i) { t3k::SearchTonesParams p; p.makes.add (makeNames[i]); owner.searchFor (p); };
            tagsList.onPick = [this] (int i) { t3k::SearchTonesParams p; p.tags.add (tagNames[i]); owner.searchFor (p); };
            addAndMakeVisible (makesList);
            addAndMakeVisible (tagsList);
        }

        ~TaxonomySection() override { stopTimer(); }

        void activate() override { if (! loaded) { loaded = true; loadMakes(); loadTags(); } }

        void loadMakes()
        {
            makesList.setLoading();
            t3k::ListTaxonomyParams p;
            p.query = makesQuery.getText().trim();
            p.pageSize = 40;
            p.sort = t3k::taxonomySort::tones;
            t3k::client().listMakes (p, scope.wrap ([this] (t3k::Result<t3k::Page<t3k::Taxonomy>> r)
            {
                if (! r.ok()) { makesList.setItems ({}, {}); owner.reportError (r.error, "Loading makes"); return; }
                makeNames.clear();
                juce::StringArray hints;
                for (auto& m : r->data) { makeNames.add (m.name); hints.add (juce::String (m.tonesCount)); }
                makesList.setItems (makeNames, hints);
            }));
        }

        void loadTags()
        {
            tagsList.setLoading();
            t3k::ListTaxonomyParams p;
            p.query = tagsQuery.getText().trim();
            p.pageSize = 40;
            p.sort = t3k::taxonomySort::tones;
            t3k::client().listTags (p, scope.wrap ([this] (t3k::Result<t3k::Page<t3k::Taxonomy>> r)
            {
                if (! r.ok()) { tagsList.setItems ({}, {}); owner.reportError (r.error, "Loading tags"); return; }
                tagNames.clear();
                juce::StringArray hints;
                for (auto& t : r->data) { tagNames.add (t.name); hints.add (juce::String (t.tonesCount)); }
                tagsList.setItems (tagNames, hints);
            }));
        }

        void resized() override
        {
            auto area = getLocalBounds();
            auto left = area.removeFromLeft (area.getWidth() / 2 - 16);
            area.removeFromLeft (32);
            auto column = [] (juce::Rectangle<int> c, juce::Label& l, juce::TextEditor& e, ChipList& list)
            {
                l.setBounds (c.removeFromTop (28));
                c.removeFromTop (12);
                e.setBounds (c.removeFromTop (theme::control));
                c.removeFromTop (16);
                list.setBounds (c);
            };
            column (left, makesTitle, makesQuery, makesList);
            column (area, tagsTitle, tagsQuery, tagsList);
        }

    private:
        void timerCallback() override { stopTimer(); loadMakes(); loadTags(); }

        juce::Label makesTitle, tagsTitle;
        juce::TextEditor makesQuery, tagsQuery;
        ChipList makesList, tagsList;
        juce::StringArray makeNames, tagNames;
    };

    // ---- Creators ---------------------------------------------------------------------------------

    class FullApiDemoScreen::CreatorsSection : public Section, private juce::Timer
    {
    public:
        explicit CreatorsSection (FullApiDemoScreen& o) : Section (o)
        {
            addAndMakeVisible (makeSectionTitle (title, "Creators"));
            styleEditor (query, "Search usernames...");
            query.onTextChange = [this] { startTimer (300); };
            addAndMakeVisible (query);
            fillCombo (sort, sorts);
            sort.onChange = [this] { load(); };
            addAndMakeVisible (sort);
            list.onPick = [this] (const t3k::PublicUser& u) { t3k::SearchTonesParams p; p.creators.add (u.username); owner.searchFor (p); };
            addAndMakeVisible (list);
        }

        ~CreatorsSection() override { stopTimer(); }

        void activate() override { if (! loaded) load(); }

        void load()
        {
            loaded = true;
            list.setLoading();
            t3k::ListUsersParams p;
            p.query = query.getText().trim();
            p.sort = comboValue (sort, sorts);
            p.pageSize = 25;
            t3k::client().listUsers (p, scope.wrap ([this] (t3k::Result<t3k::Page<t3k::PublicUser>> r)
            {
                if (! r.ok()) { list.setUsers ({}); owner.reportError (r.error, "Loading creators"); return; }
                list.setUsers (r->data);
            }));
        }

        void resized() override
        {
            auto area = getLocalBounds();
            title.setBounds (area.removeFromTop (28));
            area.removeFromTop (16);
            auto row = area.removeFromTop (theme::control);
            sort.setBounds (row.removeFromRight (180));
            row.removeFromRight (theme::gapSmall);
            query.setBounds (row);
            area.removeFromTop (20);
            list.setBounds (area);
        }

    private:
        void timerCallback() override { stopTimer(); load(); }

        const std::vector<std::pair<juce::String, juce::String>> sorts {
            { "Most tones", t3k::usersSort::tones }, { "Most downloads", t3k::usersSort::downloads },
            { "Most favorites", t3k::usersSort::favorites }, { "Most models", t3k::usersSort::models },
        };
        juce::Label title;
        juce::TextEditor query;
        juce::ComboBox sort;
        CreatorList list;
    };

    // ---- Profile -----------------------------------------------------------------------------------

    class FullApiDemoScreen::ProfileSection : public Section
    {
    public:
        explicit ProfileSection (FullApiDemoScreen& o) : Section (o)
        {
            addAndMakeVisible (makeSectionTitle (title, "Profile"));
            avatar.setCircular (true);
            addAndMakeVisible (avatar);
            styleLabel (name, 20.0f, theme::text, true);
            addAndMakeVisible (name);
            styleLabel (username, 13.0f, theme::text2);
            addAndMakeVisible (username);
            styleLabel (bio, 14.0f, theme::text2, false, juce::Justification::topLeft);
            addAndMakeVisible (bio);
            styleLabel (meta, 12.0f, theme::text3);
            addAndMakeVisible (meta);
            style (open, ButtonStyle::secondary);
            open.onClick = [this] { if (url.isNotEmpty()) openExternal (url); };
            addChildComponent (open);
        }

        void activate() override
        {
            if (loaded) return;
            loaded = true;
            name.setText ("Loading...", juce::dontSendNotification);
            t3k::client().getUser (scope.wrap ([this] (t3k::Result<t3k::User> r)
            {
                if (! r.ok()) { owner.reportError (r.error, "Loading your profile"); return; }
                avatar.setUrl (r->avatarUrl);
                name.setText (r->creatorName(), juce::dontSendNotification);
                username.setText ("@" + r->username + (r->isVerified ? dot + "Verified" : juce::String()), juce::dontSendNotification);
                bio.setText (r->bio, juce::dontSendNotification);
                meta.setText ("Member since " + r->createdAt.substring (0, 10), juce::dontSendNotification);
                links.clear();
                for (auto& link : r->links)
                {
                    auto button = std::make_unique<juce::HyperlinkButton> (link, juce::URL (link));
                    button->setFont (theme::font (13.0f), false, juce::Justification::centredLeft);
                    button->setColour (juce::HyperlinkButton::textColourId, theme::accent);
                    addAndMakeVisible (*button);
                    links.push_back (std::move (button));
                }
                url = r->url;
                open.setVisible (url.isNotEmpty());
                resized();
            }));
        }

        void resized() override
        {
            auto area = getLocalBounds().withWidth (juce::jmin (getWidth(), 480));
            title.setBounds (area.removeFromTop (28));
            area.removeFromTop (20);
            avatar.setBounds (area.removeFromTop (64).removeFromLeft (64));
            area.removeFromTop (12);
            name.setBounds (area.removeFromTop (26));
            username.setBounds (area.removeFromTop (20));
            area.removeFromTop (12);
            bio.setBounds (area.removeFromTop (juce::jmax (0, wrappedHeight (bio.getText(), bio.getFont(), area.getWidth()))));
            area.removeFromTop (12);
            for (auto& link : links)
                link->setBounds (area.removeFromTop (22));
            area.removeFromTop (4);
            meta.setBounds (area.removeFromTop (18));
            area.removeFromTop (16);
            open.setBounds (area.removeFromTop (theme::control).removeFromLeft (160));
        }

    private:
        juce::Label title, name, username, bio, meta;
        RemoteImage avatar { RemoteImage::Kind::avatar };
        std::vector<std::unique_ptr<juce::HyperlinkButton>> links;
        juce::TextButton open { "View on TONE3000" };
        juce::String url;
    };

    // ---- Screen ----------------------------------------------------------------------------------------

    FullApiDemoScreen::FullApiDemoScreen (Navigator& n) : Screen (n, kBrand.name, kBrand.tagline, "All Demos")
    {
        connectState.set (juce::String (juce::CharPointer_UTF8 ("Chord Inc \xC3\x97 TONE3000")),
                          "Chord Inc has partnered with TONE3000 to give you access to a massive library of Neural Amp Modeler (NAM) "
                          "captures and IRs of real analog gear, created by a global community of musicians. "
                          "Sign-in opens tone3000.com in your browser; the app receives the redirect on a loopback port.");
        connectState.action.setButtonText ("Continue with TONE3000");
        connectState.action.setVisible (true);
        connectState.action.onClick = [this] { connect(); };
        addAndMakeVisible (connectState);
        style (cancel, ButtonStyle::ghost);
        cancel.onClick = [this] { if (flow) flow->cancel(); };
        addChildComponent (cancel);

        style (browseButton, ButtonStyle::secondary);
        browseButton.onClick = [] { openExternal (juce::String (t3k::config::apiOrigin) + "/tones"); };
        style (disconnectButton, ButtonStyle::ghost);
        disconnectButton.onClick = [this] { disconnect(); };
        addHeaderAction (disconnectButton, 100);
        addHeaderAction (browseButton, 150);
        addHeaderAction (userBadge, 160);

        const char* names[] = { "Your Tones", "Discover", "Search", "Makes & Tags", "Creators", "Profile" };
        for (int i = 0; i < (int) std::size (names); ++i)
        {
            auto item = std::make_unique<SidebarItem> (names[i]);
            item->onClick = [this, i] { showSection (i); };
            addChildComponent (*item);
            sidebar.push_back (std::move (item));
        }

        t3k::client().addChangeListener (this);
        refreshConnectionState();
    }

    FullApiDemoScreen::~FullApiDemoScreen()
    {
        t3k::client().removeChangeListener (this);
    }

    void FullApiDemoScreen::changeListenerCallback (juce::ChangeBroadcaster*)
    {
        if (connected && ! t3k::client().isConnected())
            showError ("Your TONE3000 session has ended. Connect again.");
        refreshConnectionState();
    }

    void FullApiDemoScreen::refreshConnectionState()
    {
        connected = t3k::client().isConnected();
        connectState.setVisible (! connected);
        cancel.setVisible (! connected && flow != nullptr);
        disconnectButton.setVisible (connected);
        browseButton.setVisible (connected);
        userBadge.setVisible (connected);
        for (auto& item : sidebar) item->setVisible (connected);
        mainMaxWidth = connected ? 0 : theme::mainMaxWidth;
        contentPadding = connected ? 0 : theme::pad;
        manualBanner = true;

        if (connected && sections.empty())
        {
            sections.push_back (std::make_unique<LibrarySection> (*this));
            sections.push_back (std::make_unique<DiscoverSection> (*this));
            auto search = std::make_unique<SearchSection> (*this);
            searchSection = search.get();
            sections.push_back (std::move (search));
            sections.push_back (std::make_unique<TaxonomySection> (*this));
            sections.push_back (std::make_unique<CreatorsSection> (*this));
            sections.push_back (std::make_unique<ProfileSection> (*this));
            for (auto& s : sections) addChildComponent (*s);
            showSection (0);

            t3k::client().getUser (scope.wrap ([this] (t3k::Result<t3k::User> r)
            {
                if (r.ok()) userBadge.set (*r, false);
            }));
        }
        else if (! connected && ! sections.empty())
        {
            sections.clear();
            searchSection = nullptr;
        }
        resized();
    }

    void FullApiDemoScreen::showSection (int index)
    {
        current = index;
        for (size_t i = 0; i < sections.size(); ++i)
        {
            sections[i]->setVisible ((int) i == index);
            sidebar[i]->setToggleState ((int) i == index, juce::dontSendNotification);
        }
        sections[(size_t) index]->activate();
        resized();
    }

    void FullApiDemoScreen::connect()
    {
        clearBanner();
        t3k::FlowRequest request;
        request.kind = t3k::FlowRequest::Kind::login;
        flow = t3k::makeAuthFlow (t3k::FlowMode::systemBrowser);
        connectState.action.setEnabled (false);
        connectState.set ("Waiting for TONE3000...", "Finish signing in in your browser. You'll be brought back here automatically.");
        cancel.setVisible (true);
        resized();
        flow->start (request, scope.wrap ([this] (t3k::FlowResult r)
        {
            juce::MessageManager::callAsync ([f = std::shared_ptr<t3k::AuthFlow> (flow.release())] { juce::ignoreUnused (f); });
            connectState.action.setEnabled (true);
            connectState.set (juce::String (juce::CharPointer_UTF8 ("Chord Inc \xC3\x97 TONE3000")),
                              "Chord Inc has partnered with TONE3000 to give you access to a massive library of Neural Amp Modeler (NAM) "
                              "captures and IRs of real analog gear, created by a global community of musicians. "
                              "Sign-in opens tone3000.com in your browser; the app receives the redirect on a loopback port.");
            cancel.setVisible (false);
            if (r.status == t3k::FlowResult::Status::failed)
                showError ("Sign-in failed: " + r.error);
            resized();
            // Connected: the client's change message rebuilds the screen.
        }));
    }

    void FullApiDemoScreen::disconnect()
    {
        t3k::audio::player().stop();
        t3k::client().clearTokens();
    }

    void FullApiDemoScreen::openTone (const t3k::Tone& tone)
    {
        ToneDetailOptions options;
        options.allowFavorite = true;
        options.allowDownloads = true;
        nav.push (std::make_unique<ToneDetailScreen> (nav, kBrand, tone.id, options));
    }

    void FullApiDemoScreen::searchFor (const t3k::SearchTonesParams& params)
    {
        if (searchSection == nullptr) return;
        showSection (2);
        searchSection->apply (params);
    }

    void FullApiDemoScreen::reportError (const t3k::Error& error, const juce::String& context)
    {
        showError (error.userMessage (context));
    }

    void FullApiDemoScreen::paint (juce::Graphics& g)
    {
        Screen::paint (g);
        if (connected && ! sidebarArea.isEmpty())
        {
            g.setColour (theme::surface);
            g.fillRect (sidebarArea);
            g.setColour (theme::border);
            g.fillRect (sidebarArea.removeFromRight (1));
        }
    }

    void FullApiDemoScreen::layoutContent (juce::Rectangle<int> area)
    {
        if (! connected)
        {
            sidebarArea = {};
            placeBanner (area);
            auto block = area.withSizeKeepingCentre (juce::jmin (area.getWidth(), 480), juce::jmin (area.getHeight(), 320));
            connectState.setBounds (block);
            cancel.setBounds (block.removeFromBottom (theme::controlSmall).withSizeKeepingCentre (90, theme::controlSmall));
            return;
        }

        sidebarArea = area.removeFromLeft (kSidebarWidth);
        auto items = sidebarArea.reduced (16);
        for (auto& item : sidebar)
        {
            item->setBounds (items.removeFromTop (40));
            items.removeFromTop (4);
        }

        auto main = area.reduced (theme::pad);
        placeBanner (main);
        for (auto& section : sections)
            section->setBounds (main);
    }
}
