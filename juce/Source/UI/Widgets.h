// Reusable UI pieces shared by the three demos. The look mirrors the web
// example (web/src/index.css): light surfaces, blue accent, card grids.
#pragma once

#include "Audio/PreviewPlayer.h"
#include "ImageLoader.h"
#include "T3K/Async.h"
#include "T3K/Types.h"

#include <JuceHeader.h>

namespace ui
{
    // ---- Theme ----------------------------------------------------------------------

    namespace theme
    {
        const juce::Colour bg { 0xfff4f5f7 };
        const juce::Colour surface { 0xffffffff };
        const juce::Colour surface2 { 0xffeef0f3 };
        const juce::Colour border { 0xffdde1e7 };
        const juce::Colour border2 { 0xffb0b8c4 };
        const juce::Colour text { 0xff0d0f12 };
        const juce::Colour text2 { 0xff4a5360 };
        const juce::Colour text3 { 0xff8f9baa };
        const juce::Colour accent { 0xff2563eb };
        const juce::Colour accentHover { 0xff1d4ed8 };
        const juce::Colour error { 0xffdc2626 };
        const juce::Colour success { 0xff16a34a };

        constexpr int pad = 24;          // page padding
        constexpr int gap = 12;
        constexpr int gapSmall = 8;
        constexpr int control = 36;      // input / button height
        constexpr int controlSmall = 30;
        constexpr int mainMaxWidth = 860;
        constexpr float radius = 8.0f;

        juce::Font font (float size, bool bold = false);
    }

    /// "  ·  " separator. (JUCE reads narrow literals as ASCII, so non-ASCII text goes through CharPointer_UTF8.)
    inline const juce::String dot { juce::CharPointer_UTF8 ("  \xC2\xB7  ") };
    inline const juce::String arrowLeft { juce::CharPointer_UTF8 ("\xE2\x86\x90 ") };     // "← "
    inline const juce::String arrowDown { juce::CharPointer_UTF8 ("\xE2\x86\x93 ") };     // "↓ "
    inline const juce::String star { juce::CharPointer_UTF8 ("\xE2\x98\x85 ") };          // "★ "
    inline const juce::String starOutline { juce::CharPointer_UTF8 ("\xE2\x98\x86 ") };   // "☆ "

    class LookAndFeel : public juce::LookAndFeel_V4
    {
    public:
        LookAndFeel();
        void drawButtonBackground (juce::Graphics&, juce::Button&, const juce::Colour&, bool, bool) override;
        void drawButtonText (juce::Graphics&, juce::TextButton&, bool, bool) override;
        juce::Font getTextButtonFont (juce::TextButton&, int) override;
        void drawComboBox (juce::Graphics&, int, int, bool, int, int, int, int, juce::ComboBox&) override;
        juce::Font getComboBoxFont (juce::ComboBox&) override;
        void positionComboBoxText (juce::ComboBox&, juce::Label&) override;
        void drawTextEditorOutline (juce::Graphics&, int, int, juce::TextEditor&) override;
        void fillTextEditorBackground (juce::Graphics&, int, int, juce::TextEditor&) override;
        void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool, bool) override;
        void drawScrollbar (juce::Graphics&, juce::ScrollBar&, int, int, int, int, bool, int, int, bool, bool) override;
        int getDefaultScrollbarWidth() override { return 8; }
    };

    /// Button variants from the web example: primary (accent), secondary (surface + border), ghost.
    enum class ButtonStyle { primary, secondary, ghost };
    void style (juce::Button& button, ButtonStyle style);

    // ---- Text helpers --------------------------------------------------------------------

    void styleLabel (juce::Label& label, float size, const juce::Colour& colour, bool bold = false,
                     juce::Justification just = juce::Justification::centredLeft);
    void styleEditor (juce::TextEditor& editor, const juce::String& placeholder);
    void fillCombo (juce::ComboBox& combo, const std::vector<std::pair<juce::String, juce::String>>& items);
    void openExternal (const juce::String& url);
    /// Height needed to show `text` wrapped in `width` at `font`.
    int wrappedHeight (const juce::String& text, const juce::Font& font, int width);
    /// Width for a viewport's content, always leaving room for the vertical scrollbar
    /// so content doesn't reflow (or get covered) when the bar appears.
    inline int contentWidth (const juce::Viewport& viewport)
    {
        return juce::jmax (0, viewport.getWidth() - viewport.getScrollBarThickness() - 4);
    }

    // ---- Images -----------------------------------------------------------------------------

    /// Shows a remote image cover-fitted with rounded corners (or a circle), or a
    /// neutral placeholder while loading / after a failed fetch.
    class RemoteImage : public juce::Component
    {
    public:
        enum class Kind { art, avatar };
        explicit RemoteImage (Kind k = Kind::art) : kind (k) {}

        void setUrl (const juce::String& url);
        void setCornerRadius (float r) { corner = r; repaint(); }
        void setCircular (bool c) { circular = c; repaint(); }
        bool hasImage() const { return image.isValid(); }
        void paint (juce::Graphics&) override;
        void resized() override { fitted = {}; }

    private:
        Kind kind;
        juce::String currentUrl;
        juce::Image image;          // canonical square from the loader
        juce::Image fitted;         // `image` cover-fitted to our box at the last paint scale
        float fittedScale = 0.0f;
        float corner = theme::radius;
        bool circular = false;
        ImageLoader::Request request;
    };

    // ---- Small pieces -------------------------------------------------------------------------

    enum class BadgeStyle { neutral, gear, format };
    /// Draw a pill badge at `x`; returns the width used.
    int drawBadge (juce::Graphics& g, int x, int y, const juce::String& text, BadgeStyle style);
    int badgeWidth (const juce::String& text);
    constexpr int badgeHeight = 20;

    /// Avatar + name (+ verified mark), like the web CreatorBadge.
    class CreatorBadge : public juce::Component
    {
    public:
        void set (const t3k::EmbeddedUser& user, bool large = false);
        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        t3k::EmbeddedUser user;
        bool large = false;
        RemoteImage avatar { RemoteImage::Kind::avatar };
    };

    /// Error / info strip. Hidden when empty.
    class Banner : public juce::Component
    {
    public:
        Banner();
        void show (const juce::String& message, bool isError = true);
        void clear();
        bool isShowing() const { return message.isNotEmpty(); }
        std::function<void()> onDismiss;    // defaults to re-laying out the parent
        int preferredHeight (int width) const;
        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        juce::String message;
        bool error = true;
        juce::TextButton dismiss { juce::String (juce::CharPointer_UTF8 ("\xC3\x97")) };   // ×
    };

    /// Centered title + description (+ optional action), like the web empty-state.
    class EmptyState : public juce::Component
    {
    public:
        EmptyState();
        void set (const juce::String& title, const juce::String& description);
        juce::TextButton action;     // caller styles / shows it
        void resized() override;

    private:
        juce::Label title, description;
    };

    // ---- Navigation and page shell ------------------------------------------------------------

    class Navigator
    {
    public:
        virtual ~Navigator() = default;
        virtual void push (std::unique_ptr<juce::Component> screen) = 0;
        virtual void pop() = 0;
        virtual juce::Component* window() = 0;
    };

    /// App shell: brand header (name + tagline + actions), main area, footer back link.
    class Screen : public juce::Component
    {
    public:
        Screen (Navigator& navigator, const juce::String& appName, const juce::String& tagline,
                const juce::String& backLabel = {});

        void paint (juce::Graphics&) override;
        void resized() final;

        void addHeaderAction (juce::Component& action, int width);
        void showError (const juce::String& message) { banner.show (message, true); resized(); }
        void showInfo (const juce::String& message) { banner.show (message, false); resized(); }
        void clearBanner() { banner.clear(); resized(); }

    protected:
        /// Lay out the page inside `area` (already padded and width-limited, banner excluded).
        virtual void layoutContent (juce::Rectangle<int> area) = 0;
        /// Width limit for the main column (0 = full width).
        int mainMaxWidth = theme::mainMaxWidth;
        /// Padding around the main area (0 = flush, e.g. for a sidebar layout).
        int contentPadding = theme::pad;
        /// When true the subclass positions the banner itself via placeBanner().
        bool manualBanner = false;
        /// Puts the banner at the top of `area` (if showing) and trims `area`.
        void placeBanner (juce::Rectangle<int>& area);

        Navigator& nav;
        t3k::AsyncScope scope;

    private:
        static constexpr int headerHeight = 64;
        static constexpr int footerHeight = 48;
        juce::Label name, tagline;
        juce::TextButton back;
        Banner banner;
        std::vector<std::pair<juce::Component*, int>> actions;
    };

    // ---- Tones ----------------------------------------------------------------------------------

    /// Tone card: square cover, title, creator, badges (+ description/stats when not compact).
    class ToneCard : public juce::Component
    {
    public:
        explicit ToneCard (t3k::Tone tone, bool compact = true);
        std::function<void (const t3k::Tone&)> onClick;
        int preferredHeight (int width) const;
        void paint (juce::Graphics&) override;
        void resized() override;
        void mouseUp (const juce::MouseEvent&) override;
        void mouseEnter (const juce::MouseEvent&) override { hover = true; repaint(); }
        void mouseExit (const juce::MouseEvent&) override { hover = false; repaint(); }
        const t3k::Tone tone;

    private:
        bool compact, hover = false;
        RemoteImage cover;
        CreatorBadge creator;
    };

    /// Responsive grid of ToneCards in a viewport, with loading / empty states.
    class ToneGrid : public juce::Component
    {
    public:
        ToneGrid();
        void setTones (const juce::Array<t3k::Tone>& tones);
        void setLoading (bool loading);
        void setEmptyMessage (const juce::String& m) { emptyMessage = m; repaint(); }
        std::function<void (const t3k::Tone&)> onSelect;
        /// Height of the whole grid at `width` (for embedding in a larger scrolling page).
        int preferredHeight (int width) const;
        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        int layoutCards (int width, bool apply) const;
        juce::Viewport viewport;
        juce::Component content;
        std::vector<std::unique_ptr<ToneCard>> cards;
        bool loading = false;
        juce::String emptyMessage { "No tones found." };
    };

    class Pager : public juce::Component
    {
    public:
        Pager();
        void set (int page, int totalPages, int total);
        std::function<void (int page)> onPage;
        void resized() override;
        static constexpr int height = 44;

    private:
        juce::TextButton prev { "Previous" }, next { "Next" };
        juce::Label status;
        int current = 1, pages = 1;
    };

    // ---- Models ---------------------------------------------------------------------------------

    class ModelRow : public juce::Component, private juce::ChangeListener
    {
    public:
        ModelRow (t3k::Model model, t3k::Tone tone, bool allowDownload);
        ~ModelRow() override;
        std::function<void (const juce::String&)> onError;
        void paint (juce::Graphics&) override;
        void resized() override;
        static constexpr int height = 56;

    private:
        void changeListenerCallback (juce::ChangeBroadcaster*) override;
        void refresh();
        void download();
        juce::String playerId() const { return "model-" + juce::String (model.id); }

        t3k::Model model;
        t3k::Tone tone;
        juce::TextButton play, downloadButton { "Download" };
        juce::Label name, note;
        double progress = 0;
        juce::String reportedError;
        t3k::AsyncScope scope;
    };

    /// "Models (n)" heading + rows. Not scrollable itself; place inside a viewport.
    class ModelList : public juce::Component
    {
    public:
        void setModels (const juce::Array<t3k::Model>& models, const t3k::Tone& tone, bool allowDownload);
        std::function<void (const juce::String&)> onError;
        int preferredHeight() const;
        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        static constexpr int headingHeight = 32;
        juce::String heading;
        std::vector<std::unique_ptr<ModelRow>> rows;
    };

    // ---- Filters ----------------------------------------------------------------------------------

    struct Suggestion
    {
        juce::String name, hint;
    };

    /// Type-ahead picker for tags / makes / creators (web SuggestPicker): typed text
    /// queries the API (debounced), matches drop down, chosen values become chips.
    class SuggestPicker : public juce::Component, private juce::Timer
    {
    public:
        using Suggest = std::function<void (const juce::String& query, std::function<void (juce::Array<Suggestion>)> done)>;

        SuggestPicker (const juce::String& label, const juce::String& placeholder, Suggest suggest);
        ~SuggestPicker() override;

        juce::StringArray values() const { return chosen; }
        void setValues (const juce::StringArray& v);
        std::function<void()> onChange;

        int preferredHeight() const;
        void resized() override;
        void paint (juce::Graphics&) override;

    private:
        void timerCallback() override;
        void add (const juce::String& value);
        void remove (const juce::String& value);
        void rebuildChips();
        void showMenu (const juce::Array<Suggestion>& suggestions);

        juce::Label label;
        juce::TextEditor input;
        juce::StringArray chosen;
        std::vector<std::unique_ptr<juce::TextButton>> chips;
        Suggest suggest;
        juce::String lastQuery;
        t3k::AsyncScope scope;
    };

    /// Plain container whose painting is supplied by the owner (panels inside viewports).
    class Canvas : public juce::Component
    {
    public:
        std::function<void (juce::Graphics&)> onPaint;
        void paint (juce::Graphics& g) override { if (onPaint) onPaint (g); }
    };

    /// Draw a white card background (web .filter-panel / .flow-options).
    void drawPanel (juce::Graphics& g, juce::Rectangle<int> bounds, float radius = 10.0f);
    /// Small uppercase caption (web .flow-options-title).
    void drawCaption (juce::Graphics& g, juce::Rectangle<int> bounds, const juce::String& text);

    /// Label above a control (web .filter-field).
    class Field : public juce::Component
    {
    public:
        Field (const juce::String& label, juce::Component& control);
        void resized() override;
        static constexpr int height = 18 + 4 + theme::control;

    private:
        juce::Label label;
        juce::Component& control;
    };
}
