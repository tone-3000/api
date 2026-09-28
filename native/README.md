# Shared native preview engine

A small C++ engine used by the iOS, Android and React Native examples to play TONE3000
previews. It mirrors the web player's chain: a bundled DI clip goes through a NAM model
([NeuralAmpModelerCore](https://github.com/sdatkinson/NeuralAmpModelerCore)), then an
optional cab IR, and renders mono audio.

```
preview-engine/    C API (preview_engine.h), implementation, CMake target
preview-assets/    di-guitar.wav (input), fallback-amp.nam, fallback-cab.wav
deps/              NeuralAmpModelerCore (git submodule)
```

## API

`preview_engine.h` is a plain C API, so it's easy to bind from Swift, JNI or anything
else:

```c
pe_engine* e = pe_create(48000.0, 4096);
pe_load_input(e, "di-guitar.wav");
pe_load_model(e, "model.nam");       // "" clears (passthrough)
pe_load_ir(e, "fallback-cab.wav");   // "" clears
pe_set_playing(e, 1);
// on the audio thread:
pe_process(e, out, num_frames);      // realtime-safe; silence while loading or stopped
```

Loaders run on any non-audio thread. The transport stops and rewinds itself at the end
of the clip. `pe_get_position` and `pe_get_duration` drive progress UI.

## Building

Platforms compile the sources directly: XcodeGen on iOS, CMake `add_subdirectory` on
Android, the podspec and CMake in the React Native module. Keep these settings on every
platform:

- C++20 and `NAM_ENABLE_A2_FAST=1` (fast path for A2 models).
- DSP sources at `-O3` even in debug builds. NAM at `-O0` can't render in real time.

A desktop smoke test renders the preview chain offline. Run it from the repo root; it
defaults to the bundled assets, or pass `model.nam [input.wav] [ir.wav]`:

```bash
cmake -S native/preview-engine -B native/build -DCMAKE_BUILD_TYPE=Release -DPE_BUILD_TOOLS=ON
cmake --build native/build
./native/build/pe_smoke_test
```
