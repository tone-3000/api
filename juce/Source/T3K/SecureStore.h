// OS-protected storage for the OAuth token set.
//
//   macOS   -> Keychain generic password (Security.framework)
//   Windows -> DPAPI (CryptProtectData), ciphertext kept in the app's settings file
//
// This is what Electron's safeStorage and the iOS/Android examples' Keychain /
// EncryptedSharedPreferences do; refresh tokens are long-lived credentials and
// should never sit in a plain-text file.
#pragma once

#include <JuceHeader.h>

namespace t3k
{
    class SecureStore
    {
    public:
        /// `service` namespaces the entry (use your bundle id); `account` names it.
        SecureStore (juce::String service, juce::String account);

        bool save (const juce::String& secret);
        juce::String load();
        void remove();

    private:
        juce::String service, account;
    };
}
