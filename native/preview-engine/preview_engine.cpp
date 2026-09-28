#include "preview_engine.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "NAM/dsp.h"
#include "NAM/get_dsp.h"
#include "dsp/ImpulseResponse.h"

namespace {

// Match the NAM plugin's output-normalization target.
constexpr double kTargetLoudnessDb = -18.0;
// Cab IRs add a lot of energy even after AudioDSPTools' ImpulseResponse applies
// its fixed -18 dB cut; this extra trim keeps amp-only and amp+IR previews at
// comparable levels (~-11 dBFS RMS on the bundled DI clip).
constexpr double kIrTrimDb = -3.0;
constexpr double kOutputGainDb = 0.0;

double dbToGain(double db)
{
  return std::pow(10.0, db / 20.0);
}

// ---------------------------------------------------------------------------
// Minimal WAV reader for DI inputs.
//
// AudioDSPTools' dsp::wav::Load is mono-only, so RIFF/WAVE PCM (16/24/32-bit
// int, 32-bit float) is read here, downmixed to mono, and linearly resampled
// to the engine rate when needed.
// ---------------------------------------------------------------------------

bool readLE(std::ifstream& f, void* dst, size_t n)
{
  f.read(reinterpret_cast<char*>(dst), static_cast<std::streamsize>(n));
  return static_cast<size_t>(f.gcount()) == n;
}

bool loadWavMono(const std::string& path, double targetRate, std::vector<float>& out, std::string& error)
{
  std::ifstream f(path, std::ios::binary);
  if (!f) {
    error = "Could not open " + path;
    return false;
  }

  char riff[4], wave[4];
  uint32_t riffSize = 0;
  if (!readLE(f, riff, 4) || !readLE(f, &riffSize, 4) || !readLE(f, wave, 4)
      || std::memcmp(riff, "RIFF", 4) != 0 || std::memcmp(wave, "WAVE", 4) != 0) {
    error = "Not a RIFF/WAVE file: " + path;
    return false;
  }

  uint16_t format = 0, channels = 0, bitsPerSample = 0;
  uint32_t sampleRate = 0;
  std::vector<char> data;

  while (f) {
    char chunkId[4];
    uint32_t chunkSize = 0;
    if (!readLE(f, chunkId, 4) || !readLE(f, &chunkSize, 4)) break;

    if (std::memcmp(chunkId, "fmt ", 4) == 0) {
      std::vector<char> fmt(chunkSize);
      if (chunkSize < 16 || !readLE(f, fmt.data(), chunkSize)) break;
      std::memcpy(&format, fmt.data(), 2);
      std::memcpy(&channels, fmt.data() + 2, 2);
      std::memcpy(&sampleRate, fmt.data() + 4, 4);
      std::memcpy(&bitsPerSample, fmt.data() + 14, 2);
      // WAVE_FORMAT_EXTENSIBLE: the sub-format GUID starts with the real format tag
      if (format == 0xFFFE && chunkSize >= 26) {
        std::memcpy(&format, fmt.data() + 24, 2);
      }
    } else if (std::memcmp(chunkId, "data", 4) == 0) {
      data.resize(chunkSize);
      if (!readLE(f, data.data(), chunkSize)) break;
    } else {
      f.seekg(chunkSize + (chunkSize & 1), std::ios::cur);
    }
    if (!data.empty() && channels != 0) break;
  }

  if (channels == 0 || sampleRate == 0 || data.empty()) {
    error = "Missing fmt/data chunk in " + path;
    return false;
  }

  const bool supported = (format == 3 && bitsPerSample == 32)
    || (format == 1 && (bitsPerSample == 16 || bitsPerSample == 24 || bitsPerSample == 32));
  if (!supported) {
    error = "Unsupported WAV format (" + std::to_string(format) + "/" + std::to_string(bitsPerSample)
      + " bit) in " + path;
    return false;
  }

  const size_t bytesPerSample = bitsPerSample / 8;
  const size_t frameCount = data.size() / (bytesPerSample * channels);
  std::vector<float> mono(frameCount, 0.0f);

  auto sampleAt = [&](size_t frame, size_t ch) -> float {
    const char* p = data.data() + (frame * channels + ch) * bytesPerSample;
    if (format == 3) {
      float v;
      std::memcpy(&v, p, 4);
      return v;
    }
    if (bitsPerSample == 16) {
      int16_t v;
      std::memcpy(&v, p, 2);
      return static_cast<float>(v) / 32768.0f;
    }
    if (bitsPerSample == 24) {
      int32_t v = (static_cast<uint8_t>(p[0])) | (static_cast<uint8_t>(p[1]) << 8)
                  | (static_cast<int8_t>(p[2]) << 16);
      return static_cast<float>(v) / 8388608.0f;
    }
    int32_t v;
    std::memcpy(&v, p, 4);
    return static_cast<float>(v) / 2147483648.0f;
  };

  for (size_t i = 0; i < frameCount; i++) {
    float acc = 0.0f;
    for (size_t ch = 0; ch < channels; ch++) acc += sampleAt(i, ch);
    mono[i] = acc / static_cast<float>(channels);
  }

  if (static_cast<double>(sampleRate) == targetRate || mono.empty()) {
    out = std::move(mono);
    return true;
  }

  // Linear resample (fine for preview DI material)
  const double ratio = static_cast<double>(sampleRate) / targetRate;
  const size_t outFrames = static_cast<size_t>(static_cast<double>(mono.size()) / ratio);
  out.resize(outFrames);
  for (size_t i = 0; i < outFrames; i++) {
    const double src = static_cast<double>(i) * ratio;
    const size_t i0 = static_cast<size_t>(src);
    const size_t i1 = std::min(i0 + 1, mono.size() - 1);
    const float frac = static_cast<float>(src - static_cast<double>(i0));
    out[i] = mono[i0] * (1.0f - frac) + mono[i1] * frac;
  }
  return true;
}

} // namespace

struct pe_engine {
  double sampleRate;
  int32_t maxFrames;

  // Guards everything below. pe_process() only try_locks.
  std::mutex mutex;

  std::unique_ptr<nam::DSP> model;
  double modelGain = 1.0;
  std::unique_ptr<dsp::ImpulseResponse> ir;

  std::vector<float> input;
  std::atomic<int64_t> position{0};
  std::atomic<bool> playing{false};
  std::atomic<bool> bypassed{false};

  // Scratch buffers (double: the NAM_SAMPLE / DSP_SAMPLE default)
  std::vector<double> scratchIn;
  std::vector<double> scratchOut;

  std::string lastError;
};

pe_engine* pe_create(double sample_rate, int32_t max_frames)
{
  auto* e = new pe_engine();
  e->sampleRate = sample_rate;
  e->maxFrames = max_frames;
  e->scratchIn.resize(static_cast<size_t>(max_frames));
  e->scratchOut.resize(static_cast<size_t>(max_frames));
  return e;
}

void pe_destroy(pe_engine* engine)
{
  delete engine;
}

int32_t pe_load_model(pe_engine* engine, const char* path)
{
  if (path == nullptr || path[0] == '\0') {
    std::lock_guard<std::mutex> lock(engine->mutex);
    engine->model.reset();
    engine->modelGain = 1.0;
    return 0;
  }
  // Parse and warm up outside the lock so the audio thread isn't starved.
  std::unique_ptr<nam::DSP> model;
  double gain = 1.0;
  try {
    model = nam::get_dsp(std::filesystem::path(path));
    model->Reset(engine->sampleRate, engine->maxFrames);
    if (model->HasLoudness()) gain = dbToGain(kTargetLoudnessDb - model->GetLoudness());
  } catch (const std::exception& ex) {
    std::lock_guard<std::mutex> lock(engine->mutex);
    engine->lastError = std::string("Failed to load NAM model: ") + ex.what();
    return 1;
  }
  std::lock_guard<std::mutex> lock(engine->mutex);
  engine->model = std::move(model);
  engine->modelGain = gain;
  return 0;
}

int32_t pe_load_ir(pe_engine* engine, const char* path)
{
  if (path == nullptr || path[0] == '\0') {
    std::lock_guard<std::mutex> lock(engine->mutex);
    engine->ir.reset();
    return 0;
  }
  auto ir = std::make_unique<dsp::ImpulseResponse>(path, engine->sampleRate);
  std::lock_guard<std::mutex> lock(engine->mutex);
  if (ir->GetWavState() != dsp::wav::LoadReturnCode::SUCCESS) {
    engine->lastError = "Failed to load IR: " + dsp::wav::GetMsgForLoadReturnCode(ir->GetWavState());
    return 1;
  }
  engine->ir = std::move(ir);
  return 0;
}

int32_t pe_load_input(pe_engine* engine, const char* path)
{
  std::vector<float> audio;
  std::string error;
  const bool ok = loadWavMono(path ? path : "", engine->sampleRate, audio, error);
  std::lock_guard<std::mutex> lock(engine->mutex);
  if (!ok) {
    engine->lastError = error;
    return 1;
  }
  engine->input = std::move(audio);
  engine->position.store(0);
  return 0;
}

void pe_set_bypassed(pe_engine* engine, int32_t bypassed)
{
  engine->bypassed.store(bypassed != 0);
}

void pe_set_playing(pe_engine* engine, int32_t playing)
{
  engine->playing.store(playing != 0);
}

int32_t pe_is_playing(const pe_engine* engine)
{
  return engine->playing.load() ? 1 : 0;
}

double pe_get_position(const pe_engine* engine)
{
  return static_cast<double>(engine->position.load()) / engine->sampleRate;
}

double pe_get_duration(const pe_engine* engine)
{
  // Only mutated under lock by pe_load_input; the unlocked size read is
  // acceptable because inputs are loaded while the transport is stopped.
  return static_cast<double>(engine->input.size()) / engine->sampleRate;
}

void pe_seek_start(pe_engine* engine)
{
  engine->position.store(0);
}

const char* pe_last_error(const pe_engine* engine)
{
  return engine->lastError.c_str();
}

void pe_process(pe_engine* engine, float* out, int32_t num_frames)
{
  std::fill(out, out + num_frames, 0.0f);

  if (!engine->playing.load()) return;

  std::unique_lock<std::mutex> lock(engine->mutex, std::try_to_lock);
  if (!lock.owns_lock()) return; // a loader is busy; render silence

  const int64_t total = static_cast<int64_t>(engine->input.size());
  int64_t pos = engine->position.load();
  if (total == 0 || pos >= total) {
    engine->playing.store(false);
    engine->position.store(0);
    return;
  }

  int32_t rendered = 0;
  while (rendered < num_frames && pos < total) {
    const int32_t block = std::min(num_frames - rendered,
                                   std::min(engine->maxFrames, static_cast<int32_t>(total - pos)));

    double* in = engine->scratchIn.data();
    double* processed = engine->scratchOut.data();
    for (int32_t i = 0; i < block; i++) in[i] = static_cast<double>(engine->input[pos + i]);

    const bool bypass = engine->bypassed.load();
    double gain = 1.0;

    if (!bypass && engine->model) {
      double* inPtrs[1] = {in};
      double* outPtrs[1] = {processed};
      engine->model->process(inPtrs, outPtrs, block);
      gain *= engine->modelGain;
    } else {
      std::memcpy(processed, in, sizeof(double) * static_cast<size_t>(block));
    }

    if (!bypass && engine->ir) {
      double* irIn[1] = {processed};
      double** irOut = engine->ir->Process(irIn, 1, static_cast<size_t>(block));
      processed = irOut[0];
      gain *= dbToGain(kIrTrimDb);
    }

    gain *= dbToGain(kOutputGainDb);
    for (int32_t i = 0; i < block; i++) {
      // tanh soft clip: transparent at normalized preview levels, protects the
      // listener from models without loudness metadata.
      out[rendered + i] = static_cast<float>(std::tanh(processed[i] * gain));
    }

    rendered += block;
    pos += block;
  }

  if (pos >= total) {
    engine->playing.store(false);
    engine->position.store(0);
  } else {
    engine->position.store(pos);
  }
}
