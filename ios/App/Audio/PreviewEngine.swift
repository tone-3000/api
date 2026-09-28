import AVFoundation
import Foundation

/// Swift wrapper around the shared C++ preview engine (`preview_engine.h`),
/// rendering through an `AVAudioSourceNode`.
///
/// The engine renders mono at 48 kHz — the rate TONE3000 NAM captures and the
/// bundled DI clip are recorded at — and AVAudioEngine resamples to the
/// hardware rate if needed.
final class PreviewEngine {
    static let sampleRate = 48_000.0
    /// Sized for ~20 ms callbacks so NAM/IR run fewer, larger blocks.
    static let maxFrames: Int32 = 1024

    private let handle: OpaquePointer
    private let audioEngine = AVAudioEngine()
    private var sourceNode: AVAudioSourceNode!

    struct LoadError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    init() {
        handle = pe_create(Self.sampleRate, Self.maxFrames)

        let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: Self.sampleRate,
            channels: 1,
            interleaved: false
        )!

        let pe = handle
        sourceNode = AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList -> OSStatus in
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            if let out = buffers[0].mData?.assumingMemoryBound(to: Float.self) {
                pe_process(pe, out, Int32(frameCount))
            }
            return noErr
        }

        audioEngine.attach(sourceNode)
        audioEngine.connect(sourceNode, to: audioEngine.mainMixerNode, format: format)
    }

    deinit {
        audioEngine.stop()
        pe_destroy(handle)
    }

    /// Load the chain. Empty paths clear the model / IR stage.
    /// Heavy (NAM parsing + prewarm) — call off the main thread.
    func load(_ chain: PreviewChain) throws {
        if pe_load_model(handle, chain.modelPath) != 0 { throw LoadError(message: String(cString: pe_last_error(handle))) }
        if pe_load_ir(handle, chain.irPath) != 0 { throw LoadError(message: String(cString: pe_last_error(handle))) }
        if pe_load_input(handle, chain.inputPath) != 0 { throw LoadError(message: String(cString: pe_last_error(handle))) }
    }

    func play() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default)
        try session.setPreferredSampleRate(Self.sampleRate)
        try session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)
        if !audioEngine.isRunning {
            audioEngine.prepare()
            try audioEngine.start()
        }
        pe_set_playing(handle, 1)
    }

    func pause() {
        pe_set_playing(handle, 0)
    }

    func stopAndRewind() {
        pe_set_playing(handle, 0)
        pe_seek_start(handle)
    }

    var isPlaying: Bool { pe_is_playing(handle) != 0 }
    var position: Double { pe_get_position(handle) }
    var duration: Double { pe_get_duration(handle) }
}
