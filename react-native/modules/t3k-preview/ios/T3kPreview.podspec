Pod::Spec.new do |s|
  s.name           = 'T3kPreview'
  s.version        = '1.0.0'
  s.summary        = 'TONE3000 preview engine (NAM + IR) for React Native'
  s.description    = 'Plays a DI clip through a NAM capture and/or cab IR using the shared native preview engine.'
  s.author         = 'TONE3000'
  s.license        = 'MIT'
  s.homepage       = 'https://www.tone3000.com/api'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # `native` is a symlink to the repo's shared native/ directory: the C++
  # preview engine, NeuralAmpModelerCore (git submodule) and the bundled assets.
  nam = 'native/deps/NeuralAmpModelerCore'
  adt = "#{nam}/Dependencies/AudioDSPTools"

  s.source_files = [
    '*.swift',
    'native/preview-engine/preview_engine.{h,cpp}',
    "#{nam}/NAM/**/*.{h,cpp}",
    "#{adt}/dsp/{dsp,wav,ImpulseResponse}.{h,cpp}",
    "#{adt}/dsp/Resample.h",
  ]
  # Only the C API is public, so Swift sees it through the module's umbrella
  # header without parsing any C++.
  s.public_header_files = 'native/preview-engine/preview_engine.h'
  s.resource_bundles = { 'T3kPreviewAssets' => ['native/preview-assets/*.{wav,nam}'] }

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => [
      '"${PODS_TARGET_SRCROOT}/native/preview-engine"',
      "\"${PODS_TARGET_SRCROOT}/#{nam}\"",
      "\"${PODS_TARGET_SRCROOT}/#{adt}\"",
      "\"${PODS_TARGET_SRCROOT}/#{nam}/Dependencies/eigen\"",
      "\"${PODS_TARGET_SRCROOT}/#{nam}/Dependencies/nlohmann\"",
    ].join(' '),
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) NAM_ENABLE_A2_FAST=1 EIGEN_NO_DEBUG EIGEN_DONT_PARALLELIZE NDEBUG',
  }
  # NAM/Eigen at -O0 can't keep up with a 48 kHz audio callback, so the DSP
  # sources are optimized even in Debug builds. (Applies to C/C++, not Swift.)
  s.compiler_flags = '-O3 -ffast-math'
end
