package com.example.tone3000.audio

import android.content.Context
import com.example.tone3000.T3K
import com.example.tone3000.t3k.Format
import com.example.tone3000.t3k.Gear
import com.example.tone3000.t3k.Model
import com.example.tone3000.t3k.T3KConfig
import com.example.tone3000.t3k.Tone
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Local file paths for one preview play. Empty model/IR paths skip that stage. */
data class PreviewChain(
    val modelPath: String,
    val irPath: String,
    val inputPath: String,
)

/**
 * Bundled preview assets (from native/preview-assets), matching the web
 * player's defaults so previews sound the same on every platform. The engine
 * loads from file paths, so assets are copied out of the APK once.
 */
object PreviewAssets {
    private lateinit var dir: File

    /** Guitar DI clip played through every preview. */
    val input get() = path("di-guitar.wav")
    /** Neutral amp used when previewing an IR on its own. */
    val fallbackAmp get() = path("fallback-amp.nam")
    /** Cab IR used when previewing an amp-head capture on its own. */
    val fallbackCab get() = path("fallback-cab.wav")

    fun init(context: Context) {
        dir = File(context.filesDir, "preview-assets").apply { mkdirs() }
        this.context = context.applicationContext
    }

    private lateinit var context: Context

    private fun path(name: String): String {
        val file = File(dir, name)
        if (!file.exists()) {
            context.assets.open(name).use { input -> file.outputStream().use { input.copyTo(it) } }
        }
        return file.absolutePath
    }
}

/**
 * The preview chain for a model, or null when the format can't be previewed.
 *
 * - NAM amp heads play through the fallback cab (they're captured without one).
 * - Other NAM gear (amp + cab, pedals, …) plays dry.
 * - IRs play the fallback amp into the IR.
 */
fun previewChain(model: Model, tone: Tone): (suspend () -> PreviewChain)? = when (tone.format) {
    Format.NAM -> {
        {
            val file = T3K.client.downloadModelFile(model.modelUrl, model.name)
            withContext(Dispatchers.IO) {
                PreviewChain(
                    modelPath = file.absolutePath,
                    irPath = if (tone.gear == Gear.AMP) PreviewAssets.fallbackCab else "",
                    inputPath = PreviewAssets.input,
                )
            }
        }
    }
    Format.IR -> {
        {
            val file = T3K.client.downloadModelFile(model.modelUrl, model.name)
            withContext(Dispatchers.IO) {
                PreviewChain(PreviewAssets.fallbackAmp, file.absolutePath, PreviewAssets.input)
            }
        }
    }
    else -> null
}

/** A tone plus the models the demos list for it. */
data class ToneWithModels(val tone: Tone, val models: List<Model>)

/** Fetch a tone and its models. NAM tones request A2 models. */
suspend fun fetchToneWithModels(toneId: Int): ToneWithModels {
    val tone = T3K.client.getTone(toneId, T3KConfig.demoArchitecture)
    return ToneWithModels(tone, T3K.client.listModels(toneId, T3KConfig.demoArchitecture).data)
}
