// System headers first: with `using namespace juce` in scope, MacTypes' `Point`
// would clash with juce::Point.
#if defined(__APPLE__)
 #include <Security/Security.h>
#elif defined(_WIN32)
 #include <windows.h>
 #include <wincrypt.h>
#endif

#include "SecureStore.h"

namespace t3k
{
    SecureStore::SecureStore (juce::String s, juce::String a) : service (std::move (s)), account (std::move (a)) {}

#if JUCE_MAC
    namespace
    {
        struct CFReleaser { void operator() (CFTypeRef ref) const { if (ref) CFRelease (ref); } };
        template <typename T> using CFPtr = std::unique_ptr<std::remove_pointer_t<T>, CFReleaser>;

        CFPtr<CFStringRef> cfString (const juce::String& s)
        {
            return CFPtr<CFStringRef> (CFStringCreateWithCString (nullptr, s.toRawUTF8(), kCFStringEncodingUTF8));
        }

        CFPtr<CFMutableDictionaryRef> baseQuery (const juce::String& service, const juce::String& account)
        {
            CFPtr<CFMutableDictionaryRef> q (CFDictionaryCreateMutable (nullptr, 0,
                                                                        &kCFTypeDictionaryKeyCallBacks,
                                                                        &kCFTypeDictionaryValueCallBacks));
            auto svc = cfString (service);
            auto acc = cfString (account);
            CFDictionarySetValue (q.get(), kSecClass, kSecClassGenericPassword);
            CFDictionarySetValue (q.get(), kSecAttrService, svc.get());
            CFDictionarySetValue (q.get(), kSecAttrAccount, acc.get());
            return q;
        }
    }

    bool SecureStore::save (const juce::String& secret)
    {
        auto utf8 = secret.toRawUTF8();
        CFPtr<CFDataRef> data (CFDataCreate (nullptr, (const UInt8*) utf8, (CFIndex) secret.getNumBytesAsUTF8()));

        auto query = baseQuery (service, account);
        CFPtr<CFMutableDictionaryRef> update (CFDictionaryCreateMutable (nullptr, 0,
                                                                         &kCFTypeDictionaryKeyCallBacks,
                                                                         &kCFTypeDictionaryValueCallBacks));
        CFDictionarySetValue (update.get(), kSecValueData, data.get());

        auto status = SecItemUpdate (query.get(), update.get());
        if (status == errSecItemNotFound)
        {
            CFDictionarySetValue (query.get(), kSecValueData, data.get());
            CFDictionarySetValue (query.get(), kSecAttrAccessible, kSecAttrAccessibleAfterFirstUnlock);
            status = SecItemAdd (query.get(), nullptr);
        }
        return status == errSecSuccess;
    }

    juce::String SecureStore::load()
    {
        auto query = baseQuery (service, account);
        CFDictionarySetValue (query.get(), kSecReturnData, kCFBooleanTrue);
        CFDictionarySetValue (query.get(), kSecMatchLimit, kSecMatchLimitOne);

        CFTypeRef result = nullptr;
        if (SecItemCopyMatching (query.get(), &result) != errSecSuccess || result == nullptr)
            return {};

        CFPtr<CFDataRef> data ((CFDataRef) result);
        return juce::String::fromUTF8 ((const char*) CFDataGetBytePtr (data.get()), (int) CFDataGetLength (data.get()));
    }

    void SecureStore::remove()
    {
        auto query = baseQuery (service, account);
        SecItemDelete (query.get());
    }

#elif JUCE_WINDOWS
    namespace
    {
        // DPAPI only encrypts; the ciphertext still needs a home. Keep it in a
        // settings file under %APPDATA%\<service>\ — only this Windows user can
        // decrypt it, even if the file is copied elsewhere.
        std::unique_ptr<juce::PropertiesFile> settingsFile (const juce::String& service)
        {
            juce::PropertiesFile::Options o;
            o.applicationName = "tokens";
            o.filenameSuffix = ".settings";
            o.folderName = service;
            o.osxLibrarySubFolder = "Application Support";
            return std::make_unique<juce::PropertiesFile> (o);
        }
    }

    bool SecureStore::save (const juce::String& secret)
    {
        DATA_BLOB in { (DWORD) secret.getNumBytesAsUTF8(), (BYTE*) secret.toRawUTF8() };
        DATA_BLOB out {};
        if (! CryptProtectData (&in, L"TONE3000 tokens", nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out))
            return false;

        auto encoded = juce::Base64::toBase64 (out.pbData, out.cbData);
        LocalFree (out.pbData);

        auto file = settingsFile (service);
        file->setValue (account, encoded);
        return file->saveIfNeeded();
    }

    juce::String SecureStore::load()
    {
        auto encoded = settingsFile (service)->getValue (account);
        if (encoded.isEmpty())
            return {};

        juce::MemoryOutputStream raw;
        if (! juce::Base64::convertFromBase64 (raw, encoded))
            return {};

        DATA_BLOB in { (DWORD) raw.getDataSize(), (BYTE*) raw.getData() };
        DATA_BLOB out {};
        if (! CryptUnprotectData (&in, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out))
            return {};

        auto secret = juce::String::fromUTF8 ((const char*) out.pbData, (int) out.cbData);
        LocalFree (out.pbData);
        return secret;
    }

    void SecureStore::remove()
    {
        auto file = settingsFile (service);
        file->removeValue (account);
        file->saveIfNeeded();
    }
#endif
}
