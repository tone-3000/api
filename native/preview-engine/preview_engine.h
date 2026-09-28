/**
 * Native TONE3000 preview engine, shared by the iOS, Android and React Native
 * examples.
 *
 * Mirrors the audio chain of the web example's neural-amp-modeler-wasm player:
 *
 *   DI input WAV -> NAM model (NeuralAmpModelerCore) -> optional cab IR -> out
 *
 * The engine renders MONO audio at the sample rate given to pe_create(). The
 * example apps run their audio stream at 48 kHz, the rate TONE3000 NAM
 * captures (and the bundled DI clip / IR) are recorded at.
 *
 * Threading model: loader functions and pe_set_playing() may be called from
 * any non-audio thread; pe_process() is called from the realtime audio
 * thread and outputs silence rather than blocking if a load is in progress.
 */
#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct pe_engine pe_engine;

/** Create an engine that renders mono audio at `sample_rate`. */
pe_engine* pe_create(double sample_rate, int32_t max_frames);
void pe_destroy(pe_engine* engine);

/**
 * Load a .nam model file. Passing NULL or "" clears the model (passthrough).
 * Returns 0 on success; on failure the previous model is kept and
 * pe_last_error() describes the problem.
 */
int32_t pe_load_model(pe_engine* engine, const char* path);

/** Load a cab IR WAV. Passing NULL or "" clears the IR. Returns 0 on success. */
int32_t pe_load_ir(pe_engine* engine, const char* path);

/** Load the DI input WAV that the transport plays. Returns 0 on success. */
int32_t pe_load_input(pe_engine* engine, const char* path);

/** Bypass the NAM + IR chain (DI plays dry). */
void pe_set_bypassed(pe_engine* engine, int32_t bypassed);

/**
 * Start/stop playback. Starting resumes from the current position; the
 * transport auto-stops and rewinds when the clip ends (matching the web
 * player's `ended` behavior).
 */
void pe_set_playing(pe_engine* engine, int32_t playing);
int32_t pe_is_playing(const pe_engine* engine);

/** Transport position/duration in seconds (for progress UI). */
double pe_get_position(const pe_engine* engine);
double pe_get_duration(const pe_engine* engine);
void pe_seek_start(pe_engine* engine);

/**
 * Realtime-safe render callback. Writes `num_frames` mono samples into `out`.
 * Writes silence when stopped, when no input is loaded, or when a loader
 * currently holds the engine lock.
 */
void pe_process(pe_engine* engine, float* out, int32_t num_frames);

/** Message for the most recent loader failure ("" when none). */
const char* pe_last_error(const pe_engine* engine);

#ifdef __cplusplus
}
#endif
