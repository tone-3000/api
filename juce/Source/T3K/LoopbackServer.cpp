#include "LoopbackServer.h"

namespace t3k
{
    LoopbackServer::LoopbackServer() : juce::Thread ("TONE3000 loopback") {}

    LoopbackServer::~LoopbackServer()
    {
        stop();
    }

    bool LoopbackServer::start()
    {
        if (isRunning())
            return true;

        // Port 0 asks the OS for a free ephemeral port; bind to loopback only so
        // nothing on the network can reach the receiver.
        if (! listener.createListener (0, "127.0.0.1"))
            return false;

        port = listener.getBoundPort();
        if (port <= 0)
        {
            listener.close();
            port = 0;
            return false;
        }

        startThread();
        return true;
    }

    void LoopbackServer::stop()
    {
        if (! isRunning() && ! isThreadRunning())
            return;
        signalThreadShouldExit();
        listener.close();         // unblocks waitForNextConnection()
        stopThread (3000);
        port = 0;
    }

    juce::String LoopbackServer::redirectUri() const
    {
        return isRunning() ? "http://127.0.0.1:" + juce::String (port.load()) + "/callback" : juce::String();
    }

    void LoopbackServer::run()
    {
        while (! threadShouldExit())
        {
            std::unique_ptr<juce::StreamingSocket> connection (listener.waitForNextConnection());
            if (connection == nullptr)
                continue;
            if (threadShouldExit())
                break;
            handleConnection (*connection);
        }
    }

    void LoopbackServer::handleConnection (juce::StreamingSocket& connection)
    {
        // Read the request head (we only need the request line).
        juce::MemoryOutputStream head;
        char buffer[1024];
        while (! head.toString().contains ("\r\n\r\n") && head.getDataSize() < 16 * 1024)
        {
            if (connection.waitUntilReady (true, 2000) != 1)
                break;
            auto n = connection.read (buffer, (int) sizeof (buffer), false);
            if (n <= 0)
                break;
            head.write (buffer, (size_t) n);
        }

        auto requestLine = head.toString().upToFirstOccurrenceOf ("\r\n", false, false);
        auto target = requestLine.fromFirstOccurrenceOf (" ", false, false).upToFirstOccurrenceOf (" ", false, false);
        auto path = target.upToFirstOccurrenceOf ("?", false, false);
        auto query = target.fromFirstOccurrenceOf ("?", false, false);

        juce::String response;
        if (requestLine.startsWith ("GET ") && (path == "/callback" || path == "/"))
        {
            auto html = landingPageHtml();
            response << "HTTP/1.1 200 OK\r\n"
                     << "Content-Type: text/html; charset=utf-8\r\n"
                     << "Content-Length: " << (int) html.getNumBytesAsUTF8() << "\r\n"
                     << "Cache-Control: no-store\r\n"
                     << "Connection: close\r\n\r\n"
                     << html;

            if (onCallback != nullptr)
                juce::MessageManager::callAsync ([cb = onCallback, query] { cb (query); });
        }
        else
        {
            response << "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        }

        connection.write (response.toRawUTF8(), (int) response.getNumBytesAsUTF8());
        connection.close();
    }

    juce::String LoopbackServer::landingPageHtml() const
    {
        return "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + landingTitle + "</title>"
               "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
               "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
               "background:#0f0f10;color:#f5f5f5;font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif}"
               "main{text-align:center;padding:32px}h1{font-size:22px;margin:0 0 8px}p{margin:0;opacity:.75}</style></head>"
               "<body><main><h1>" + landingTitle + "</h1><p>" + landingMessage + "</p></main></body></html>";
    }
}
