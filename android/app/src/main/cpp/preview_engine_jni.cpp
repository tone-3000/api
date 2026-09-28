/**
 * JNI bridge between the Kotlin PreviewEngine and the shared native preview
 * engine, with an Oboe (AAudio/OpenSL) output stream driving pe_process().
 *
 * The engine renders mono at 48 kHz; Oboe's sample-rate conversion handles
 * devices running at other rates.
 */
#include <jni.h>
#include <oboe/Oboe.h>

#include <memory>
#include <string>

#include "preview_engine.h"

namespace {

constexpr double kSampleRate = 48000.0;
/// Sized for ~20 ms callbacks so NAM/IR run fewer, larger blocks.
constexpr int32_t kMaxFrames = 1024;

class Player : public oboe::AudioStreamDataCallback {
public:
    Player() : engine_(pe_create(kSampleRate, kMaxFrames)) {}

    ~Player() override {
        closeStream();
        pe_destroy(engine_);
    }

    pe_engine* engine() const { return engine_; }

    /// Lazily open + start the output stream on first play.
    bool ensureStreamStarted() {
        if (stream_ != nullptr && stream_->getState() == oboe::StreamState::Started) {
            return true;
        }
        if (stream_ == nullptr) {
            auto openWith = [&](int32_t framesPerCallback) -> bool {
                oboe::AudioStreamBuilder builder;
                builder.setDirection(oboe::Direction::Output)
                    ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
                    ->setSharingMode(oboe::SharingMode::Shared)
                    ->setFormat(oboe::AudioFormat::Float)
                    ->setChannelCount(oboe::ChannelCount::Stereo)
                    ->setSampleRate(static_cast<int32_t>(kSampleRate))
                    ->setSampleRateConversionQuality(oboe::SampleRateConversionQuality::Medium)
                    ->setDataCallback(this);
                if (framesPerCallback > 0) {
                    builder.setFramesPerDataCallback(framesPerCallback);
                }
                if (builder.openStream(stream_) != oboe::Result::OK) {
                    stream_ = nullptr;
                    return false;
                }
                return true;
            };
            // Prefer ~20 ms callbacks; fall back if the device rejects that size.
            if (!openWith(960) && !openWith(0)) {
                return false;
            }
        }
        return stream_->requestStart() == oboe::Result::OK;
    }

    void closeStream() {
        if (stream_ != nullptr) {
            stream_->stop();
            stream_->close();
            stream_ = nullptr;
        }
    }

    oboe::DataCallbackResult onAudioReady(
        oboe::AudioStream* stream, void* audioData, int32_t numFrames) override {
        auto* out = static_cast<float*>(audioData);
        // Render mono into the front of the buffer, then fan out to all
        // channels in place (back to front so nothing is overwritten early).
        pe_process(engine_, out, numFrames);
        const int32_t channels = stream->getChannelCount();
        if (channels > 1) {
            for (int32_t i = numFrames - 1; i >= 0; i--) {
                const float v = out[i];
                for (int32_t c = 0; c < channels; c++) {
                    out[i * channels + c] = v;
                }
            }
        }
        return oboe::DataCallbackResult::Continue;
    }

private:
    pe_engine* engine_;
    std::shared_ptr<oboe::AudioStream> stream_;
};

Player* fromHandle(jlong handle) {
    return reinterpret_cast<Player*>(handle);
}

std::string toString(JNIEnv* env, jstring value) {
    if (value == nullptr) return "";
    const char* chars = env->GetStringUTFChars(value, nullptr);
    std::string result(chars);
    env->ReleaseStringUTFChars(value, chars);
    return result;
}

} // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeCreate(JNIEnv*, jobject) {
    return reinterpret_cast<jlong>(new Player());
}

JNIEXPORT void JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeDestroy(JNIEnv*, jobject, jlong handle) {
    delete fromHandle(handle);
}

/// Load the preview chain. Returns null on success, an error message on failure.
JNIEXPORT jstring JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeLoad(
    JNIEnv* env, jobject, jlong handle, jstring modelPath, jstring irPath, jstring inputPath) {
    pe_engine* engine = fromHandle(handle)->engine();

    if (pe_load_model(engine, toString(env, modelPath).c_str()) != 0) {
        return env->NewStringUTF(pe_last_error(engine));
    }
    if (pe_load_ir(engine, toString(env, irPath).c_str()) != 0) {
        return env->NewStringUTF(pe_last_error(engine));
    }
    if (pe_load_input(engine, toString(env, inputPath).c_str()) != 0) {
        return env->NewStringUTF(pe_last_error(engine));
    }
    return nullptr;
}

JNIEXPORT jboolean JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeSetPlaying(
    JNIEnv*, jobject, jlong handle, jboolean playing) {
    Player* player = fromHandle(handle);
    if (playing && !player->ensureStreamStarted()) {
        return JNI_FALSE;
    }
    pe_set_playing(player->engine(), playing ? 1 : 0);
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeIsPlaying(JNIEnv*, jobject, jlong handle) {
    return pe_is_playing(fromHandle(handle)->engine()) != 0 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jdouble JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeGetPosition(JNIEnv*, jobject, jlong handle) {
    return pe_get_position(fromHandle(handle)->engine());
}

JNIEXPORT jdouble JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeGetDuration(JNIEnv*, jobject, jlong handle) {
    return pe_get_duration(fromHandle(handle)->engine());
}

JNIEXPORT void JNICALL
Java_com_example_tone3000_audio_PreviewEngine_nativeSeekStart(JNIEnv*, jobject, jlong handle) {
    pe_seek_start(fromHandle(handle)->engine());
}

} // extern "C"
