package com.example.tone3000

import android.content.Context
import com.example.tone3000.t3k.Tone
import com.example.tone3000.t3k.creatorName
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * A saved preset. It's your app's own record: the only TONE3000 data it needs
 * is the tone ID; title and creator are cached for display and refreshed each
 * time the preset loads.
 */
@Serializable
data class Preset(
    val id: String,
    val toneId: Int,
    val title: String,
    val creator: String,
) {
    companion object {
        fun from(tone: Tone, id: String = UUID.randomUUID().toString()) =
            Preset(id = id, toneId = tone.id, title = tone.title, creator = tone.user.creatorName)
    }
}

/**
 * This demo keeps presets in SharedPreferences — a real app would store them
 * wherever it keeps user data.
 */
object PresetStore {
    private const val FILE = "beacon_presets"
    private const val KEY = "presets"
    private val json = Json { ignoreUnknownKeys = true }

    fun load(context: Context): List<Preset> {
        val raw = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<Preset>>(raw) }.getOrDefault(emptyList())
    }

    fun save(context: Context, presets: List<Preset>) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, json.encodeToString(presets)).apply()
    }
}
