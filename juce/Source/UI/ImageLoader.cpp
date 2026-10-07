#include "ImageLoader.h"

#include <algorithm>

namespace ui
{
    namespace
    {
        constexpr int kConnectTimeoutMs = 8000;
        constexpr int kShutdownGraceMs = 2000;

        ImageLoader* sharedLoader = nullptr;

        size_t bytesOf (const juce::Image& image)
        {
            return image.isValid() ? (size_t) image.getWidth() * (size_t) image.getHeight() * 4u : 0u;
        }

        /// Downscale in 2:1 box-filter steps, then one final high-quality pass.
        juce::Image resample (juce::Image image, int w, int h)
        {
            while (image.getWidth() >= 2 * w && image.getHeight() >= 2 * h)
                image = image.rescaled (image.getWidth() / 2, image.getHeight() / 2, juce::Graphics::mediumResamplingQuality);
            if (image.getWidth() != w || image.getHeight() != h)
                image = image.rescaled (w, h, juce::Graphics::highResamplingQuality);
            return image;
        }
    }

    juce::Image coverFit (const juce::Image& image, int w, int h, float scale)
    {
        if (! image.isValid() || w <= 0 || h <= 0)
            return {};
        const int pw = juce::jmax (1, (int) std::ceil ((float) w * scale));
        const int ph = juce::jmax (1, (int) std::ceil ((float) h * scale));
        // Largest centred crop with the box's aspect ratio.
        const float k = juce::jmin ((float) image.getWidth() / (float) pw, (float) image.getHeight() / (float) ph);
        const int cw = juce::jlimit (1, image.getWidth(), juce::roundToInt ((float) pw * k));
        const int ch = juce::jlimit (1, image.getHeight(), juce::roundToInt ((float) ph * k));
        auto crop = image.getClippedImage ({ (image.getWidth() - cw) / 2, (image.getHeight() - ch) / 2, cw, ch });
        return resample (crop, pw, ph).convertedToFormat (juce::Image::ARGB);
    }

    // One URL's fetch + decode + downsample. Skips itself when every requester
    // cancelled before it started (a page the user already left).
    class ImageLoader::Job : public juce::ThreadPoolJob
    {
    public:
        Job (ImageLoader& o, juce::String u, int s) : ThreadPoolJob ("tone image"), owner (o), url (std::move (u)), side (s) {}

        JobStatus runJob() override
        {
            {
                const juce::ScopedLock sl (owner.lock);
                const bool wanted = std::any_of (owner.pending.begin(), owner.pending.end(),
                                                 [this] (const Pending& p) { return p.url == url; });
                if (! wanted)
                {
                    owner.queued.erase (url);
                    return jobHasFinished;
                }
            }
            auto image = owner.produce (url, side, *this);
            if (shouldExit())
                return jobHasFinished;      // the loader is going away
            juce::WeakReference<ImageLoader> self (&owner);
            juce::MessageManager::callAsync ([self, u = url, image]
            {
                if (self != nullptr) self->deliver (u, image);
            });
            return jobHasFinished;
        }

    private:
        ImageLoader& owner;
        juce::String url;
        int side;
    };

    ImageLoader::ImageLoader() : pool (kThreads)
    {
        sharedLoader = this;
    }

    ImageLoader::~ImageLoader()
    {
        masterReference.clear();
        pool.removeAllJobs (true, kShutdownGraceMs);
        if (sharedLoader == this) sharedLoader = nullptr;
    }

    ImageLoader& imageLoader()
    {
        jassert (sharedLoader != nullptr);
        return *sharedLoader;
    }

    std::optional<juce::Image> ImageLoader::cached (const juce::String& url) const
    {
        const juce::ScopedLock sl (lock);
        auto it = cache.find (url);
        if (it == cache.end()) return std::nullopt;
        return it->second;
    }

    void ImageLoader::Request::cancel()
    {
        if (loader == nullptr) return;
        const juce::ScopedLock sl (loader->lock);
        auto& p = loader->pending;
        p.erase (std::remove_if (p.begin(), p.end(), [this] (const Pending& e) { return e.id == id; }), p.end());
        loader = nullptr;
    }

    void ImageLoader::load (const juce::String& url, int side, Request& request, std::function<void (const juce::Image&)> onDone)
    {
        request.cancel();
        if (url.isEmpty() || side <= 0)
        {
            onDone ({});
            return;
        }
        if (auto hit = cached (url))
        {
            onDone (*hit);
            return;
        }
        bool enqueue = false;
        {
            const juce::ScopedLock sl (lock);
            request.loader = this;
            request.id = nextId++;
            pending.push_back ({ request.id, url, std::move (onDone) });
            enqueue = queued.insert (url).second;
        }
        if (enqueue)
            pool.addJob (new Job (*this, url, side), true);
    }

    juce::Image ImageLoader::produce (const juce::String& url, int side, Job& job)
    {
        juce::URL target (url);
        auto stream = target.createInputStream (juce::URL::InputStreamOptions (juce::URL::ParameterHandling::inAddress)
                                                    .withConnectionTimeoutMs (kConnectTimeoutMs)
                                                    .withProgressCallback ([&job] (int, int) { return ! job.shouldExit(); }));
        if (stream == nullptr)
            return {};
        juce::MemoryBlock bytes;
        stream->readIntoMemoryBlock (bytes);
        auto source = juce::ImageFileFormat::loadFrom (bytes.getData(), bytes.getSize());
        if (! source.isValid())
            return {};
        const int s = juce::jmin (side, source.getWidth(), source.getHeight());
        return coverFit (source, s, s, 1.0f);
    }

    // Message thread: cache the result and fire every waiter for this URL, one
    // at a time so a callback that destroys another waiter's Request still cancels it.
    void ImageLoader::deliver (const juce::String& url, juce::Image image)
    {
        {
            const juce::ScopedLock sl (lock);
            queued.erase (url);
            if (cache.emplace (url, image).second)
            {
                order.push_back (url);
                totalBytes += bytesOf (image);
                while ((totalBytes > kBudgetBytes || order.size() > kMaxEntries) && order.size() > 1)
                {
                    auto oldest = cache.find (order.front());
                    totalBytes -= bytesOf (oldest->second);
                    cache.erase (oldest);
                    order.erase (order.begin());
                }
            }
        }
        for (;;)
        {
            std::function<void (const juce::Image&)> onDone;
            {
                const juce::ScopedLock sl (lock);
                auto it = std::find_if (pending.begin(), pending.end(), [&] (const Pending& p) { return p.url == url; });
                if (it == pending.end()) return;
                onDone = std::move (it->onDone);
                pending.erase (it);
            }
            onDone (image);
        }
    }
}
