#include "LoadToneDemo.h"

#include "T3K/Client.h"

#include <algorithm>

namespace ui
{
    // ---- Presets --------------------------------------------------------------------

    Preset Preset::fromTone (const t3k::Tone& tone, juce::String existingId)
    {
        Preset p;
        p.id = existingId.isNotEmpty() ? existingId : juce::Uuid().toString();
        p.toneId = tone.id;
        p.title = tone.title;
        p.creator = tone.user.creatorName();
        return p;
    }

    juce::var Preset::toVar() const
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("id", id);
        o->setProperty ("tone_id", toneId);
        o->setProperty ("title", title);
        o->setProperty ("creator", creator);
        return juce::var (o);
    }

    Preset Preset::fromVar (const juce::var& v)
    {
        Preset p;
        p.id = v.getProperty ("id", "").toString();
        p.toneId = (int) v.getProperty ("tone_id", 0);
        p.title = v.getProperty ("title", "").toString();
        p.creator = v.getProperty ("creator", "").toString();
        return p;
    }

    PresetStore::PresetStore()
    {
        juce::PropertiesFile::Options o;
        o.applicationName = "presets";
        o.filenameSuffix = ".settings";
        o.folderName = "TONE3000 Example";
        o.osxLibrarySubFolder = "Application Support";
        file = std::make_unique<juce::PropertiesFile> (o);
    }

    std::vector<Preset> PresetStore::load()
    {
        std::vector<Preset> out;
        if (auto* arr = juce::JSON::parse (file->getValue ("beacon_presets")).getArray())
            for (auto& v : *arr)
                out.push_back (Preset::fromVar (v));
        return out;
    }

    void PresetStore::save (const std::vector<Preset>& presets)
    {
        juce::Array<juce::var> arr;
        for (auto& p : presets) arr.add (p.toVar());
        file->setValue ("beacon_presets", juce::JSON::toString (juce::var (arr), true));
        file->saveIfNeeded();
    }

    // ---- Preset card ------------------------------------------------------------------

    class LoadToneDemoScreen::PresetCard : public juce::Component
    {
    public:
        static constexpr int height = 84;

        PresetCard (Preset p, bool isActive, std::function<void()> onLoad, std::function<void()> onRemove)
            : preset (std::move (p)), active (isActive)
        {
            name.setText (preset.title, juce::dontSendNotification);
            styleLabel (name, 15.0f, theme::text, true);
            addAndMakeVisible (name);
            creator.setText (preset.creator, juce::dontSendNotification);
            styleLabel (creator, 13.0f, theme::text2);
            addAndMakeVisible (creator);
            ref.setText ("TONE3000 Tone #" + juce::String (preset.toneId), juce::dontSendNotification);
            styleLabel (ref, 11.0f, theme::text3);
            ref.setFont (juce::Font (juce::FontOptions (juce::Font::getDefaultMonospacedFontName(), 11.0f, juce::Font::plain)));
            addAndMakeVisible (ref);

            style (load, ButtonStyle::primary);
            style (remove, ButtonStyle::secondary);
            load.onClick = std::move (onLoad);
            remove.onClick = std::move (onRemove);
            addAndMakeVisible (load);
            addAndMakeVisible (remove);
        }

        void setEnabledActions (bool enabled) { load.setEnabled (enabled); remove.setEnabled (enabled); }

        void paint (juce::Graphics& g) override
        {
            auto r = getLocalBounds().toFloat().reduced (0.5f);
            g.setColour (theme::surface);
            g.fillRoundedRectangle (r, 10.0f);
            g.setColour (active ? theme::accent : theme::border);
            g.drawRoundedRectangle (r, 10.0f, active ? 1.5f : 1.0f);
        }

        void resized() override
        {
            auto area = getLocalBounds().reduced (16, 14);
            auto actions = area.removeFromRight (juce::jmin (330, area.getWidth() / 2)).withSizeKeepingCentre (330, theme::control);
            load.setBounds (actions.removeFromRight (170));
            actions.removeFromRight (theme::gapSmall);
            remove.setBounds (actions.removeFromRight (90));
            area.removeFromRight (theme::gap);
            name.setBounds (area.removeFromTop (20));
            creator.setBounds (area.removeFromTop (18));
            ref.setBounds (area.removeFromTop (16));
        }

    private:
        Preset preset;
        bool active;
        juce::Label name, creator, ref;
        juce::TextButton load { "Load from TONE3000" }, remove { "Remove" };
    };

    // ---- Screen ---------------------------------------------------------------------------

    LoadToneDemoScreen::LoadToneDemoScreen (Navigator& n) : Screen (n, "Beacon Inc", "Preset Management", "All Demos")
    {
        viewport.setViewedComponent (&content, false);
        viewport.setScrollBarsShown (true, false);
        addAndMakeVisible (viewport);

        loadedTitle.setText ("Loaded Tone", juce::dontSendNotification);
        styleLabel (loadedTitle, 20.0f, theme::text, true);
        content.addAndMakeVisible (loadedTitle);
        style (syncAgain, ButtonStyle::secondary);
        content.addChildComponent (syncAgain);
        syncAgain.onClick = [this]
        {
            for (auto& p : presets)
                if (p.id == activePresetId) { loadPreset (p); return; }
        };

        content.addChildComponent (replacement);
        replacement.onDismiss = [this] { resized(); };
        content.addChildComponent (detail);
        detail.onError = [this] (const juce::String& e) { showError (e); };

        styleLabel (placeholder, 14.0f, theme::text3, false, juce::Justification::centred);
        content.addAndMakeVisible (placeholder);

        styleLabel (status, 13.0f, theme::text2);
        content.addAndMakeVisible (status);
        style (cancel, ButtonStyle::secondary);
        cancel.onClick = [this] { if (flow) flow->cancel(); };
        content.addChildComponent (cancel);

        presetsTitle.setText ("My Presets", juce::dontSendNotification);
        styleLabel (presetsTitle, 20.0f, theme::text, true);
        content.addAndMakeVisible (presetsTitle);
        style (add, ButtonStyle::secondary);
        add.onClick = [this] { addPreset(); };
        content.addAndMakeVisible (add);

        presetsPlaceholder.setText ("Presets store a TONE3000 tone ID. Add one by picking a tone on TONE3000, then load it any time. "
                                    "TONE3000 checks access and offers a replacement if the tone becomes private or is deleted.",
                                    juce::dontSendNotification);
        styleLabel (presetsPlaceholder, 14.0f, theme::text3, false, juce::Justification::centred);
        content.addChildComponent (presetsPlaceholder);

        content.onPaint = [this] (juce::Graphics& g)
        {
            // Dashed placeholder boxes, like the web `.loaded-placeholder`.
            auto dashed = [&] (juce::Component& c)
            {
                if (! c.isVisible()) return;
                juce::Path p;
                p.addRoundedRectangle (c.getBounds().toFloat().reduced (0.5f), 10.0f);
                const float dashes[] = { 5.0f, 4.0f };
                juce::PathStrokeType (1.0f).createDashedStroke (p, p, dashes, 2);
                g.setColour (theme::border2);
                g.fillPath (p);
            };
            dashed (placeholder);
            dashed (presetsPlaceholder);
        };

        presets = store.load();
        rebuildCards();
    }

    LoadToneDemoScreen::~LoadToneDemoScreen() = default;

    void LoadToneDemoScreen::rebuildCards()
    {
        cards.clear();
        for (auto& preset : presets)
        {
            auto card = std::make_unique<PresetCard> (preset, preset.id == activePresetId,
                                                      [this, preset] { loadPreset (preset); },
                                                      [this, preset] { removePreset (preset); });
            content.addAndMakeVisible (*card);
            cards.push_back (std::move (card));
        }
        presetsPlaceholder.setVisible (presets.empty());
        placeholder.setText (presets.empty() ? "No tone loaded yet." : "No tone loaded yet. Load one of your presets below.",
                             juce::dontSendNotification);
        resized();
    }

    void LoadToneDemoScreen::persist()
    {
        store.save (presets);
        rebuildCards();
    }

    void LoadToneDemoScreen::setBusy (bool busy, const juce::String& message)
    {
        add.setEnabled (! busy);
        syncAgain.setEnabled (! busy);
        cancel.setVisible (busy && flow != nullptr);
        for (auto& card : cards) card->setEnabledActions (! busy);
        status.setText (message, juce::dontSendNotification);
        resized();
    }

    void LoadToneDemoScreen::addPreset()
    {
        clearBanner();
        t3k::FlowRequest request;
        request.kind = t3k::FlowRequest::Kind::selectTone;
        request.catalog.preview = true;

        flow = t3k::makeAuthFlow (t3k::FlowMode::systemBrowser);
        setBusy (true, "Pick a tone in your browser...");
        flow->start (request, scope.wrap ([this] (t3k::FlowResult r)
        {
            juce::MessageManager::callAsync ([f = std::shared_ptr<t3k::AuthFlow> (flow.release())] { juce::ignoreUnused (f); });
            if (! r.connected() || r.toneId.isEmpty())
            {
                setBusy (false);
                if (r.status == t3k::FlowResult::Status::failed) showError ("Sign-in failed: " + r.error);
                return;
            }
            setBusy (true, "Syncing from TONE3000...");
            t3k::client().getToneWithModels (r.toneId.getIntValue(), scope.wrap ([this] (t3k::Result<t3k::ToneWithModels> t)
            {
                setBusy (false);
                if (! t.ok()) { showError (t.error.userMessage ("Loading the tone")); return; }
                auto preset = Preset::fromTone (t->tone);
                presets.push_back (preset);
                showTone (*t, preset, 0);
                persist();
            }));
        }));
    }

    void LoadToneDemoScreen::loadPreset (const Preset& preset)
    {
        clearBanner();
        if (! t3k::client().isConnected())
        {
            runLoadToneFlow (preset);
            return;
        }

        // Connected: try the API directly and only fall back to the Load Tone
        // flow when TONE3000 needs to verify access or offer a replacement.
        setBusy (true, "Loading " + preset.title + "...");
        t3k::client().getToneWithModels (preset.toneId, scope.wrap ([this, preset] (t3k::Result<t3k::ToneWithModels> t)
        {
            if (t.ok())
            {
                setBusy (false);
                showTone (*t, preset, 0);
                rebuildCards();
                return;
            }
            if (! t.error.isNotFound() && ! t.error.isForbidden() && t.error.status != 401)
            {
                setBusy (false);
                showError (t.error.userMessage ("Loading the tone"));
                return;
            }
            runLoadToneFlow (preset);
        }));
    }

    void LoadToneDemoScreen::runLoadToneFlow (const Preset& preset)
    {
        t3k::FlowRequest request;
        request.kind = t3k::FlowRequest::Kind::loadTone;
        request.toneId = juce::String (preset.toneId);

        flow = t3k::makeAuthFlow (t3k::FlowMode::systemBrowser);
        setBusy (true, "Confirming access to " + preset.title + " in your browser...");
        flow->start (request, scope.wrap ([this, preset] (t3k::FlowResult r)
        {
            juce::MessageManager::callAsync ([f = std::shared_ptr<t3k::AuthFlow> (flow.release())] { juce::ignoreUnused (f); });
            if (! r.connected() || r.toneId.isEmpty())
            {
                setBusy (false);
                if (r.status == t3k::FlowResult::Status::failed) showError ("Load Tone failed: " + r.error);
                else if (r.canceled()) showInfo ("Load canceled.");
                return;
            }

            // TONE3000 may hand back a replacement tone: repoint the preset at it.
            const int resolvedId = r.toneId.getIntValue();
            const int replaced = resolvedId != preset.toneId ? preset.toneId : 0;
            setBusy (true, "Syncing from TONE3000...");
            t3k::client().getToneWithModels (resolvedId, scope.wrap ([this, preset, replaced] (t3k::Result<t3k::ToneWithModels> t)
            {
                setBusy (false);
                if (! t.ok()) { showError (t.error.userMessage ("Loading the tone")); return; }
                auto updated = Preset::fromTone (t->tone, preset.id);
                for (auto& p : presets)
                    if (p.id == preset.id) p = updated;
                showTone (*t, updated, replaced);
                persist();
            }));
        }));
    }

    void LoadToneDemoScreen::showTone (const t3k::ToneWithModels& tone, const Preset& preset, int replacedToneId)
    {
        activePresetId = preset.id;
        if (replacedToneId != 0)
            replacement.show ("The original tone (ID #" + juce::String (replacedToneId) + ") wasn't available, so TONE3000 offered a "
                              "replacement. The preset now points to the replacement.", false);
        else
            replacement.clear();
        detail.set (tone, ToneDetailOptions {});
        detail.setVisible (true);
        syncAgain.setVisible (true);
        placeholder.setVisible (false);
        resized();
        viewport.setViewPosition (0, 0);
    }

    void LoadToneDemoScreen::removePreset (const Preset& preset)
    {
        // Called from the card's own button: rebuild the cards on the next tick.
        juce::MessageManager::callAsync (scope.wrap ([this, id = preset.id]
        {
            presets.erase (std::remove_if (presets.begin(), presets.end(), [&] (const Preset& p) { return p.id == id; }), presets.end());
            if (activePresetId == id)
            {
                activePresetId.clear();
                detail.clear();
                detail.setVisible (false);
                syncAgain.setVisible (false);
                replacement.clear();
                placeholder.setVisible (true);
            }
            persist();
        }));
    }

    int LoadToneDemoScreen::layout (int width, bool apply)
    {
        int y = 0;
        auto place = [&] (juce::Component& c, juce::Rectangle<int> r) { if (apply) c.setBounds (r); };

        // Loaded tone section
        {
            auto row = juce::Rectangle<int> (0, y, width, theme::control);
            if (syncAgain.isVisible()) place (syncAgain, row.removeFromRight (110));
            place (loadedTitle, row);
            y += theme::control + 16;
        }
        if (status.getText().isNotEmpty())
        {
            auto row = juce::Rectangle<int> (0, y, width, theme::controlSmall);
            if (cancel.isVisible()) place (cancel, row.removeFromRight (90));
            place (status, row);
            y += theme::controlSmall + 12;
        }
        if (replacement.isShowing())
        {
            const int h = replacement.preferredHeight (width);
            place (replacement, { 0, y, width, h });
            y += h + 16;
        }
        if (detail.isVisible())
        {
            const int h = detail.preferredHeight (width);
            place (detail, { 0, y, width, h });
            y += h;
        }
        else
        {
            place (placeholder, { 0, y, width, 88 });
            y += 88;
        }
        y += 32;

        // Presets section
        {
            auto row = juce::Rectangle<int> (0, y, width, theme::control);
            place (add, row.removeFromRight (130));
            place (presetsTitle, row);
            y += theme::control + 16;
        }
        if (presetsPlaceholder.isVisible())
        {
            const int h = wrappedHeight (presetsPlaceholder.getText(), presetsPlaceholder.getFont(), width - 48) + 40;
            place (presetsPlaceholder, { 0, y, width, h });
            y += h;
        }
        for (auto& card : cards)
        {
            place (*card, { 0, y, width, PresetCard::height });
            y += PresetCard::height + theme::gap;
        }
        return y + theme::pad;
    }

    void LoadToneDemoScreen::layoutContent (juce::Rectangle<int> area)
    {
        viewport.setBounds (area);
        const int width = contentWidth (viewport);
        content.setSize (width, juce::jmax (area.getHeight(), layout (width, false)));
        layout (width, true);
        content.repaint();
    }
}
