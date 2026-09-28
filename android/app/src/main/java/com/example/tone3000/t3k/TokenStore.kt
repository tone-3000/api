package com.example.tone3000.t3k

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** OAuth token set. `expiresAt` is an absolute epoch-millis deadline. */
@Serializable
data class T3KTokens(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long,
)

/**
 * Encrypted-at-rest token storage: EncryptedSharedPreferences over an
 * AndroidKeyStore master key (the Android counterpart of the iOS Keychain).
 */
class TokenStore(context: Context) {
    private val json = Json { ignoreUnknownKeys = true }

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "t3k_secure_prefs",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var tokens: T3KTokens?
        get() = prefs.getString(KEY_TOKENS, null)?.let {
            runCatching { json.decodeFromString<T3KTokens>(it) }.getOrNull()
        }
        set(value) {
            prefs.edit().apply {
                if (value == null) remove(KEY_TOKENS) else putString(KEY_TOKENS, json.encodeToString(value))
            }.apply()
        }

    private companion object {
        const val KEY_TOKENS = "t3k_tokens"
    }
}
