package com.example.tone3000.t3k

import android.content.Context
import android.net.Uri
import android.util.Base64
import com.example.tone3000.T3K
import java.security.MessageDigest
import java.security.SecureRandom
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request

/** Catalog filters shared by the Select and Load Tone prompts. */
data class CatalogOptions(
    /** Underscore-separated gear filter, e.g. `amp_amp-cab`. */
    val gears: String? = null,
    val format: Format? = null,
    val architecture: Architecture? = T3KConfig.demoArchitecture,
    /** Only show tones with at least one calibrated model. */
    val calibrated: Boolean = false,
)

/** Options for any authorize request. */
data class AuthorizeOptions(
    /** Show TONE3000's close menubar so users can back out of the flow. */
    val menubar: Boolean = true,
    /** `zh-CN` for Simplified Chinese; null for English. */
    val locale: String? = null,
    /** Prefill the sign-in email. */
    val loginHint: String? = null,
)

data class SelectOptions(
    val catalog: CatalogOptions = CatalogOptions(),
    val auth: AuthorizeOptions = AuthorizeOptions(),
    /** Show preview players inside the hosted catalog. */
    val preview: Boolean = true,
)

data class OAuthOutcome(
    /** Selected (Select) or resolved (Load Tone) tone. May differ from the
     * requested id when TONE3000 offers a replacement. */
    val toneId: Int?,
    /** The user closed TONE3000 after signing in, without choosing a tone. */
    val canceled: Boolean,
)

class OAuthCanceledException : Exception("TONE3000 was closed before signing in.")

/**
 * TONE3000 OAuth 2.0 (authorization code + PKCE S256), mirroring the flow
 * helpers in web/src/tone3000-client.ts.
 *
 * Opens a persistent in-app WebView ([AuthBrowserActivity]) rather than a
 * Custom Tab so the TONE3000 session survives repeated Select flows without
 * leaving the app. The custom-scheme redirect is intercepted by the WebView.
 */
object AuthManager {

    /** Standard OAuth — full API access. */
    suspend fun startStandardFlow(context: Context, auth: AuthorizeOptions = AuthorizeOptions()) {
        authorize(context, authParams(auth))
    }

    /** `prompt=select_tone`: TONE3000 hosts browsing and returns `tone_id`. */
    suspend fun startSelectFlow(context: Context, options: SelectOptions): OAuthOutcome {
        val params = authParams(options.auth) + catalogParams(options.catalog) + ("prompt" to "select_tone")
        return authorize(context, if (options.preview) params + ("preview" to "true") else params)
    }

    /** `prompt=load_tone`: TONE3000 checks access to [toneId] and, if it's
     * private or deleted, lets the user pick a replacement. */
    suspend fun startLoadToneFlow(
        context: Context,
        toneId: Int,
        catalog: CatalogOptions = CatalogOptions(),
        auth: AuthorizeOptions = AuthorizeOptions(),
    ): OAuthOutcome = authorize(
        context,
        authParams(auth) + catalogParams(catalog) + mapOf("prompt" to "load_tone", "tone_id" to toneId.toString()),
    )

    private fun authParams(options: AuthorizeOptions) = buildMap {
        if (options.menubar) put("menubar", "true")
        options.locale?.let { put("locale", it) }
        options.loginHint?.let { put("login_hint", it) }
    }

    private fun catalogParams(options: CatalogOptions) = buildMap {
        options.gears?.let { put("gears", it) }
        options.format?.let { put("format", it.value) }
        options.architecture?.let { put("architecture", it.value) }
        if (options.calibrated) put("calibrated", "true")
    }

    // MARK: flow ------------------------------------------------------------------

    private var pending: CompletableDeferred<Uri?>? = null

    /** Called by [AuthBrowserActivity] with the redirect, or null when closed. */
    internal fun deliver(uri: Uri?) {
        pending?.complete(uri)
        pending = null
    }

    private suspend fun authorize(context: Context, extraParams: Map<String, String>): OAuthOutcome {
        check(T3KConfig.publishableKey.isNotEmpty()) { "Set T3K_PUBLISHABLE_KEY in android/local.properties." }

        val codeVerifier = randomBase64url(32)
        val state = randomBase64url(16)
        val uri = Uri.parse("${T3KConfig.apiBase}/api/v1/oauth/authorize").buildUpon().apply {
            appendQueryParameter("client_id", T3KConfig.publishableKey)
            appendQueryParameter("redirect_uri", T3KConfig.redirectUri)
            appendQueryParameter("response_type", "code")
            appendQueryParameter("code_challenge", sha256Base64url(codeVerifier))
            appendQueryParameter("code_challenge_method", "S256")
            appendQueryParameter("state", state)
            extraParams.toSortedMap().forEach { (key, value) -> appendQueryParameter(key, value) }
        }.build()

        pending?.complete(null)
        val result = CompletableDeferred<Uri?>().also { pending = it }
        AuthBrowserActivity.start(context, uri)
        val callback = result.await() ?: throw OAuthCanceledException()

        // Validate state before trusting anything else in the callback.
        if (callback.getQueryParameter("state") != state) throw IllegalStateException("OAuth state mismatch.")

        val canceled = callback.getQueryParameter("canceled") == "true"
        callback.getQueryParameter("error")?.let { error ->
            if (error == "access_denied") throw OAuthCanceledException()
            throw IllegalStateException("TONE3000 sign-in failed: $error")
        }
        val code = callback.getQueryParameter("code")
            ?: if (canceled) throw OAuthCanceledException() else throw IllegalStateException("OAuth callback is missing the authorization code.")

        T3K.client.setTokens(exchangeCode(code, codeVerifier))
        return OAuthOutcome(callback.getQueryParameter("tone_id")?.toIntOrNull(), canceled)
    }

    private suspend fun exchangeCode(code: String, codeVerifier: String): T3KTokens = withContext(Dispatchers.IO) {
        val body = FormBody.Builder()
            .add("grant_type", "authorization_code")
            .add("code", code)
            .add("code_verifier", codeVerifier)
            .add("redirect_uri", T3KConfig.redirectUri)
            .add("client_id", T3KConfig.publishableKey)
            .build()
        val request = Request.Builder().url("${T3KConfig.apiBase}/api/v1/oauth/token").post(body).build()
        OkHttpClient().newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw T3KException("Token exchange failed: ${response.body?.string()?.take(200)}", response.code)
            }
            T3K.client.parseTokenResponse(response.body!!.string())
        }
    }

    // MARK: PKCE ------------------------------------------------------------------

    private fun randomBase64url(bytes: Int): String =
        base64url(ByteArray(bytes).also { SecureRandom().nextBytes(it) })

    private fun sha256Base64url(input: String): String =
        base64url(MessageDigest.getInstance("SHA-256").digest(input.toByteArray()))

    private fun base64url(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
