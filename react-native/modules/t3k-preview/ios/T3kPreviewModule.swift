import AVFoundation
import ExpoModulesCore

/// Expo module around the shared C++ preview engine (`preview_engine.h`).
/// See src/T3kPreviewModule.ts for the JavaScript API.
public class T3kPreviewModule: Module {
  private var engine: PreviewEngine?

  public func definition() -> ModuleDefinition {
    Name("T3kPreview")

    OnCreate {
      self.engine = PreviewEngine()
    }

    OnDestroy {
      self.engine = nil
    }

    /// Load a chain. Each path is a local file path, a bundled asset token
    /// ("fallback-amp" / "fallback-cab"), or "" to skip that stage.
    /// Heavy (NAM parsing + prewarm), so it runs off the JS thread.
    AsyncFunction("load") { (modelPath: String, irPath: String) in
      guard let engine = self.engine else { throw EngineUnavailable() }
      try engine.load(
        model: PreviewAssets.resolve(modelPath),
        ir: PreviewAssets.resolve(irPath),
        input: PreviewAssets.path("di-guitar", "wav")
      )
    }

    AsyncFunction("play") {
      try self.engine?.play()
    }

    Function("pause") {
      self.engine?.pause()
    }

    Function("stop") {
      self.engine?.stopAndRewind()
    }

    Function("getStatus") { () -> [String: Any] in
      guard let engine = self.engine else { return ["playing": false, "position": 0, "duration": 0] }
      return ["playing": engine.isPlaying, "position": engine.position, "duration": engine.duration]
    }
  }
}

struct EngineUnavailable: LocalizedError {
  var errorDescription: String? { "Preview engine is not available" }
}

/// DI clip + fallback amp/cab bundled from native/preview-assets.
enum PreviewAssets {
  private static let bundle: Bundle? = {
    let url = Bundle(for: T3kPreviewModule.self).url(forResource: "T3kPreviewAssets", withExtension: "bundle")
    return url.flatMap(Bundle.init(url:))
  }()

  static func path(_ name: String, _ ext: String) -> String {
    bundle?.url(forResource: name, withExtension: ext)?.path ?? ""
  }

  static func resolve(_ value: String) -> String {
    switch value {
    case "fallback-amp": return path("fallback-amp", "nam")
    case "fallback-cab": return path("fallback-cab", "wav")
    default: return value
    }
  }
}

/// Renders the engine through an `AVAudioSourceNode`. The engine runs mono at
/// 48 kHz (the rate TONE3000 captures and the DI clip use); AVAudioEngine
/// resamples to the hardware rate if needed.
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
      commonFormat: .pcmFormatFloat32, sampleRate: Self.sampleRate, channels: 1, interleaved: false
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

  func load(model: String, ir: String, input: String) throws {
    if pe_load_model(handle, model) != 0 { throw LoadError(message: String(cString: pe_last_error(handle))) }
    if pe_load_ir(handle, ir) != 0 { throw LoadError(message: String(cString: pe_last_error(handle))) }
    if pe_load_input(handle, input) != 0 { throw LoadError(message: String(cString: pe_last_error(handle))) }
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
