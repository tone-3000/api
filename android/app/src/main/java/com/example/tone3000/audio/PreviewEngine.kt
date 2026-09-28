package com.example.tone3000.audio

/**
 * Kotlin face of the shared native preview engine (see
 * `native/preview-engine/preview_engine.h` and `preview_engine_jni.cpp`).
 * Output runs through an Oboe low-latency stream whose callback pulls from
 * `pe_process`.
 */
class PreviewEngine {
    private val handle: Long = nativeCreate()

    /** Load the chain. Heavy (NAM parsing + prewarm) — call off the main thread. */
    fun load(chain: PreviewChain) {
        nativeLoad(handle, chain.modelPath, chain.irPath, chain.inputPath)?.let { throw IllegalStateException(it) }
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
