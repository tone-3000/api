import SwiftUI

/// Identifies a tone to push onto the navigation stack.
struct ToneRoute: Hashable, Identifiable {
    let id: Int
}

/// Full tone detail: attribution, favorite, zip download, stats, and models
/// with preview players.
struct ToneDetailView: View {
    let toneId: Int

    @State private var detail: ToneWithModels?
    @State private var error: String?
    @State private var favoriteBusy = false
    @State private var zipBusy = false
    @State private var zipNote: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        Group {
            if let detail {
                content(detail)
            } else if let error {
                ErrorBanner(message: error).padding()
            } else {
                ProgressView("Loading tone…")
            }
        }
        .navigationTitle(detail?.tone.title ?? "Tone")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: toneId) {
            do {
                detail = try await fetchToneWithModels(toneId)
            } catch {
                self.error = error.message
            }
        }
    }

    private func content(_ detail: ToneWithModels) -> some View {
        let tone = detail.tone
        return List {
            Section {
                if let image = tone.images?.first, let url = URL(string: image) {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color(.secondarySystemFill) }
                        .frame(height: 200)
                        .clipped()
                        .listRowInsets(EdgeInsets())
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text(tone.title).font(.title2.weight(.bold))
                    CreatorBadge(user: tone.user, large: true)
                    HStack(spacing: 4) {
                        Badge(text: tone.gear.label, tint: .purple)
                        Badge(text: tone.format.label, tint: .blue)
                        if tone.isPublic == false { Badge(text: "Private") }
                    }
                    if let description = tone.description, !description.isEmpty {
                        Text(description).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                Button {
                    Task { await toggleFavorite() }
                } label: {
                    Label(tone.isFavorite == true ? "Favorited" : "Favorite",
                          systemImage: tone.isFavorite == true ? "star.fill" : "star")
                }
                .disabled(favoriteBusy)

                Button {
                    Task { await downloadZip(tone) }
                } label: {
                    Label(zipBusy ? "Preparing zip…" : "Download all (.zip)", systemImage: "archivebox")
                }
                .disabled(zipBusy)
                if let zipNote {
                    Text(zipNote).font(.caption).foregroundStyle(.secondary)
                }

                if let link = tone.url, let url = URL(string: link) {
                    Link(destination: url) { Label("View on TONE3000", systemImage: "safari") }
                }
            }

            Section("Stats") {
                LabeledContent("Downloads", value: "\(tone.downloadsCount ?? 0)")
                LabeledContent("Favorites", value: "\(tone.favoritesCount ?? 0)")
                if tone.format == .ir {
                    LabeledContent("IRs", value: "\(tone.irsCount ?? 0)")
                } else {
                    LabeledContent("Models", value: "\(tone.modelsCount ?? 0)")
                }
                if let license = tone.license { LabeledContent("License", value: license) }
                if let makes = tone.makes, !makes.isEmpty {
                    LabeledContent("Makes", value: makes.map(\.name).joined(separator: ", "))
                }
                if let tags = tone.tags, !tags.isEmpty {
                    LabeledContent("Tags", value: tags.map { "#\($0.name)" }.joined(separator: " "))
                }
            }

            Section("Models (\(detail.models.count))") {
                ModelList(models: detail.models, tone: tone)
            }
        }
    }

    private func toggleFavorite() async {
        guard var current = detail else { return }
        favoriteBusy = true
        defer { favoriteBusy = false }
        do {
            if current.tone.isFavorite == true {
                try await t3k.unfavoriteTone(id: current.tone.id)
            } else {
                try await t3k.favoriteTone(id: current.tone.id)
            }
            current.tone.isFavorite = !(current.tone.isFavorite ?? false)
            detail = current
        } catch {
            self.error = error.message
        }
    }

    private func downloadZip(_ tone: Tone) async {
        zipBusy = true
        zipNote = nil
        defer { zipBusy = false }
        do {
            let download = try await t3k.getToneDownload(id: tone.id)
            if let url = URL(string: download.url) { openURL(url) }
        } catch let error as T3KError where error.isForbidden {
            zipNote = "Zip downloads are limited to approved partners — download models individually below."
        } catch {
            zipNote = error.message
        }
    }
}
