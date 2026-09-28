import SwiftUI

enum Demo: String, Hashable, CaseIterable {
    case select, loadTone, fullApi
}

/// Entry screen: one card per integration pattern, matching the web example.
struct LandingView: View {
    @State private var connected = false

    var body: some View {
        List {
            Section {
                Text("Reference integrations showing how to build against the TONE3000 API.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Link("View API documentation", destination: URL(string: "https://www.tone3000.com/api")!)
            }

            Section("Low-code (OAuth prompts)") {
                NavigationLink(value: Demo.select) {
                    DemoCard(
                        tag: "Select Flow",
                        name: "Acme Inc",
                        product: "Guitar Amp Simulation App",
                        description: "Users browse the TONE3000 catalog and pick a tone to load. TONE3000 hosts the browsing UI."
                    )
                }
                NavigationLink(value: Demo.loadTone) {
                    DemoCard(
                        tag: "Load Tone Flow",
                        name: "Beacon Inc",
                        product: "Rig Preset Management App",
                        description: "Saved presets store tone IDs and sync them on demand. TONE3000 handles access checks and replacements."
                    )
                }
            }

            Section("Full API") {
                NavigationLink(value: Demo.fullApi) {
                    DemoCard(
                        tag: "Full API Integration",
                        name: "Chord Inc",
                        product: "Tone Discovery & Management App",
                        description: "A custom tone UI on the REST API: library, discover, search, makes & tags, creators, favorites and downloads."
                    )
                }
            }

            if connected {
                Section {
                    Button("Disconnect TONE3000", role: .destructive) {
                        Task {
                            await t3k.clearTokens()
                            connected = false
                        }
                    }
                }
            }
        }
        .navigationTitle("TONE3000 Examples")
        .navigationDestination(for: Demo.self) { demo in
            switch demo {
            case .select: SelectDemoView()
            case .loadTone: LoadToneDemoView()
            case .fullApi: FullApiDemoView()
            }
        }
        .task { connected = await t3k.isConnected() }
        .onAppear { Task { connected = await t3k.isConnected() } }
    }
}

private struct DemoCard: View {
    let tag: String
    let name: String
    let product: String
    let description: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(tag.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(Color.accentColor)
            Text(name).font(.headline)
            Text(product).font(.subheadline).foregroundStyle(.secondary)
            Text(description).font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
