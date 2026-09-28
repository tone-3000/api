package com.example.tone3000.preview

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Expo module around the shared C++ preview engine (`preview_engine.h`).
 * See src/T3kPreviewModule.ts for the JavaScript API.
 */
class T3kPreviewModule : Module() {
  private var engine: PreviewEngine? = null

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("Preview engine needs a React context")

  override fun definition() = ModuleDefinition {
    Name("T3kPreview")

    OnCreate {
      engine = PreviewEngine()
    }

    OnDestroy {
      engine?.release()
      engine = null
    }

    // Each path is a local file path, a bundled asset token ("fallback-amp" /
    // "fallback-cab"), or "" to skip that stage. Heavy (NAM parsing + prewarm),
    // so it runs off the JS thread.
    AsyncFunction("load") { modelPath: String, irPath: String ->
      val engine = engine ?: throw CodedException("Preview engine is not available")
      val assets = PreviewAssets(context)
      engine.load(assets.resolve(modelPath), assets.resolve(irPath), assets.path("di-guitar.wav"))
    }

    AsyncFunction("play") {
      if (engine?.play() != true) throw CodedException("Couldn't start audio output")
    }

    Function("pause") {
      engine?.pause()
    }

    Function("stop") {
      engine?.stopAndRewind()
    }

    Function("getStatus") {
      val engine = engine
      mapOf(
        "playing" to (engine?.isPlaying ?: false),
        "position" to (engine?.position ?: 0.0),
        "duration" to (engine?.duration ?: 0.0),
      )
    }
  }
}

/** DI clip + fallback amp/cab. The engine loads from file paths, so they're copied out of the APK once. */
private class PreviewAssets(context: Context) {
  private val assets = context.assets
  private val dir = File(context.filesDir, "t3k-preview-assets").apply { mkdirs() }

  fun path(name: String): String {
    val file = File(dir, name)
    if (!file.exists()) {
      assets.open(name).use { input -> file.outputStream().use { input.copyTo(it) } }
    }
    return file.absolutePath
  }

  fun resolve(value: String): String = when (value) {
    "fallback-amp" -> path("fallback-amp.nam")
    "fallback-cab" -> path("fallback-cab.wav")
    else -> value
  }
}

/** Kotlin face of the native engine; output runs through an Oboe stream (preview_engine_jni.cpp). */
class PreviewEngine {
  private val handle: Long = nativeCreate()

  fun load(modelPath: String, irPath: String, inputPath: String) {
    nativeLoad(handle, modelPath, irPath, inputPath)?.let { throw CodedException(it) }
  }

  fun play(): Boolean = nativeSetPlaying(handle, true)

  fun pause() {
    nativeSetPlaying(handle, false)
  }

  fun stopAndRewind() {
    nativeSetPlaying(handle, false)
    nativeSeekStart(handle)
  }

  val isPlaying: Boolean get() = nativeIsPlaying(handle)
  val position: Double get() = nativeGetPosition(handle)
  val duration: Double get() = nativeGetDuration(handle)

  fun release() = nativeDestroy(handle)

  private external fun nativeCreate(): Long
  private external fun nativeDestroy(handle: Long)
  private external fun nativeLoad(handle: Long, modelPath: String, irPath: String, inputPath: String): String?
  private external fun nativeSetPlaying(handle: Long, playing: Boolean): Boolean
  private external fun nativeIsPlaying(handle: Long): Boolean
  private external fun nativeGetPosition(handle: Long): Double
  private external fun nativeGetDuration(handle: Long): Double
  private external fun nativeSeekStart(handle: Long)

  companion object {
    init {
      System.loadLibrary("t3k_preview")
    }
  }
}
