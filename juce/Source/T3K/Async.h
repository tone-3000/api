// Lifetime guard for callbacks that arrive on the message thread after an
// asynchronous operation (HTTP request, file download, OAuth flow).
//
// Components own an AsyncScope and wrap every callback with `scope.wrap(...)`.
// When the component is destroyed the scope dies with it and late callbacks
// become no-ops instead of touching a dead object.
#pragma once

#include <memory>
#include <utility>

namespace t3k
{
    class AsyncScope
    {
    public:
        AsyncScope() : token (std::make_shared<int> (0)) {}
        AsyncScope (const AsyncScope&) = delete;
        AsyncScope& operator= (const AsyncScope&) = delete;

        template <typename F>
        auto wrap (F callback) const
        {
            std::weak_ptr<int> weak = token;
            return [weak, fn = std::move (callback)] (auto&&... args)
            {
                if (weak.lock() != nullptr)
                    fn (std::forward<decltype (args)> (args)...);
            };
        }

        /// Invalidate every callback wrapped so far (e.g. when a screen reloads).
        void reset() { token = std::make_shared<int> (0); }

    private:
        std::shared_ptr<int> token;
    };
}
