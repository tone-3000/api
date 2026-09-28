package com.example.tone3000.audio

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PreviewPlayerState(
    val activePlayerId: String? = null,
    val isPlaying: Boolean = false,
    val loadingPlayerId: String? = null,
    val progress: Float = 0f,
)

/**
 * App-wide preview playback state, mirroring the web player's shared
 * `T3kPlayerProvider`: one engine, one active player id, and progress.
 */
class PreviewPlayer(private val scope: CoroutineScope) {

    private val engine by lazy { PreviewEngine() }

    private val _state = MutableStateFlow(PreviewPlayerState())
    val state: StateFlow<PreviewPlayerState> = _state.asStateFlow()

    /** Chain currently loaded into the engine, to skip redundant reloads. */
    private var loadedChain: PreviewChain? = null
    private var progressJob: Job? = null

    /**
     * Toggle playback for player [id]. [resolve] performs the (possibly
     * network-bound) model download on first play. Throws on failure.
     */
    suspend fun togglePlay(id: String, resolve: suspend () -> PreviewChain) {
        val current = _state.value
        if (current.activePlayerId == id && current.isPlaying) {
            engine.pause()
            setPlaying(false)
            return
        }

        _state.update { it.copy(loadingPlayerId = id) }
        try {
            val chain = resolve()

            // Switching players reloads and rewinds; resuming continues in place.
            if (loadedChain != chain || _state.value.activePlayerId != id) {
                engine.stopAndRewind()
                setPlaying(false)
                withContext(Dispatchers.Default) { engine.load(chain) }
                loadedChain = chain
            }

            _state.update { it.copy(activePlayerId = id) }
            check(engine.play()) { "Couldn't start the audio stream." }
            setPlaying(true)
        } finally {
            _state.update { it.copy(loadingPlayerId = null) }
        }
    }

    fun stop() {
        engine.stopAndRewind()
        setPlaying(false)
        _state.update { it.copy(activePlayerId = null) }
    }

    private fun setPlaying(playing: Boolean) {
        progressJob?.cancel()
        progressJob = null
        _state.update {
            it.copy(isPlaying = playing, progress = if (!playing && engine.position == 0.0) 0f else it.progress)
        }

        if (playing) {
            progressJob = scope.launch {
                while (true) {
                    delay(33)
                    // The engine auto-stops and rewinds at the end of the clip.
                    if (!engine.isPlaying) {
                        _state.update { it.copy(isPlaying = false, progress = 0f) }
                        break
                    }
                    val duration = engine.duration
                    val progress = if (duration > 0) (engine.position / duration).toFloat() else 0f
                    _state.update { it.copy(progress = progress.coerceIn(0f, 1f)) }
                }
            }
        }
    }
}
