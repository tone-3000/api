import Foundation

/// Local file paths for one preview play. Empty model/IR paths skip that stage.
struct PreviewChain: Equatable {
    let modelPath: String
    let irPath: String
    let inputPath: String
}

/// Bundled preview assets (from native/preview-assets), matching the web
/// player's defaults so previews sound the same on every platform.
enum PreviewAssets {
    /// Guitar DI clip played through every preview.
    static let input = bundled("di-guitar", "wav")
    /// Neutral amp used when previewing an IR on its own.
    static let fallbackAmp = bundled("fallback-amp", "nam")
    /// Cab IR used when previewing an amp-head capture on its own.
    static let fallbackCab = bundled("fallback-cab", "wav")

    private static func bundled(_ name: String, _ ext: String) -> String {
        Bundle.main.url(forResource: name, withExtension: ext)?.path ?? ""
    }
}

/// The preview chain for a model, or nil when the format can't be previewed.
///
/// - NAM amp heads play through the fallback cab (they're captured without one).
/// - Other NAM gear (amp + cab, pedals, …) plays dry.
/// - IRs play the fallback amp into the IR.
func previewChain(for model: Model, in tone: Tone) -> (() async throws -> PreviewChain)? {
    switch tone.format {
    case .nam:
        return {
            let path = try await t3k.downloadModelFile(model.modelUrl, filename: model.name).path
            return PreviewChain(
                modelPath: path,
                irPath: tone.gear == .amp ? PreviewAssets.fallbackCab : "",
                inputPath: PreviewAssets.input
            )
        }
    case .ir:
        return {
            let path = try await t3k.downloadModelFile(model.modelUrl, filename: model.name).path
            return PreviewChain(modelPath: PreviewAssets.fallbackAmp, irPath: path, inputPath: PreviewAssets.input)
        }
    default:
        return nil
    }
}

/// A tone plus the models the demos list for it.
struct ToneWithModels: Hashable {
    var tone: Tone
    let models: [Model]
}

/// Fetch a tone and its models, requesting A2 NAM captures. IRs ignore
/// `architecture`.
func fetchToneWithModels(_ toneId: Int) async throws -> ToneWithModels {
    let tone = try await t3k.getTone(id: toneId, architecture: T3KConfig.demoArchitecture)
    let models = try await t3k.listModels(toneId: toneId, architecture: T3KConfig.demoArchitecture).data
    return ToneWithModels(tone: tone, models: models)
}
