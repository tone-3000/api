import SwiftUI

struct Suggestion: Hashable {
    let name: String
    /// Secondary text, e.g. a tone count or display name.
    var hint: String?
}

/// Pick exact names (tags, makes, creators) for a search filter. Typing looks
/// up matches through the API, so the filter only ever holds names that exist.
struct SuggestPicker: View {
    let title: String
    let prompt: String
    @Binding var values: [String]
    let suggest: (String) async throws -> [Suggestion]

    @State private var query = ""
    @State private var suggestions: [Suggestion] = []
    @State private var loading = false

    private var trimmed: String { query.trimmingCharacters(in: .whitespaces) }
    private var options: [Suggestion] { suggestions.filter { !values.contains($0.name) } }

    var body: some View {
        Section(title) {
            if !values.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(values, id: \.self) { value in
                            Button {
                                values.removeAll { $0 == value }
                            } label: {
                                HStack(spacing: 4) {
                                    Text(value)
                                    Image(systemName: "xmark").font(.caption2.bold())
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .buttonBorderShape(.capsule)
                            .controlSize(.small)
                        }
                    }
                }
            }
            TextField(prompt, text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !trimmed.isEmpty {
                if options.isEmpty {
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    else { Text("No matches.").foregroundStyle(.secondary) }
                }
                ForEach(options, id: \.name) { suggestion in
                    Button {
                        values.append(suggestion.name)
                        query = ""
                    } label: {
                        HStack {
                            Text(suggestion.name).foregroundStyle(.primary)
                            Spacer()
                            if let hint = suggestion.hint { Text(hint).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
        }
        .task(id: trimmed) {
            guard !trimmed.isEmpty else { suggestions = []; loading = false; return }
            loading = true
            // Debounce: .task(id:) cancels the previous run on every keystroke.
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let results = (try? await suggest(trimmed)) ?? []
            guard !Task.isCancelled else { return }
            suggestions = results
            loading = false
        }
    }
}
