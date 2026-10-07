# TONE3000 example app for JUCE (macOS + Windows).
#
# One CMake project, no generated IDE files checked in:
#
#   cmake -B build -DCMAKE_BUILD_TYPE=Release
#   cmake --build build --config Release
#
# JUCE is fetched at configure time (first configure takes a few minutes).
# Configuration comes from juce/.env (see .env.example). See README.md.
cmake_minimum_required(VERSION 3.22)

# JUCE needs C enabled, and the macOS deployment target must be set before project().
if(APPLE AND NOT CMAKE_OSX_DEPLOYMENT_TARGET)
  set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS version")
endif()

project(TONE3000Example VERSION 0.1.0 LANGUAGES C CXX)

if(NOT APPLE AND NOT WIN32)
  message(FATAL_ERROR "This example targets macOS and Windows only.")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set_property(GLOBAL PROPERTY USE_FOLDERS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

# ------------------------------------------------------------------------------
# Options
# ------------------------------------------------------------------------------

# The embedded WebView Select example is optional. Turn it off if your
# integration only uses the system browser: it removes the WebView dependency
# entirely (no WebView2 SDK download on Windows, no WebKit on macOS).
option(T3K_EMBEDDED_WEBVIEW "Build the in-app WebView Select example" ON)

# ------------------------------------------------------------------------------
# Configuration: juce/.env  ->  generated T3KConfig.h
# ------------------------------------------------------------------------------

function(t3k_read_env var_name out_var)
  if(DEFINED ${var_name})           # -D${var_name}=... on the command line wins
    set(${out_var} "${${var_name}}" PARENT_SCOPE)
    return()
  endif()
  if(DEFINED ENV{${var_name}})      # then the process environment
    set(${out_var} "$ENV{${var_name}}" PARENT_SCOPE)
    return()
  endif()
  set(env_file "${CMAKE_CURRENT_SOURCE_DIR}/.env")
  if(EXISTS "${env_file}")
    file(STRINGS "${env_file}" lines)
    foreach(line IN LISTS lines)
      if(line MATCHES "^[ \t]*${var_name}[ \t]*=[ \t]*(.*)$")
        string(STRIP "${CMAKE_MATCH_1}" value)
        string(REGEX REPLACE "^[\"'](.*)[\"']$" "\\1" value "${value}")
        set(${out_var} "${value}" PARENT_SCOPE)
        return()
      endif()
    endforeach()
  endif()
  set(${out_var} "" PARENT_SCOPE)
endfunction()

# Re-run CMake when .env changes.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/.env")

t3k_read_env(T3K_PUBLISHABLE_KEY T3K_PUBLISHABLE_KEY_VALUE)
t3k_read_env(T3K_API_DOMAIN T3K_API_DOMAIN_VALUE)
if(NOT T3K_API_DOMAIN_VALUE)
  set(T3K_API_DOMAIN_VALUE "https://www.tone3000.com")
endif()
if(NOT T3K_PUBLISHABLE_KEY_VALUE)
  message(WARNING "T3K_PUBLISHABLE_KEY is not set. Copy .env.example to .env and add your t3k_pub_ key.")
endif()

configure_file(Source/T3K/T3KConfig.h.in "${CMAKE_BINARY_DIR}/generated/T3KConfig.h" @ONLY)

# ------------------------------------------------------------------------------
# JUCE
# ------------------------------------------------------------------------------

include(FetchContent)
FetchContent_Declare(JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG        9.0.3
  GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(JUCE)

# ------------------------------------------------------------------------------
# Windows: WebView2 SDK (build-time only; see README for the runtime side)
# ------------------------------------------------------------------------------
#
# JUCE links WebView2LoaderStatic.lib from the Microsoft.Web.WebView2 NuGet
# package. Rather than asking everyone to run the NuGet CLI, download the
# package (it is a zip) into the build tree and point JUCE's FindWebView2 at it.
if(WIN32 AND T3K_EMBEDDED_WEBVIEW)
  set(T3K_WEBVIEW2_VERSION "1.0.1901.177")
  set(_wv2_root "${CMAKE_BINARY_DIR}/webview2")
  set(_wv2_pkg  "${_wv2_root}/Microsoft.Web.WebView2.${T3K_WEBVIEW2_VERSION}")
  if(NOT EXISTS "${_wv2_pkg}/build/native/include/WebView2.h")
    message(STATUS "Downloading Microsoft.Web.WebView2 ${T3K_WEBVIEW2_VERSION} SDK")
    file(DOWNLOAD
      "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${T3K_WEBVIEW2_VERSION}"
      "${_wv2_root}/webview2.nupkg"
      STATUS _wv2_status SHOW_PROGRESS)
    list(GET _wv2_status 0 _wv2_code)
    if(NOT _wv2_code EQUAL 0)
      message(FATAL_ERROR "WebView2 SDK download failed (${_wv2_status}). "
        "Install the package another way and pass -DJUCE_WEBVIEW2_PACKAGE_LOCATION=<dir>, "
        "or configure with -DT3K_EMBEDDED_WEBVIEW=OFF.")
    endif()
    file(ARCHIVE_EXTRACT INPUT "${_wv2_root}/webview2.nupkg" DESTINATION "${_wv2_pkg}")
  endif()
  if(NOT JUCE_WEBVIEW2_PACKAGE_LOCATION)
    set(JUCE_WEBVIEW2_PACKAGE_LOCATION "${_wv2_root}")
  endif()
endif()

# ------------------------------------------------------------------------------
# Shared native preview engine (native/preview-engine)
# ------------------------------------------------------------------------------

if(MSVC)
  # The engine must be optimized even in Debug (see native/preview-engine/CMakeLists.txt).
  # /RTC1 is incompatible with /O2, so drop it for the engine's directory only.
  set(_saved_debug_flags "${CMAKE_CXX_FLAGS_DEBUG}")
  string(REPLACE "/RTC1" "" CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG}")
endif()
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../native/preview-engine" preview_engine)
if(MSVC)
  set(CMAKE_CXX_FLAGS_DEBUG "${_saved_debug_flags}")
  target_compile_options(preview_engine PRIVATE $<$<CONFIG:Debug>:/O2> /EHsc /bigobj)
  target_compile_definitions(preview_engine PRIVATE NOMINMAX _USE_MATH_DEFINES)
endif()

# Preview assets shipped inside the app (same files every example uses).
juce_add_binary_data(T3KAssets
  NAMESPACE T3KAssets
  SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/../native/preview-assets/di-guitar.wav"
    "${CMAKE_CURRENT_SOURCE_DIR}/../native/preview-assets/fallback-amp.nam"
    "${CMAKE_CURRENT_SOURCE_DIR}/../native/preview-assets/fallback-cab.wav"
)
set_target_properties(T3KAssets PROPERTIES POSITION_INDEPENDENT_CODE ON)

# ------------------------------------------------------------------------------
# The app
# ------------------------------------------------------------------------------

set(_webview2 FALSE)
if(WIN32 AND T3K_EMBEDDED_WEBVIEW)
  set(_webview2 TRUE)
endif()

juce_add_gui_app(TONE3000Example
  PRODUCT_NAME   "TONE3000 Example"
  COMPANY_NAME   "Example"
  BUNDLE_ID      "com.example.tone3000.juce"
  VERSION        "${PROJECT_VERSION}"
  NEEDS_WEBVIEW2 ${_webview2}
)

juce_generate_juce_header(TONE3000Example)

target_sources(TONE3000Example PRIVATE
  Source/Main.cpp
  Source/T3K/Types.cpp
  Source/T3K/Http.cpp
  Source/T3K/OAuth.cpp
  Source/T3K/SecureStore.cpp
  Source/T3K/Client.cpp
  Source/T3K/LoopbackServer.cpp
  Source/T3K/AuthFlow.cpp
  Source/Audio/PreviewPlayer.cpp
  Source/UI/Widgets.cpp
  Source/UI/ImageLoader.cpp
  Source/UI/ToneDetail.cpp
  Source/UI/SelectDemo.cpp
  Source/UI/LoadToneDemo.cpp
  Source/UI/FullApiDemo.cpp
  Source/UI/MainComponent.cpp
)

if(T3K_EMBEDDED_WEBVIEW)
  target_sources(TONE3000Example PRIVATE Source/T3K/WebViewAuthFlow.cpp)
endif()

target_include_directories(TONE3000Example PRIVATE
  Source
  "${CMAKE_BINARY_DIR}/generated"
)

target_compile_definitions(TONE3000Example PRIVATE
  JUCE_USE_CURL=0
  JUCE_WEB_BROWSER=$<BOOL:${T3K_EMBEDDED_WEBVIEW}>
  JUCE_MODAL_LOOPS_PERMITTED=0
  DONT_SET_USING_JUCE_NAMESPACE=1
  JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:TONE3000Example,JUCE_PRODUCT_NAME>"
  JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:TONE3000Example,JUCE_VERSION>"
  T3K_EMBEDDED_WEBVIEW=$<BOOL:${T3K_EMBEDDED_WEBVIEW}>
  $<$<BOOL:${_webview2}>:JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1>
)

target_link_libraries(TONE3000Example PRIVATE
  T3KAssets
  preview_engine
  juce::juce_gui_extra
  juce::juce_audio_utils
  juce::juce_cryptography
  juce::juce_recommended_config_flags
  juce::juce_recommended_lto_flags
  juce::juce_recommended_warning_flags
)

if(APPLE)
  # Keychain token storage (Source/T3K/SecureStore.cpp)
  target_link_libraries(TONE3000Example PRIVATE "-framework Security")
elseif(WIN32)
  # DPAPI token storage
  target_link_libraries(TONE3000Example PRIVATE crypt32)
  target_compile_definitions(TONE3000Example PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()
