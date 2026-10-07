// Window content: a stack of screens with the landing page at the bottom.
#pragma once

#include "Widgets.h"

namespace ui
{
    class LandingScreen;

    class MainComponent : public juce::Component, public Navigator
    {
    public:
        MainComponent();
        ~MainComponent() override;

        void push (std::unique_ptr<juce::Component> screen) override;
        void pop() override;
        juce::Component* window() override { return getTopLevelComponent(); }

        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        void showTop();

        LookAndFeel lookAndFeel;
        std::vector<std::unique_ptr<juce::Component>> stack;
        juce::TooltipWindow tooltips { this };
    };
}
