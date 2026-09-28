# Native TONE3000 preview engine: NeuralAmpModelerCore + AudioDSPTools IR
# convolution behind the small C API in preview_engine.h.
#
# Consumed by:
#   - android/app/src/main/cpp/CMakeLists.txt (add_subdirectory)
#   - react-native/modules/t3k-preview/android (add_subdirectory)
#   - ios/ and the React Native podspec compile the same sources directly
cmake_minimum_required(VERSION 3.22)
project(preview_engine CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(NAM_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../deps/NeuralAmpModelerCore")
set(NAM_DEPS "${NAM_ROOT}/Dependencies")
set(ADT_ROOT "${NAM_DEPS}/AudioDSPTools")

if(NOT EXISTS "${NAM_ROOT}/NAM/dsp.h")
  message(FATAL_ERROR "NeuralAmpModelerCore is missing. Run: git submodule update --init --recursive")
endif()

file(GLOB NAM_SOURCES "${NAM_ROOT}/NAM/*.cpp" "${NAM_ROOT}/NAM/*/*.cpp")
set(ADT_SOURCES
  "${ADT_ROOT}/dsp/dsp.cpp"
  "${ADT_ROOT}/dsp/wav.cpp"
  "${ADT_ROOT}/dsp/ImpulseResponse.cpp"
)

# OBJECT (not STATIC) library: NAM registers its architecture parsers with
# static initializers, which a static archive would drop for unreferenced
# translation units ("No config parser registered for architecture: ...").
add_library(preview_engine OBJECT
  preview_engine.cpp
  ${NAM_SOURCES}
  ${ADT_SOURCES}
)

set_target_properties(preview_engine PROPERTIES POSITION_INDEPENDENT_CODE ON)

target_include_directories(preview_engine
  PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}"
  PRIVATE
    "${NAM_ROOT}"
    "${ADT_ROOT}"
  SYSTEM PRIVATE
    "${NAM_DEPS}/eigen"
    "${NAM_DEPS}/nlohmann"
)

# Route A2-shaped models (the examples request architecture=2) through NAM's
# hand-optimized WaveNet implementation.
target_compile_definitions(preview_engine PRIVATE
  NAM_ENABLE_A2_FAST
  EIGEN_NO_DEBUG
  EIGEN_DONT_PARALLELIZE
)

# NAM/Eigen at -O0 cannot keep up with a 48 kHz callback (dropouts/silence).
# Keep -O3 even when the host Gradle/Xcode configuration is Debug.
if(NOT MSVC)
  target_compile_options(preview_engine PRIVATE -O3 -ffast-math -fvisibility=hidden)
  target_compile_definitions(preview_engine PRIVATE NDEBUG)
endif()

# Host-only smoke test (not built by the apps)
option(PE_BUILD_TOOLS "Build host smoke-test tools" OFF)
if(PE_BUILD_TOOLS)
  add_executable(pe_smoke_test tools/smoke_test.cpp)
  target_link_libraries(pe_smoke_test PRIVATE preview_engine)
endif()
