#include "Http.h"

namespace t3k
{
    Http::Http() = default;

    Http::~Http()
    {
        pool.removeAllJobs (true, 5000);
    }

    void Http::send (HttpRequest request, std::function<void (HttpResponse)> done)
    {
        pool.addJob ([req = std::move (request), cb = std::move (done)]
        {
            auto response = sendSync (req);
            juce::MessageManager::callAsync ([cb, res = std::move (response)]() mutable
            {
                cb (std::move (res));
            });
        });
    }

    HttpResponse Http::sendSync (const HttpRequest& request)
    {
        HttpResponse response;

        juce::String headerBlock;
        for (auto& key : request.headers.getAllKeys())
            headerBlock << key << ": " << request.headers[key] << "\r\n";

        auto url = request.url;
        const bool hasBody = request.method == "POST" || request.method == "PUT";
        if (hasBody)
            url = url.withPOSTData (request.body);

        juce::StringPairArray responseHeaders;
        int status = 0;

        auto options = juce::URL::InputStreamOptions (juce::URL::ParameterHandling::inAddress)
                           .withHttpRequestCmd (request.method)
                           .withExtraHeaders (headerBlock)
                           .withConnectionTimeoutMs (request.timeoutMs)
                           .withNumRedirectsToFollow (5)
                           .withStatusCode (&status)
                           .withResponseHeaders (&responseHeaders);

        if (auto stream = url.createInputStream (options))
        {
            stream->readIntoMemoryBlock (response.body);
            response.status = status;
            for (auto& key : responseHeaders.getAllKeys())
                response.headers.set (key.toLowerCase(), responseHeaders[key]);
        }
        else
        {
            response.status = status;      // JUCE may still report e.g. a 4xx with no stream
            if (status == 0)
                response.error = "Could not reach " + request.url.getDomain();
        }

        return response;
    }
}
