cmake_minimum_required(VERSION 3.22)
project(t3k_preview LANGUAGES CXX)

# Shared engine (NAM Core + AudioDSPTools + preview_engine C API)
add_subdirectory(
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../native/preview-engine
    ${CMAKE_CURRENT_BINARY_DIR}/preview-engine
)

find_package(oboe REQUIRED CONFIG)

add_library(t3k_preview SHARED
    preview_engine_jni.cpp
)

target_link_libraries(t3k_preview
    PRIVATE
        preview_engine
        oboe::oboe
        android
        log
)
