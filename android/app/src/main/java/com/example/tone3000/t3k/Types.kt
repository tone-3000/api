@file:OptIn(ExperimentalSerializationApi::class)

package com.example.tone3000.t3k

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNames
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonPrimitive

// TONE3000 API v1 types (https://www.tone3000.com/api#types), mirroring
// web/src/types.ts. Unknown enum values fall back to property defaults
// (the client's Json uses coerceInputValues).

// MARK: - Enums ---------------------------------------------------------------

@Serializable
enum class Gear(val value: String, val label: String) {
    @SerialName("amp") AMP("amp", "Amp Head"),
    // `full-rig` is a deprecated alias for `amp-cab`.
    @SerialName("amp-cab") @JsonNames("full-rig") AMP_CAB("amp-cab", "Amp + Cab"),
    @SerialName("pedal") PEDAL("pedal", "Pedal"),
    @SerialName("outboard") OUTBOARD("outboard", "Outboard"),
    @SerialName("cab") CAB("cab", "Cabinet"),
    @SerialName("space") SPACE("space", "Spaces"),
    @SerialName("experimental") EXPERIMENTAL("experimental", "Experimental"),
}

@Serializable
enum class Format(val value: String, val label: String) {
    @SerialName("nam") NAM("nam", "NAM"),
    @SerialName("ir") IR("ir", "IR"),
    @SerialName("aida-x") AIDA_X("aida-x", "AIDA-X"),
    @SerialName("aa-snapshot") AA_SNAPSHOT("aa-snapshot", "Snapshot"),
    @SerialName("proteus") PROTEUS("proteus", "Proteus"),
    /** A format this client doesn't know yet. Never sent to the API. */
    UNKNOWN("", "Other");

    companion object {
        val filterable = entries.filter { it != UNKNOWN }
    }
}

/** NAM model architecture. Omitting `architecture` falls back to A1 + Custom. */
enum class Architecture(val value: String, val label: String) {
    A1("1", "A1"),
    A2("2", "A2"),
    CUSTOM("custom", "Custom");

    companion object {
        fun from(raw: String?): Architecture? = entries.firstOrNull { it.value == raw }
    }
}

enum class TonesSort(val value: String, val label: String) {
    TRENDING("trending", "Trending"),
    NEWEST("newest", "Newest"),
    OLDEST("oldest", "Oldest"),
    DOWNLOADS_ALL_TIME("downloads-all-time", "Most downloaded"),
    BEST_MATCH("best-match", "Best match"),
}

enum class UsersSort(val value: String, val label: String) {
    TONES("tones", "Most tones"),
    DOWNLOADS("downloads", "Most downloads"),
    FAVORITES("favorites", "Most favorites"),
    MODELS("models", "Most models"),
}

enum class TaxonomySort(val value: String, val label: String) {
    TONES("tones", "Most tones"),
    NAME("name", "A–Z"),
}

enum class LibraryList(val path: String, val label: String) {
    FAVORITED("favorited", "Favorites"),
    CREATED("created", "Created"),
    DOWNLOADED("downloaded", "Downloaded"),
}

// MARK: - Lenient scalar serializers --------------------------------------------

/** Numeric IDs that tolerate being serialized as strings (and vice versa). */
object FlexibleStringSerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexibleString", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): String =
        (decoder as JsonDecoder).decodeJsonElement().jsonPrimitive.content
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}

object NullableFlexibleStringSerializer : KSerializer<String?> {
    override val descriptor: SerialDescriptor = String.serializer().nullable.descriptor
    override fun deserialize(decoder: Decoder): String? {
        val element = (decoder as JsonDecoder).decodeJsonElement()
        return if (element is JsonNull) null else element.jsonPrimitive.content
    }
    override fun serialize(encoder: Encoder, value: String?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value)
    }
}

// MARK: - Resources -------------------------------------------------------------

/** Creator attribution fields shared by every user shape. */
interface CreatorInfo {
    val username: String
    /** Only ever set for verified creators. */
    val displayName: String?
    val isVerified: Boolean
    val avatarUrl: String?
}

val CreatorInfo.creatorName: String get() = displayName ?: "@$username"

@Serializable
data class EmbeddedUser(
    @Serializable(with = FlexibleStringSerializer::class) val id: String,
    override val username: String,
    @SerialName("display_name") override val displayName: String? = null,
    @SerialName("is_verified") override val isVerified: Boolean = false,
    @SerialName("avatar_url") override val avatarUrl: String? = null,
    val url: String? = null,
) : CreatorInfo

/** The authenticated user, from GET /user. */
@Serializable
data class User(
    @Serializable(with = FlexibleStringSerializer::class) val id: String,
    override val username: String,
    @SerialName("display_name") override val displayName: String? = null,
    @SerialName("is_verified") override val isVerified: Boolean = false,
    @SerialName("avatar_url") override val avatarUrl: String? = null,
    val url: String? = null,
    val bio: String? = null,
    val links: List<String>? = null,
    @SerialName("created_at") val createdAt: String? = null,
) : CreatorInfo

/** A public user with content counts, from GET /users. */
@Serializable
data class PublicUser(
    @Serializable(with = FlexibleStringSerializer::class) val id: String,
    override val username: String,
    @SerialName("display_name") override val displayName: String? = null,
    @SerialName("is_verified") override val isVerified: Boolean = false,
    val bio: String? = null,
    @SerialName("avatar_url") override val avatarUrl: String? = null,
    @SerialName("downloads_count") val downloadsCount: Int = 0,
    @SerialName("favorites_count") val favoritesCount: Int = 0,
    @SerialName("models_count") val modelsCount: Int = 0,
    @SerialName("tones_count") val tonesCount: Int = 0,
    val url: String? = null,
) : CreatorInfo

@Serializable
data class NamedItem(
    @Serializable(with = NullableFlexibleStringSerializer::class) val id: String? = null,
    val name: String,
)

/** A make or tag with its public tone count, from GET /makes and GET /tags. */
@Serializable
data class TaxonomyItem(
    @Serializable(with = FlexibleStringSerializer::class) val id: String,
    val name: String,
    @SerialName("tones_count") val tonesCount: Int = 0,
)

@Serializable
data class Tone(
    val id: Int,
    val user: EmbeddedUser,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("published_at") val publishedAt: String? = null,
    val title: String,
    val description: String? = null,
    val gear: Gear = Gear.EXPERIMENTAL,
    val images: List<String>? = null,
    @SerialName("is_public") val isPublic: Boolean? = null,
    val format: Format = Format.UNKNOWN,
    val license: String? = null,
    val makes: List<NamedItem> = emptyList(),
    val tags: List<NamedItem> = emptyList(),
    @SerialName("models_count") val modelsCount: Int = 0,
    @SerialName("a1_models_count") val a1ModelsCount: Int = 0,
    @SerialName("a2_models_count") val a2ModelsCount: Int = 0,
    @SerialName("irs_count") val irsCount: Int = 0,
    @SerialName("custom_models_count") val customModelsCount: Int = 0,
    @SerialName("downloads_count") val downloadsCount: Int = 0,
    @SerialName("favorites_count") val favoritesCount: Int = 0,
    /** Whether the authenticated user has favorited this tone. */
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    val url: String? = null,
)

@Serializable
data class Model(
    val id: Int,
    /** Pre-built download URL. Fetch it with your Bearer token. */
    @SerialName("model_url") val modelUrl: String,
    val name: String,
    val size: String? = null,
    @SerialName("tone_id") val toneId: Int? = null,
    /** "1", "2" or "custom" for NAM models; null for non-NAM (e.g. IR). */
    @SerialName("architecture_version")
    @Serializable(with = NullableFlexibleStringSerializer::class)
    val architectureVersion: String? = null,
) {
    val architecture: Architecture? get() = Architecture.from(architectureVersion)
}

/** GET /tones/{id}/download (approved partners only). */
@Serializable
data class ToneDownload(
    /** Temporary, unauthenticated zip URL. Expires in 1 hour. */
    val url: String,
    @SerialName("expires_at") val expiresAt: String? = null,
    val filename: String? = null,
)

@Serializable
data class Page<T>(
    val data: List<T>,
    val page: Int = 1,
    @SerialName("page_size") val pageSize: Int = 0,
    val total: Int = 0,
    @SerialName("total_pages") val totalPages: Int = 1,
)

/** Trending and latest feeds: capped at 10, not paginated. */
@Serializable
data class ToneFeed(val data: List<Tone>)

// MARK: - Request params ----------------------------------------------------------

data class SearchTonesParams(
    val query: String = "",
    val page: Int = 1,
    val pageSize: Int = 12,
    val sort: TonesSort = TonesSort.TRENDING,
    val gears: List<Gear> = emptyList(),
    /** Model format. Filtering IRs goes here, not through `gears`. */
    val format: Format? = null,
    val architecture: Architecture? = T3KConfig.demoArchitecture,
    /** Exact names; values within one field are OR'd, fields are AND'd. */
    val tags: List<String> = emptyList(),
    val makes: List<String> = emptyList(),
    val creators: List<String> = emptyList(),
    val calibrated: Boolean = false,
    val verified: Boolean = false,
)
