// Minimal async HTTP on top of juce::URL. Requests run on a small thread pool;
// completion handlers are delivered on the message thread.
#pragma once

#include <JuceHeader.h>
#include <functional>

namespace t3k
{
    struct HttpRequest
    {
        juce::URL url;
        juce::String method { "GET" };
        juce::StringPairArray headers;
        juce::String body;                     // sent as-is for POST/PUT
        int timeoutMs = 30000;
    };

    struct HttpResponse
    {
        int status = 0;                        // 0 = no HTTP response (network error)
        juce::MemoryBlock body;
        juce::StringPairArray headers;         // keys lower-cased
        juce::String error;                    // transport error description

        bool ok() const { return status >= 200 && status < 300; }
        juce::String text() const { return body.toString(); }
        juce::var json() const { return juce::JSON::parse (text()); }
        juce::String header (const juce::String& name) const { return headers[name.toLowerCase()]; }
    };

    class Http
    {
    public:
        Http();
        ~Http();

        /// Perform the request on a worker thread; `done` runs on the message thread.
        void send (HttpRequest request, std::function<void (HttpResponse)> done);

        /// Perform the request synchronously on the calling thread (never the message thread).
        static HttpResponse sendSync (const HttpRequest& request);

    private:
        juce::ThreadPool pool { 4 };
    };
}
