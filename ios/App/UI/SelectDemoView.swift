import SwiftUI

/// Acme Inc — Select flow. TONE3000 hosts catalog browsing; the app gets a
/// `tone_id` back and loads its models into the preview player.
struct SelectDemoView: View {
    enum Scope: String, CaseIterable, Identifiable {
        case ampCab, ampPedal, cabIR, allNAM
        var id: String { rawValue }

        var label: String {
            switch self {
            case .ampCab: return "Amp + Cab"
            case .ampPedal: return "Amps and pedals"
            case .cabIR: return "Cabinet IRs"
            case .allNAM: return "All NAM captures"
            }
        }

        var catalog: CatalogOptions {
            switch self {
            case .ampCab: return CatalogOptions(gears: "amp-cab", format: .nam)
            case .ampPedal: return CatalogOptions(gears: "amp_pedal", format: .nam)
            case .cabIR: return CatalogOptions(gears: "cab", format: .ir)
            case .allNAM: return CatalogOptions(format: .nam)
            }
        }
    }

    @State private var scope = Scope.ampCab
    @State private var preview = true
    @State private var chinese = false

    @State private var selected: ToneWithModels?
    @State private var loading = false
    @State private var error: String?
    @State private var info: String?

    var body: some View {
        List {
            Section("Select flow options") {
                Picker("Catalog", selection: $scope) {
                    ForEach(Scope.allCases) { Text($0.label).tag($0) }
                }
                Toggle("Preview players", isOn: $preview)
                Toggle("简体中文 (zh-CN)", isOn: $chinese)
            }

            Section {
                T3KButton(title: selected == nil ? "Browse TONE3000" : "Choose another tone", busy: loading) {
                    Task { await select() }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            if let error { Section { ErrorBanner(message: error) { self.error = nil } } }
            if let info { Section { InfoBanner(message: info) } }

            if let selected {
                Section("Selected tone") { ToneRow(tone: selected.tone) }
                Section("Models") { ModelList(models: selected.models, tone: selected.tone) }
            }
        }
        .navigationTitle("Acme Inc")
    }

    private func select() async {
        error = nil
        info = nil
        let options = SelectOptions(
            catalog: scope.catalog,
            auth: AuthorizeOptions(menubar: true, locale: chinese ? "zh-CN" : nil),
            preview: preview
        )
        do {
            let outcome = try await AuthService.shared.startSelectFlow(options)
            guard let toneId = outcome.toneId, !outcome.canceled else {
                info = "You closed TONE3000 without selecting a tone."
                return
            }
            loading = true
            defer { loading = false }
            selected = try await fetchToneWithModels(toneId)
        } catch OAuthError.canceled {
            info = "You closed TONE3000 without selecting a tone."
        } catch {
            self.error = error.message
        }
    }
}
