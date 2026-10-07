#include "PreviewPlayer.h"

#include "T3K/Client.h"
#include "preview_engine.h"

namespace t3k::audio
{
    // ---- Assets -------------------------------------------------------------------

    namespace
    {
        juce::File assetFile (const char* name, const void* data, int size)
        {
            auto dir = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                           .getChildFile ("TONE3000 Example").getChildFile ("preview-assets");
            auto file = dir.getChildFile (name);
            if (! file.existsAsFile() || file.getSize() != (juce::int64) size)
            {
                dir.createDirectory();
                file.replaceWithData (data, (size_t) size);
            }
            return file;
        }

        PreviewPlayer* sharedPlayer = nullptr;
    }

    juce::File PreviewAssets::input() { return assetFile ("di-guitar.wav", T3KAssets::diguitar_wav, T3KAssets::diguitar_wavSize); }
    juce::File PreviewAssets::fallbackAmp() { return assetFile ("fallback-amp.nam", T3KAssets::fallbackamp_nam, T3KAssets::fallbackamp_namSize); }
    juce::File PreviewAssets::fallbackCab() { return assetFile ("fallback-cab.wav", T3KAssets::fallbackcab_wav, T3KAssets::fallbackcab_wavSize); }

    bool isPreviewable (const Tone& tone)
    {
        return tone.format == format::nam || tone.format == format::ir;
    }

    void resolvePreviewChain (const Model& model, const Tone& tone, Callback<PreviewChain> done)
    {
        if (! isPreviewable (tone))
        {
            done (Result<PreviewChain>::failure ({ 0, formatLabel (tone.format) + " tones can't be previewed." }));
            return;
        }

        const bool isIr = tone.format == format::ir;
        const bool isAmpHead = tone.gear == gear::amp;

        client().downloadModelFile (model, [done, isIr, isAmpHead] (Result<juce::File> file)
        {
            if (! file.ok())
            {
                done (Result<PreviewChain>::failure (file.error));
                return;
            }
            PreviewChain chain;
            chain.input = PreviewAssets::input();
            if (isIr)
            {
                chain.model = PreviewAssets::fallbackAmp();
                chain.ir = *file;
            }
            else
            {
                chain.model = *file;
                if (isAmpHead)
                    chain.ir = PreviewAssets::fallbackCab();
            }
            done (Result<PreviewChain>::success (chain));
        });
    }

    // ---- Player ---------------------------------------------------------------------

    PreviewPlayer::PreviewPlayer()
    {
        if (sharedPlayer == nullptr)
            sharedPlayer = this;
    }

    PreviewPlayer::~PreviewPlayer()
    {
        stopTimer();
        deviceManager.removeAudioCallback (this);
        deviceManager.closeAudioDevice();
        {
            const juce::ScopedLock sl (engineLock);
            if (engine != nullptr)
                pe_destroy (engine);
            engine = nullptr;
        }
        if (sharedPlayer == this)
            sharedPlayer = nullptr;
    }

    PreviewPlayer& player()
    {
        jassert (sharedPlayer != nullptr);
        return *sharedPlayer;
    }

    bool PreviewPlayer::ensureAudioDevice()
    {
        if (deviceInitialised)
            return true;

        // Output only; opened lazily on first play so the app doesn't hold an
        // audio device while the user is just browsing.
        auto err = deviceManager.initialiseWithDefaultDevices (0, 2);
        if (err.isNotEmpty())
        {
            fail ("Audio device: " + err);
            return false;
        }
        deviceManager.addAudioCallback (this);
        deviceInitialised = true;
        return true;
    }

    void PreviewPlayer::audioDeviceAboutToStart (juce::AudioIODevice* device)
    {
        const juce::ScopedLock sl (engineLock);
        if (engine != nullptr)
            pe_destroy (engine);

        auto maxFrames = juce::jmax (device->getCurrentBufferSizeSamples(), 512);
        engine = pe_create (device->getCurrentSampleRate(), maxFrames);
        mono.assign ((size_t) maxFrames, 0.0f);

        // A device restart (new sample rate / hardware) needs the chain again.
        if (engine != nullptr && hasLoadedChain)
        {
            pe_load_input (engine, loadedChain.input.getFullPathName().toRawUTF8());
            pe_load_model (engine, loadedChain.model.getFullPathName().toRawUTF8());
            pe_load_ir (engine, loadedChain.ir.getFullPathName().toRawUTF8());
        }
        engineReady = engine != nullptr;
    }

    void PreviewPlayer::audioDeviceStopped()
    {
        engineReady = false;
        const juce::ScopedLock sl (engineLock);
        if (engine != nullptr)
            pe_destroy (engine);
        engine = nullptr;
    }

    void PreviewPlayer::audioDeviceIOCallbackWithContext (const float* const*, int, float* const* outputs, int numOutputs,
                                                          int numSamples, const juce::AudioIODeviceCallbackContext&)
    {
        if (! engineReady || (size_t) numSamples > mono.size())
        {
            for (int ch = 0; ch < numOutputs; ++ch)
                if (outputs[ch] != nullptr)
                    juce::FloatVectorOperations::clear (outputs[ch], numSamples);
            return;
        }

        pe_process (engine, mono.data(), numSamples);
        for (int ch = 0; ch < numOutputs; ++ch)
            if (outputs[ch] != nullptr)
                juce::FloatVectorOperations::copy (outputs[ch], mono.data(), numSamples);
    }

    void PreviewPlayer::loadChainAsync (PreviewChain chain, std::function<void (juce::String)> done)
    {
        juce::Thread::launch ([this, chain, cb = std::move (done)]
        {
            juce::String err;
            {
                const juce::ScopedLock sl (engineLock);
                if (engine == nullptr)
                    err = "Audio engine is not running.";
                else if (pe_load_input (engine, chain.input.getFullPathName().toRawUTF8()) != 0
                         || pe_load_model (engine, chain.model.getFullPathName().toRawUTF8()) != 0
                         || pe_load_ir (engine, chain.ir.getFullPathName().toRawUTF8()) != 0)
                    err = juce::String (pe_last_error (engine));
            }
            juce::MessageManager::callAsync ([cb, err] { cb (err); });
        });
    }

    void PreviewPlayer::togglePlay (const juce::String& id, Resolver resolve)
    {
        error.clear();
        errorId.clear();
        requestId = id;

        if (active == id && playing)
        {
            // Pause in place; resuming continues from here.
            const juce::ScopedLock sl (engineLock);
            if (engine != nullptr) pe_set_playing (engine, 0);
            setPlaying (false);
            return;
        }

        if (! ensureAudioDevice())
            return;

        const int myGeneration = ++generation;
        loading = id;
        sendChangeMessage();

        resolve (scope.wrap ([this, id, myGeneration] (Result<PreviewChain> chain)
        {
            if (myGeneration != generation)
                return;
            if (! chain.ok())
            {
                loading.clear();
                fail (chain.error.userMessage ("Preview"));
                return;
            }

            auto startPlayback = [this, id, myGeneration]
            {
                if (myGeneration != generation)
                    return;
                loading.clear();
                active = id;
                {
                    const juce::ScopedLock sl (engineLock);
                    if (engine != nullptr) pe_set_playing (engine, 1);
                }
                setPlaying (true);
            };

            // Switching players reloads and rewinds; resuming continues in place.
            if (hasLoadedChain && loadedChain == *chain && active == id)
            {
                startPlayback();
                return;
            }

            {
                const juce::ScopedLock sl (engineLock);
                if (engine != nullptr) { pe_set_playing (engine, 0); pe_seek_start (engine); }
            }
            setPlaying (false);

            loadChainAsync (*chain, scope.wrap ([this, resolved = *chain, startPlayback, myGeneration] (juce::String err)
            {
                if (myGeneration != generation)
                    return;
                if (err.isNotEmpty())
                {
                    loading.clear();
                    fail (err);
                    return;
                }
                loadedChain = resolved;
                hasLoadedChain = true;
                startPlayback();
            }));
        }));
    }

    void PreviewPlayer::stop()
    {
        ++generation;
        {
            const juce::ScopedLock sl (engineLock);
            if (engine != nullptr) { pe_set_playing (engine, 0); pe_seek_start (engine); }
        }
        active.clear();
        loading.clear();
        currentProgress = 0;
        setPlaying (false);
    }

    void PreviewPlayer::setPlaying (bool shouldPlay)
    {
        playing = shouldPlay;
        if (shouldPlay) startTimerHz (30);
        else stopTimer();
        sendChangeMessage();
    }

    void PreviewPlayer::fail (const juce::String& message)
    {
        error = message;
        errorId = requestId;
        sendChangeMessage();
    }

    void PreviewPlayer::timerCallback()
    {
        double position = 0, duration = 0;
        bool stillPlaying = false;
        {
            const juce::ScopedLock sl (engineLock);
            if (engine != nullptr)
            {
                position = pe_get_position (engine);
                duration = pe_get_duration (engine);
                stillPlaying = pe_is_playing (engine) != 0;
            }
        }
        currentProgress = duration > 0 ? juce::jlimit (0.0, 1.0, position / duration) : 0.0;

        // The engine auto-stops and rewinds at the end of the clip.
        if (! stillPlaying && playing)
        {
            currentProgress = 0;
            setPlaying (false);
            return;
        }
        sendChangeMessage();
    }
}
