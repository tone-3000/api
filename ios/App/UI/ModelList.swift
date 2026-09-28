import SwiftUI

/// Models for a tone, each with a preview player and a download action.
struct ModelList: View {
    let models: [Model]
    let tone: Tone

    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error {
                ErrorBanner(message: error) { self.error = nil }
            }
            if models.isEmpty {
                Text("No models available.").font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(models) { model in
                ModelRow(model: model, tone: tone) { error = $0 }
                if model.id != models.last?.id { Divider() }
            }
        }
    }
}

private struct ModelRow: View {
    let model: Model
    let tone: Tone
    let onError: (String) -> Void

    @State private var downloading = false
    @State private var fileURL: URL?

    var body: some View {
        HStack(spacing: 12) {
            if let resolve = previewChain(for: model, in: tone) {
                PreviewButton(id: "model-\(model.id)", resolve: resolve, onError: onError)
            } else {
                Text("Preview unavailable").font(.caption2).foregroundStyle(.secondary).frame(width: 64)
            }

            Text(model.name).font(.subheadline).lineLimit(2)
            Spacer()

            if let fileURL {
                ShareLink(item: fileURL) { Image(systemName: "square.and.arrow.up") }
            } else {
                Button {
                    Task {
                        downloading = true
                        defer { downloading = false }
                        do {
                            fileURL = try await t3k.downloadModelFile(model.modelUrl, filename: model.name)
                        } catch {
                            onError(error.message)
                        }
                    }
                } label: {
                    if downloading { ProgressView() } else { Image(systemName: "arrow.down.circle") }
                }
                .accessibilityLabel("Download model")
            }
        }
        .buttonStyle(.borderless)
    }
}
