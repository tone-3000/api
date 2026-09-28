import SwiftUI

/// A saved preset. It's your app's own record: the only TONE3000 data it
/// needs is the tone ID; title and creator are cached for display and
/// refreshed each time the preset loads.
struct Preset: Identifiable, Codable, Hashable {
    var id = UUID()
    var toneId: Int
    var title: String
    var creator: String

    init(tone: Tone, id: UUID = UUID()) {
        self.id = id
        toneId = tone.id
        title = tone.title
        creator = tone.user.creatorName
    }
}

/// This demo keeps presets in UserDefaults — a real app would store them
/// wherever it keeps user data.
enum PresetStore {
    private static let key = "beacon_presets"

    static func load() -> [Preset] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Preset].self, from: data)) ?? []
    }

    static func save(_ presets: [Preset]) {
        UserDefaults.standard.set(try? JSONEncoder().encode(presets), forKey: key)
    }
}

/// Beacon Inc — Load Tone flow. Presets store TONE3000 tone IDs: add one by
/// picking a tone in the Select flow, then load it later. When connected, the
/// app loads straight from the API; otherwise (or when a tone has gone private
/// or been deleted) `prompt=load_tone` lets TONE3000 check access and offer a
/// replacement, which the preset then points to.
struct LoadToneDemoView: View {
    @State private var presets = PresetStore.load()
    @State private var loaded: ToneWithModels?
    @State private var replacedToneId: Int?
    @State private var activePresetId: UUID?
    @State private var loading = false
    @State private var error: String?
    @State private var info: String?

    var body: some View {
        List {
            if let error { Section { ErrorBanner(message: error) { self.error = nil } } }
            if let info { Section { InfoBanner(message: info) } }

            Section("Loaded tone") {
                if loading {
                    HStack { ProgressView(); Text("Syncing from TONE3000…").foregroundStyle(.secondary) }
                } else if let loaded {
                    if let replacedToneId {
                        InfoBanner(message: "Tone #\(replacedToneId) wasn't available, so TONE3000 offered a replacement. The preset now points to it.")
                    }
                    ToneRow(tone: loaded.tone)
                    ModelList(models: loaded.models, tone: loaded.tone)
                } else {
                    Text(presets.isEmpty ? "No tone loaded yet." : "No tone loaded yet. Load one of your presets below.")
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                if presets.isEmpty {
                    Text("Presets store a TONE3000 tone ID. Add one by picking a tone on TONE3000, then load it any time — TONE3000 checks access and offers a replacement if the tone becomes private or is deleted.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                ForEach(presets) { preset in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(preset.title).font(.headline).lineLimit(1)
                            Text(preset.creator).font(.caption).foregroundStyle(.secondary)
                            Text("TONE3000 Tone #\(preset.toneId)").font(.caption2).foregroundStyle(.tertiary)
                        }
                        Spacer()
                        Button("Load") { Task { await load(preset) } }
                            .buttonStyle(.borderedProminent)
                            .disabled(loading)
                    }
                    .listRowBackground(activePresetId == preset.id ? Color.accentColor.opacity(0.08) : nil)
                }
                .onDelete(perform: remove)
                Button("+ Add preset") { Task { await add() } }
                    .disabled(loading)
            } header: {
                Text("My presets")
            } footer: {
                if !presets.isEmpty { Text("Swipe a preset to remove it.") }
            }
        }
        .navigationTitle("Beacon Inc")
    }

    private func updatePresets(_ update: (inout [Preset]) -> Void) {
        update(&presets)
        PresetStore.save(presets)
    }

    private func reset() {
        error = nil
        info = nil
        replacedToneId = nil
    }

    /// Pick a tone in TONE3000 and save it as a new preset.
    private func add() async {
        reset()
        do {
            let outcome = try await AuthService.shared.startSelectFlow(SelectOptions())
            guard let toneId = outcome.toneId, !outcome.canceled else {
                info = "You closed TONE3000 without choosing a tone."
                return
            }
            loading = true
            defer { loading = false }
            let tone = try await fetchToneWithModels(toneId)
            let preset = Preset(tone: tone.tone)
            updatePresets { $0.append(preset) }
            activePresetId = preset.id
            loaded = tone
        } catch OAuthError.canceled {
            info = "You closed TONE3000 without choosing a tone."
        } catch {
            self.error = error.message
        }
    }

    /// Show a loaded tone and refresh the preset (or repoint it at a replacement).
    private func apply(_ tone: ToneWithModels, to preset: Preset) {
        loaded = tone
        replacedToneId = tone.tone.id != preset.toneId ? preset.toneId : nil
        updatePresets { presets in
            if let index = presets.firstIndex(where: { $0.id == preset.id }) {
                presets[index] = Preset(tone: tone.tone, id: preset.id)
            }
        }
    }

    private func load(_ preset: Preset) async {
        reset()
        activePresetId = preset.id

        // Already connected? Try the API directly and only fall back to the
        // Load Tone flow when TONE3000 needs to verify access.
        if await t3k.isConnected() {
            loading = true
            do {
                apply(try await fetchToneWithModels(preset.toneId), to: preset)
                loading = false
                return
            } catch {
                loading = false
            }
        }

        do {
            let outcome = try await AuthService.shared.startLoadToneFlow(toneId: preset.toneId, catalog: CatalogOptions())
            guard let toneId = outcome.toneId, !outcome.canceled else {
                info = "You closed TONE3000 without loading a tone."
                return
            }
            loading = true
            defer { loading = false }
            apply(try await fetchToneWithModels(toneId), to: preset)
        } catch OAuthError.canceled {
            info = "You closed TONE3000 without loading a tone."
        } catch {
            self.error = error.message
        }
    }

    private func remove(at offsets: IndexSet) {
        if let activePresetId, offsets.contains(where: { presets[$0].id == activePresetId }) {
            self.activePresetId = nil
            loaded = nil
        }
        updatePresets { $0.remove(atOffsets: offsets) }
    }
}
