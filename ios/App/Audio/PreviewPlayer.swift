import Foundation
import Observation

/// App-wide preview playback state, mirroring the web player's shared
/// `T3kPlayerProvider`: one engine, one active player id, and progress.
@Observable @MainActor
final class PreviewPlayer {
    static let shared = PreviewPlayer()

    private let engine = PreviewEngine()

    private(set) var activePlayerId: String?
    private(set) var isPlaying = false
    private(set) var loadingPlayerId: String?
    private(set) var progress: Double = 0

    /// Chain currently loaded into the engine, to skip redundant reloads.
    private var loadedChain: PreviewChain?
    private var progressTimer: Timer?

    /// Toggle playback for player `id`. `resolve` performs the (possibly
    /// network-bound) model download on first play.
    func togglePlay(id: String, resolve: @escaping () async throws -> PreviewChain) async throws {
        if activePlayerId == id, isPlaying {
            engine.pause()
            setPlaying(false)
            return
        }

        loadingPlayerId = id
        defer { loadingPlayerId = nil }

        let chain = try await resolve()

        // Switching players reloads and rewinds; resuming continues in place.
        if loadedChain != chain || activePlayerId != id {
            engine.stopAndRewind()
            setPlaying(false)
            let engine = self.engine
            try await Task.detached(priority: .userInitiated) { try engine.load(chain) }.value
            loadedChain = chain
        }

        activePlayerId = id
        try engine.play()
        setPlaying(true)
    }

    func stop() {
        engine.stopAndRewind()
        setPlaying(false)
        activePlayerId = nil
    }

    private func setPlaying(_ playing: Bool) {
        isPlaying = playing
        progressTimer?.invalidate()
        progressTimer = nil

        if playing {
            progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
        } else if engine.position == 0 {
            progress = 0
        }
    }

    private func tick() {
        let duration = engine.duration
        progress = duration > 0 ? min(1, engine.position / duration) : 0

        // The engine auto-stops and rewinds at the end of the clip.
        if !engine.isPlaying, isPlaying {
            setPlaying(false)
            progress = 0
        }
    }
}
