// Host-only smoke test: render the bundled DI clip through a NAM model and an
// optional IR, and fail if the output is silent.
//
//   cmake -S native/preview-engine -B native/build -DPE_BUILD_TOOLS=ON -DCMAKE_BUILD_TYPE=Release
//   cmake --build native/build
//   native/build/pe_smoke_test [model.nam] [input.wav] [ir.wav]
//
// Defaults resolve relative to the repo root.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

#include "preview_engine.h"

int main(int argc, char** argv)
{
  const char* model = argc > 1 ? argv[1] : "native/preview-assets/fallback-amp.nam";
  const char* input = argc > 2 ? argv[2] : "native/preview-assets/di-guitar.wav";
  const char* ir = argc > 3 ? argv[3] : "native/preview-assets/fallback-cab.wav";

  constexpr int kFrames = 1024;
  pe_engine* e = pe_create(48000.0, kFrames);
  if (pe_load_model(e, model) != 0) {
    std::fprintf(stderr, "model: %s\n", pe_last_error(e));
    return 1;
  }
  if (pe_load_input(e, input) != 0) {
    std::fprintf(stderr, "input: %s\n", pe_last_error(e));
    return 1;
  }
  if (ir[0] != '\0' && pe_load_ir(e, ir) != 0) {
    std::fprintf(stderr, "ir: %s\n", pe_last_error(e));
    return 1;
  }

  std::printf("duration: %.2fs\n", pe_get_duration(e));
  pe_set_playing(e, 1);

  std::vector<float> buf(kFrames);
  double peak = 0.0, rms = 0.0;
  long n = 0;
  for (int i = 0; i < 47 && pe_is_playing(e); i++) { // ~1s at 48 kHz
    pe_process(e, buf.data(), kFrames);
    for (float v : buf) {
      peak = std::max(peak, static_cast<double>(std::fabs(v)));
      rms += static_cast<double>(v) * static_cast<double>(v);
      n++;
    }
  }
  rms = std::sqrt(rms / static_cast<double>(n));
  std::printf("rendered %ld samples  peak=%.4f  rms=%.4f  pos=%.2fs\n", n, peak, rms, pe_get_position(e));

  pe_destroy(e);
  if (peak <= 0.0001) {
    std::fprintf(stderr, "FAIL: output is silent\n");
    return 1;
  }
  std::printf("OK\n");
  return 0;
}
