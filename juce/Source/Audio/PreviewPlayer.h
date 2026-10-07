// Preview playback through the shared native engine (native/preview-engine),
// driven by a juce::AudioDeviceManager.
//
// Mirrors the web player's shared provider: one engine, one active player id,
// progress for the UI. State changes are broadcast on the message thread
// (ChangeBroadcaster); components re-read the getters when notified.
#pragma once

#include "T3K/Async.h"
#include "T3K/Types.h"

#include <JuceHeader.h>

struct pe_engine;

namespace t3k::audio
{
    /// Local files for one preview. Empty model/IR skips that stage.
    struct PreviewChain
    {
        juce::File model, ir, input;
        bool operator== (const PreviewChain& o) const { return model == o.model && ir == o.ir && input == o.input; }
        bool operator!= (const PreviewChain& o) const { return ! (*this == o); }
    };

    /// The bundled preview assets (native/preview-assets), written to disk once
    /// so the engine can load them by path.
    struct PreviewAssets
    {
        static juce::File input();          // guitar DI clip
        static juce::File fallbackAmp();    // neutral amp for previewing an IR alone
        static juce::File fallbackCab();    // cab IR for previewing an amp head alone
    };

    /// Whether the demos can preview this tone's models.
    bool isPreviewable (const Tone& tone);

    /// Resolve the chain for a model (downloads the file on first play):
    ///   NAM amp head -> model + fallback cab
    ///   other NAM    -> model only
    ///   IR           -> fallback amp + IR
    void resolvePreviewChain (const Model& model, const Tone& tone, Callback<PreviewChain> done);

    class PreviewPlayer : public juce::ChangeBroadcaster,
                          private juce::AudioIODeviceCallback,
                          private juce::Timer
    {
    public:
        PreviewPlayer();
        ~PreviewPlayer() override;

        using Resolver = std::function<void (Callback<PreviewChain>)>;

        /// Play/pause player `id`. `resolve` supplies the chain (async) on first play.
        void togglePlay (const juce::String& id, Resolver resolve);
        void stop();

        juce::String activeId() const { return active; }
        juce::String loadingId() const { return loading; }
        bool isPlaying() const { return playing; }
        double progress() const { return currentProgress; }
        /// Most recent failure (download / load / audio device), cleared on the next play,
        /// and the player id it belongs to.
        juce::String lastError() const { return error; }
        juce::String lastErrorId() const { return errorId; }

    private:
        void audioDeviceAboutToStart (juce::AudioIODevice* device) override;
        void audioDeviceStopped() override;
        void audioDeviceIOCallbackWithContext (const float* const*, int, float* const* outputs, int numOutputs,
                                               int numSamples, const juce::AudioIODeviceCallbackContext&) override;
        void timerCallback() override;

        bool ensureAudioDevice();
        void setPlaying (bool shouldPlay);
        void fail (const juce::String& message);
        /// Load on a worker thread under the engine lock; `done` gets an error string ("" on success).
        void loadChainAsync (PreviewChain chain, std::function<void (juce::String)> done);

        juce::AudioDeviceManager deviceManager;
        bool deviceInitialised = false;

        juce::CriticalSection engineLock;        // create/destroy/load vs. device changes
        pe_engine* engine = nullptr;
        std::atomic<bool> engineReady { false };
        std::vector<float> mono;
        PreviewChain loadedChain;
        bool hasLoadedChain = false;

        juce::String active, loading, error, errorId, requestId;
        bool playing = false;
        double currentProgress = 0;
        int generation = 0;                      // invalidates stale toggles
        AsyncScope scope;
    };

    /// The shared player every demo uses.
    PreviewPlayer& player();
}
