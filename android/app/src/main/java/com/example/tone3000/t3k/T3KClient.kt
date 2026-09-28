package com.example.tone3000.t3k

import android.util.Log
import com.example.tone3000.BuildConfig
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

object T3KConfig {
    val apiBase: String = BuildConfig.T3K_API_BASE.trimEnd('/')
    val publishableKey: String = BuildConfig.T3K_PUBLISHABLE_KEY
    /** Custom scheme registered as a redirect URI on the publishable key. */
    val redirectScheme: String = BuildConfig.T3K_REDIRECT_SCHEME
    val redirectUri: String get() = "$redirectScheme://oauth/callback"

    /** A2 is the current NAM architecture; every demo requests it explicitly. */
    val demoArchitecture = Architecture.A2
}

class T3KException(message: String, val status: Int = 0) : IOException(message) {
    val isNotFound get() = status == 404
    val isForbidden get() = status == 403
    val isRateLimit get() = status == 429
}

/** User-facing message for any error. */
val Throwable.userMessage: String
    get() = if (this is T3KException && isRateLimit) "Too many requests — wait a moment and try again."
    else message ?: toString()

/**
 * Authenticated TONE3000 API client, mirroring web/src/tone3000-client.ts:
 * - Tokens persist in EncryptedSharedPreferences.
 * - Proactive refresh 60s before expiry.
 * - Single-flight refresh: concurrent callers share one refresh call.
 * - Retry once on 401 (expiry races between the check and the request).
 * - A 400/401 from the token endpoint (`invalid_grant`) ends the session and
 *   clears tokens; other refresh failures are transient and keep them.
 */
class T3KClient(private val store: TokenStore, private val cacheDir: File) {

    private val http = OkHttpClient()
    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    private val clientScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val refreshMutex = Mutex()
    private var refreshInFlight: Deferred<T3KTokens>? = null

    fun isConnected(): Boolean = store.tokens != null
    fun setTokens(tokens: T3KTokens) { store.tokens = tokens }
    fun clearTokens() { store.tokens = null }

    // MARK: token refresh -------------------------------------------------------

    private suspend fun accessToken(forceRefresh: Boolean = false): String {
        val tokens = store.tokens ?: throw T3KException("Not connected to TONE3000.")

        if (!forceRefresh && System.currentTimeMillis() <= tokens.expiresAt - 60_000) {
            return tokens.accessToken
        }

        // The mutex only guards installing the shared Deferred, so the refresh
        // itself runs outside the lock.
        val task = refreshMutex.withLock {
            refreshInFlight ?: clientScope.async {
                try {
                    refreshTokens(tokens.refreshToken).also { store.tokens = it }
                } catch (e: T3KException) {
                    if (e.status == 400 || e.status == 401) {
                        clearTokens()
                        throw T3KException("Your TONE3000 session ended. Connect again.", 401)
                    }
                    throw e
                } finally {
                    refreshMutex.withLock { refreshInFlight = null }
                }
            }.also { refreshInFlight = it }
        }
        return task.await().accessToken
    }

    private fun refreshTokens(refreshToken: String): T3KTokens {
        val body = FormBody.Builder()
            .add("grant_type", "refresh_token")
            .add("refresh_token", refreshToken)
            .add("client_id", T3KConfig.publishableKey)
            .build()
        val request = Request.Builder().url("${T3KConfig.apiBase}/api/v1/oauth/token").post(body).build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw T3KException("Token refresh failed", response.code)
            return parseTokenResponse(response.body!!.string())
        }
    }

    fun parseTokenResponse(body: String): T3KTokens {
        val obj = json.parseToJsonElement(body).jsonObject
        return T3KTokens(
            accessToken = obj["access_token"]!!.jsonPrimitive.content,
            refreshToken = obj["refresh_token"]!!.jsonPrimitive.content,
            expiresAt = System.currentTimeMillis() +
                (obj["expires_in"]!!.jsonPrimitive.content.toDouble() * 1000).toLong(),
        )
    }

    // MARK: authenticated requests ----------------------------------------------

    /** Authenticated request returning the raw body; retries once on 401. */
    private suspend fun request(method: String, url: HttpUrl, context: String): ByteArray =
        withContext(Dispatchers.IO) {
            fun perform(token: String): Pair<Int, ByteArray> {
                val body = if (method == "PUT") ByteArray(0).toRequestBody() else null
                val request = Request.Builder()
                    .url(url)
                    .method(method, body)
                    .header("Authorization", "Bearer $token")
                    .build()
                http.newCall(request).execute().use { response ->
                    response.header("X-Tone3000-Deprecations")?.let {
                        Log.w("TONE3000", "$method ${url.encodedPath} uses deprecated params: $it")
                    }
                    return response.code to (response.body?.bytes() ?: ByteArray(0))
                }
            }

            var (code, body) = perform(accessToken())
            if (code == 401) {
                val retry = perform(accessToken(forceRefresh = true))
                code = retry.first
                body = retry.second
            }
            if (code !in 200..299) throw T3KException("$context failed (HTTP $code).", code)
            body
        }

    private suspend inline fun <reified T> get(url: HttpUrl, context: String): T =
        json.decodeFromString(request("GET", url, context).decodeToString())

    private fun url(path: String, build: HttpUrl.Builder.() -> Unit = {}): HttpUrl =
        "${T3KConfig.apiBase}$path".toHttpUrl().newBuilder().apply(build).build()

    private fun HttpUrl.Builder.page(page: Int, pageSize: Int) {
        addQueryParameter("page", page.toString())
        addQueryParameter("page_size", pageSize.toString())
    }

    private fun HttpUrl.Builder.optional(name: String, value: String?) {
        if (!value.isNullOrEmpty()) addQueryParameter(name, value)
    }

    // MARK: users ---------------------------------------------------------------

    suspend fun getUser(): User = get(url("/api/v1/user"), "Get user")

    /** Public creators. Max page_size is 10. */
    suspend fun listUsers(query: String = "", sort: UsersSort = UsersSort.TONES, page: Int = 1, pageSize: Int = 10): Page<PublicUser> =
        get(url("/api/v1/users") {
            page(page, pageSize)
            addQueryParameter("sort", sort.value)
            optional("query", query)
        }, "List users")

    // MARK: tones ---------------------------------------------------------------

    suspend fun getTone(id: Int, architecture: Architecture? = T3KConfig.demoArchitecture): Tone =
        get(url("/api/v1/tones/$id") { optional("architecture", architecture?.value) }, "Get tone")

    /** Search the catalog. Heavily rate-limited — debounce user input. */
    suspend fun searchTones(params: SearchTonesParams): Page<Tone> =
        get(url("/api/v1/tones/search") {
            page(params.page, params.pageSize)
            optional("query", params.query)
            addQueryParameter("sort", params.sort.value)
            if (params.gears.isNotEmpty()) addQueryParameter("gears", params.gears.joinToString("_") { it.value })
            optional("format", params.format?.value)
            optional("architecture", params.architecture?.value)
            if (params.tags.isNotEmpty()) addQueryParameter("tags", params.tags.joinToString("_"))
            if (params.makes.isNotEmpty()) addQueryParameter("makes", params.makes.joinToString("_"))
            if (params.creators.isNotEmpty()) addQueryParameter("creators", params.creators.joinToString(","))
            if (params.calibrated) addQueryParameter("calibrated", "true")
            if (params.verified) addQueryParameter("verified", "true")
        }, "Search")

    /** The user's favorited / created / downloaded tones. */
    suspend fun listLibrary(list: LibraryList, gear: Gear? = null, query: String = "", page: Int = 1, pageSize: Int = 12): Page<Tone> =
        get(url("/api/v1/tones/${list.path}") {
            page(page, pageSize)
            optional("gear", gear?.value)
            optional("query", query)
        }, "List ${list.label.lowercase()}")

    suspend fun listTrendingTones(gear: Gear? = null): ToneFeed =
        get(url("/api/v1/tones/trending") { optional("gear", gear?.value) }, "Trending")

    suspend fun listLatestTones(): ToneFeed = get(url("/api/v1/tones/latest"), "Latest")

    suspend fun favoriteTone(id: Int) {
        request("PUT", url("/api/v1/tones/$id/favorite"), "Favorite")
    }

    suspend fun unfavoriteTone(id: Int) {
        request("DELETE", url("/api/v1/tones/$id/favorite"), "Unfavorite")
    }

    /** Temporary zip URL for every model in a tone. Approved partners only (403 otherwise). */
    suspend fun getToneDownload(id: Int): ToneDownload = get(url("/api/v1/tones/$id/download"), "Tone download")

    // MARK: models --------------------------------------------------------------

    suspend fun listModels(toneId: Int, architecture: Architecture? = null, page: Int = 1, pageSize: Int = 100): Page<Model> =
        get(url("/api/v1/models") {
            page(page, pageSize)
            addQueryParameter("tone_id", toneId.toString())
            optional("architecture", architecture?.value)
        }, "List models")

    // MARK: makes & tags --------------------------------------------------------

    suspend fun listMakes(query: String = "", sort: TaxonomySort = TaxonomySort.TONES, page: Int = 1, pageSize: Int = 25): Page<TaxonomyItem> =
        get(url("/api/v1/makes") { taxonomy(query, sort, page, pageSize) }, "List makes")

    suspend fun listTags(query: String = "", sort: TaxonomySort = TaxonomySort.TONES, page: Int = 1, pageSize: Int = 25): Page<TaxonomyItem> =
        get(url("/api/v1/tags") { taxonomy(query, sort, page, pageSize) }, "List tags")

    private fun HttpUrl.Builder.taxonomy(query: String, sort: TaxonomySort, page: Int, pageSize: Int) {
        page(page, pageSize)
        addQueryParameter("sort", sort.value)
        optional("query", query)
    }

    // MARK: model files ---------------------------------------------------------

    /**
     * Download a model/IR file (Bearer auth) into the on-disk cache and return
     * it. Files are immutable per URL, so cache hits skip the network.
     */
    suspend fun downloadModelFile(modelUrl: String, filename: String? = null): File {
        val digest = MessageDigest.getInstance("SHA-256").digest(modelUrl.toByteArray())
            .joinToString("") { "%02x".format(it) }
        val dir = File(cacheDir, "t3k-models/$digest").apply { mkdirs() }
        val ext = modelUrl.substringBefore('?').substringAfterLast('/').substringAfterLast('.', "")
        val base = filename?.replace(Regex("[/\\\\:?%*|\"<>]"), "-")?.ifBlank { null } ?: "model"
        val file = File(dir, if (ext.isEmpty() || base.endsWith(".$ext")) base else "$base.$ext")
        if (file.exists()) return file

        val absolute = if (modelUrl.startsWith("/")) "${T3KConfig.apiBase}$modelUrl" else modelUrl
        val bytes = request("GET", absolute.toHttpUrl(), "Download model")
        withContext(Dispatchers.IO) {
            val tmp = File(dir, "${file.name}.part")
            tmp.writeBytes(bytes)
            tmp.renameTo(file)
        }
        return file
    }
}
