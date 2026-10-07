// Async artwork loader: URL -> decoded juce::Image, fetched and downsampled on
// its own small thread pool and cached in memory. This stands in for what a
// browser gives the web example for free (parallel connections + image cache).
//
// Why not just fetch and decode? Tone covers are ~1000 px JPEGs shown at
// 100-280 logical px: decoded as-is each one costs ~4 MB, and a grid page is
// a dozen of them. The worker cover-crops each image to a canonical square
// (kArtSide for covers, kAvatarSide for avatars) before it is cached, and
// consumers resample that once more to their own box and pixel scale.
//
// Requests are handles: destroying one (a card scrolled off and deleted)
// drops its callback, and a queued job nobody wants any more is skipped.
#pragma once

#include <JuceHeader.h>
#include <functional>
#include <map>
#include <optional>
#include <set>
#include <vector>

namespace ui
{
    class ImageLoader
    {
    public:
        ImageLoader();
        ~ImageLoader();

        /// Cached sides in device pixels: a 220 px card on a 2x display, and a 28 px avatar on 2x.
        static constexpr int kArtSide = 512;
        static constexpr int kAvatarSide = 64;

        /// Handle for a pending request; destroying it drops the callback.
        class Request
        {
        public:
            Request() = default;
            ~Request() { cancel(); }
            Request (const Request&) = delete;
            Request& operator= (const Request&) = delete;
            void cancel();

        private:
            friend class ImageLoader;
            ImageLoader* loader = nullptr;
            juce::uint64 id = 0;
        };

        /// Resolve `url` as a `side` x `side` cover-cropped square (never upscaled).
        /// `onDone` runs on the message thread, synchronously when already cached;
        /// a failed fetch delivers a null Image so the caller can show a placeholder.
        void load (const juce::String& url, int side, Request& request, std::function<void (const juce::Image&)> onDone);

        /// Result for a URL if already known (null Image = load failed).
        std::optional<juce::Image> cached (const juce::String& url) const;

    private:
        class Job;
        struct Pending
        {
            juce::uint64 id;
            juce::String url;
            std::function<void (const juce::Image&)> onDone;
        };

        juce::Image produce (const juce::String& url, int side, Job& job);   // worker thread
        void deliver (const juce::String& url, juce::Image image);           // message thread

        // Enough to overlap per-request latency across a card grid without a burst of sockets.
        static constexpr int kThreads = 4;
        // ~45 covers at kArtSide plus any number of avatars; oldest out first.
        static constexpr size_t kBudgetBytes = 48u << 20;
        static constexpr size_t kMaxEntries = 512;

        juce::CriticalSection lock;
        std::map<juce::String, juce::Image> cache;   // null Image = failed
        std::vector<juce::String> order;             // insertion order, for eviction
        size_t totalBytes = 0;
        std::set<juce::String> queued;               // URLs with a job in the pool
        std::vector<Pending> pending;
        juce::uint64 nextId = 1;
        // Declared last: its destructor stops the workers before anything they touch goes away.
        juce::ThreadPool pool;

        JUCE_DECLARE_WEAK_REFERENCEABLE (ImageLoader)
    };

    /// The app-wide loader (owned by the application object).
    ImageLoader& imageLoader();

    /// Cover-fit `image` into a `w` x `h` logical box at `scale` (CSS object-fit: cover).
    juce::Image coverFit (const juce::Image& image, int w, int h, float scale);
}
