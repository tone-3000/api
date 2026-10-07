// TONE3000 example app (JUCE). Entry point and main window.
#include "Audio/PreviewPlayer.h"
#include "T3K/Client.h"
#include "UI/MainComponent.h"

#include <JuceHeader.h>

class Tone3000ExampleApplication : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override { return JUCE_APPLICATION_NAME_STRING; }
    const juce::String getApplicationVersion() override { return JUCE_APPLICATION_VERSION_STRING; }
    bool moreThanOneInstanceAllowed() override { return false; }

    void initialise (const juce::String&) override
    {
        // One shared API client, preview player and artwork loader for every demo.
        client = std::make_unique<t3k::Client>();
        player = std::make_unique<t3k::audio::PreviewPlayer>();
        images = std::make_unique<ui::ImageLoader>();
        window = std::make_unique<MainWindow> (getApplicationName());
    }

    void shutdown() override
    {
        window.reset();
        images.reset();
        player.reset();
        client.reset();
    }

    void systemRequestedQuit() override { quit(); }

private:
    class MainWindow : public juce::DocumentWindow
    {
    public:
        explicit MainWindow (const juce::String& name)
            : juce::DocumentWindow (name, ui::theme::bg, juce::DocumentWindow::allButtons)
        {
            setUsingNativeTitleBar (true);
            setContentOwned (new ui::MainComponent(), true);
            setResizable (true, false);
            setResizeLimits (720, 540, 10000, 10000);
            centreWithSize (getWidth(), getHeight());
            setVisible (true);
        }

        void closeButtonPressed() override
        {
            juce::JUCEApplication::getInstance()->systemRequestedQuit();
        }
    };

    std::unique_ptr<t3k::Client> client;
    std::unique_ptr<t3k::audio::PreviewPlayer> player;
    std::unique_ptr<ui::ImageLoader> images;
    std::unique_ptr<MainWindow> window;
};

START_JUCE_APPLICATION (Tone3000ExampleApplication)
