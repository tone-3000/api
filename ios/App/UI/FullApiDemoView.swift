import SwiftUI

/// Chord Inc — Full API. A custom tone UI built on the REST API, plus a
/// persistent "Browse TONE3000" Select entry point into the full catalog.
struct FullApiDemoView: View {
    enum TabId: Hashable { case library, discover, search, catalog, profile }

    @State private var connected: Bool?
    @State private var tab = TabId.library
    @State private var route: ToneRoute?
    @State private var searchPreset = SearchTonesParams()
    @State private var searchKey = 0
    @State private var error: String?

    var body: some View {
        Group {
            switch connected {
            case .none:
                ProgressView()
            case .some(false):
                ConnectView { await connect() }
            case .some(true):
                tabs
            }
        }
        .navigationTitle("Chord Inc")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $route) { ToneDetailView(toneId: $0.id) }
        .task { connected = await t3k.isConnected() }
    }

    private var tabs: some View {
        TabView(selection: $tab) {
            LibraryTab(open: open).tabItem { Label("Library", systemImage: "music.note.list") }.tag(TabId.library)
            DiscoverTab(open: open).tabItem { Label("Discover", systemImage: "sparkles") }.tag(TabId.discover)
            SearchTab(initial: searchPreset, open: open)
                .id(searchKey)
                .tabItem { Label("Search", systemImage: "magnifyingglass") }.tag(TabId.search)
            CatalogTab(onSearch: search).tabItem { Label("Catalog", systemImage: "tag") }.tag(TabId.catalog)
            ProfileTab().tabItem { Label("Profile", systemImage: "person.crop.circle") }.tag(TabId.profile)
        }
        .safeAreaInset(edge: .top) {
            if let error { ErrorBanner(message: error) { self.error = nil }.padding(.horizontal) }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Browse TONE3000", systemImage: "square.grid.2x2") { Task { await browse() } }
                    Button("Disconnect", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                        Task {
                            await t3k.clearTokens()
                            connected = false
                        }
                    }
                } label: {
                    Label("TONE3000", systemImage: "ellipsis.circle")
                } primaryAction: {
                    Task { await browse() }
                }
            }
        }
    }

    private func open(_ tone: Tone) { route = ToneRoute(id: tone.id) }

    private func search(_ params: SearchTonesParams) {
        searchPreset = params
        searchKey += 1
        tab = .search
    }

    private func connect() async {
        do {
            try await AuthService.shared.startStandardFlow()
            connected = true
        } catch OAuthError.canceled {
            // stay on the connect screen
        } catch {
            self.error = error.message
        }
    }

    /// The Select flow as a catalog entry point: open the picked tone's detail.
    private func browse() async {
        do {
            let outcome = try await AuthService.shared.startSelectFlow(SelectOptions())
            if let toneId = outcome.toneId { route = ToneRoute(id: toneId) }
        } catch OAuthError.canceled {
        } catch {
            self.error = error.message
        }
    }
}

private struct ConnectView: View {
    let connect: () async -> Void
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "waveform.circle.fill").font(.system(size: 56)).foregroundStyle(Color.accentColor)
            Text("Chord Inc × TONE3000").font(.title2.weight(.bold))
            Text("Connect your TONE3000 account to browse a massive library of Neural Amp Modeler captures and IRs of real gear, created by a global community of musicians.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            T3KButton(title: "Continue", busy: busy) {
                Task {
                    busy = true
                    await connect()
                    busy = false
                }
            }
        }
        .padding(32)
    }
}

// MARK: - Library

private struct LibraryTab: View {
    let open: (Tone) -> Void

    @State private var list = LibraryList.favorited
    @State private var gear: Gear?
    @State private var query = ""
    @State private var page = 1
    @State private var result: PaginatedResponse<Tone>?
    @State private var error: String?

    private struct Key: Equatable { let list: LibraryList; let gear: Gear?; let query: String; let page: Int }

    var body: some View {
        List {
            Section {
                Picker("List", selection: $list) {
                    ForEach(LibraryList.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                GearPicker(gear: $gear)
            }
            ToneResults(tones: result?.data, error: error, empty: "Nothing here yet.", open: open)
            if let result { Pager(page: $page, totalPages: result.totalPages) }
        }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Filter by title")
        .onChange(of: list) { page = 1 }
        .onChange(of: gear) { page = 1 }
        .onChange(of: query) { page = 1 }
        .task(id: Key(list: list, gear: gear, query: query, page: page)) {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            do {
                result = try await t3k.listLibrary(list, gear: gear, query: query, page: page)
                error = nil
            } catch {
                if !Task.isCancelled { self.error = error.message }
            }
        }
    }
}

// MARK: - Discover

private struct DiscoverTab: View {
    let open: (Tone) -> Void

    @State private var gear: Gear?
    @State private var trending: [Tone]?
    @State private var latest: [Tone]?
    @State private var error: String?

    var body: some View {
        List {
            if let error { ErrorBanner(message: error) }
            Section {
                GearPicker(gear: $gear)
                ToneResults(tones: trending, error: nil, open: open)
            } header: {
                Text("Trending")
            }
            Section("Latest") {
                ToneResults(tones: latest, error: nil, open: open)
            }
        }
        .task(id: gear) {
            do { trending = try await t3k.listTrendingTones(gear: gear).data } catch { self.error = error.message }
        }
        .task {
            do { latest = try await t3k.listLatestTones().data } catch { self.error = error.message }
        }
    }
}

// MARK: - Search

private struct SearchTab: View {
    let open: (Tone) -> Void

    @State private var params: SearchTonesParams
    @State private var result: PaginatedResponse<Tone>?
    @State private var error: String?

    init(initial: SearchTonesParams, open: @escaping (Tone) -> Void) {
        self.open = open
        var params = initial
        params.format = params.format ?? .nam
        params.architecture = T3KConfig.demoArchitecture
        _params = State(initialValue: params)
    }

    private var query: Binding<String> {
        Binding(get: { params.query ?? "" }, set: { params.query = $0; params.page = 1 })
    }

    private func names(_ keyPath: WritableKeyPath<SearchTonesParams, [String]>) -> Binding<[String]> {
        Binding(get: { params[keyPath: keyPath] }, set: { params[keyPath: keyPath] = $0; params.page = 1 })
    }

    private static let suggestionCount = 8

    private static func toneCount(_ n: Int?) -> String {
        let n = n ?? 0
        return "\(n) \(n == 1 ? "tone" : "tones")"
    }

    private static func suggestTags(_ query: String) async throws -> [Suggestion] {
        try await t3k.listTags(query: query, pageSize: suggestionCount).data
            .map { Suggestion(name: $0.name, hint: toneCount($0.tonesCount)) }
    }

    private static func suggestMakes(_ query: String) async throws -> [Suggestion] {
        try await t3k.listMakes(query: query, pageSize: suggestionCount).data
            .map { Suggestion(name: $0.name, hint: toneCount($0.tonesCount)) }
    }

    private static func suggestCreators(_ query: String) async throws -> [Suggestion] {
        try await t3k.listUsers(query: query, pageSize: suggestionCount).data
            .map { Suggestion(name: $0.username, hint: $0.displayName ?? toneCount($0.tonesCount)) }
    }

    var body: some View {
        List {
            Section {
                InfoBanner(message: "Search is heavily rate-limited. For catalog browsing in production, prefer the Select flow (Browse TONE3000).")
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            Section {
                Picker("Sort", selection: $params.sort) {
                    ForEach(TonesSort.allCases) { Text($0.label).tag($0) }
                }
                Picker("Gear", selection: Binding(get: { params.gears.first }, set: { params.gears = $0.map { [$0] } ?? [] })) {
                    Text("All gear").tag(Gear?.none)
                    ForEach(Gear.allCases) { Text($0.label).tag(Gear?.some($0)) }
                }
                Picker("Format", selection: $params.format) {
                    ForEach([Format.nam, .ir]) { Text($0.label).tag(Format?.some($0)) }
                }
                Toggle("Calibrated only", isOn: $params.calibrated)
                Toggle("Verified creators only", isOn: $params.verified)
            }
            SuggestPicker(title: "Tags", prompt: "Type a tag", values: names(\.tags), suggest: Self.suggestTags)
            SuggestPicker(title: "Makes & models", prompt: "Type a make or model", values: names(\.makes), suggest: Self.suggestMakes)
            SuggestPicker(title: "Creators", prompt: "Type a username", values: names(\.creators), suggest: Self.suggestCreators)
            ToneResults(tones: result?.data, error: error, open: open)
            if let result { Pager(page: $params.page, totalPages: result.totalPages) }
        }
        .searchable(text: query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search tones")
        .task(id: params) {
            // Debounce: .task(id:) cancels the previous run on every change.
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            do {
                result = try await t3k.searchTones(params)
                error = nil
            } catch {
                if !Task.isCancelled { self.error = error.message }
            }
        }
    }
}

// MARK: - Catalog: makes, tags, creators

private struct CatalogTab: View {
    enum Kind: String, CaseIterable, Identifiable {
        case makes = "Makes", tags = "Tags", creators = "Creators"
        var id: String { rawValue }
    }

    let onSearch: (SearchTonesParams) -> Void

    @State private var kind = Kind.makes
    @State private var query = ""
    @State private var taxonomySort = TaxonomySort.tones
    @State private var usersSort = UsersSort.tones
    @State private var page = 1
    @State private var items: PaginatedResponse<TaxonomyItem>?
    @State private var users: PaginatedResponse<PublicUser>?
    @State private var error: String?

    private struct Key: Equatable {
        let kind: Kind; let query: String; let taxonomySort: TaxonomySort; let usersSort: UsersSort; let page: Int
    }

    var body: some View {
        List {
            Section {
                Picker("Kind", selection: $kind) {
                    ForEach(Kind.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                if kind == .creators {
                    Picker("Sort", selection: $usersSort) {
                        ForEach(UsersSort.allCases) { Text($0.label).tag($0) }
                    }
                } else {
                    Picker("Sort", selection: $taxonomySort) {
                        ForEach(TaxonomySort.allCases) { Text($0.label).tag($0) }
                    }
                }
            } footer: {
                Text("Tap an entry to search tones with it.")
            }

            if let error { ErrorBanner(message: error) }

            if kind == .creators {
                ForEach(users?.data ?? []) { user in
                    Button {
                        onSearch(SearchTonesParams(creators: [user.username]))
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            CreatorBadge(user: user, large: true)
                            if let bio = user.bio, !bio.isEmpty {
                                Text(bio).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Text("\(user.tonesCount ?? 0) tones · \(user.downloadsCount ?? 0) downloads")
                                .font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                    .foregroundStyle(.primary)
                }
                if let users { Pager(page: $page, totalPages: users.totalPages) }
            } else {
                ForEach(items?.data ?? []) { item in
                    Button {
                        onSearch(kind == .makes ? SearchTonesParams(makes: [item.name]) : SearchTonesParams(tags: [item.name]))
                    } label: {
                        LabeledContent(item.name, value: "\(item.tonesCount ?? 0)")
                    }
                    .foregroundStyle(.primary)
                }
                if let items { Pager(page: $page, totalPages: items.totalPages) }
            }
        }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search \(kind.rawValue.lowercased())")
        .onChange(of: kind) { page = 1; items = nil; users = nil }
        .onChange(of: query) { page = 1 }
        .task(id: Key(kind: kind, query: query, taxonomySort: taxonomySort, usersSort: usersSort, page: page)) {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            do {
                switch kind {
                case .makes: items = try await t3k.listMakes(query: query, sort: taxonomySort, page: page)
                case .tags: items = try await t3k.listTags(query: query, sort: taxonomySort, page: page)
                case .creators: users = try await t3k.listUsers(query: query, sort: usersSort, page: page)
                }
                error = nil
            } catch {
                if !Task.isCancelled { self.error = error.message }
            }
        }
    }
}

// MARK: - Profile

private struct ProfileTab: View {
    @State private var user: User?
    @State private var error: String?

    var body: some View {
        List {
            if let error { ErrorBanner(message: error) }
            if let user {
                Section {
                    CreatorBadge(user: user, large: true)
                    if let bio = user.bio, !bio.isEmpty { Text(bio).foregroundStyle(.secondary) }
                    LabeledContent("Username", value: "@\(user.username)")
                    if let createdAt = user.createdAt { LabeledContent("Joined", value: String(createdAt.prefix(10))) }
                }
                if let links = user.links, !links.isEmpty {
                    Section("Links") {
                        ForEach(links, id: \.self) { link in
                            if let url = URL(string: link) { Link(link, destination: url) } else { Text(link) }
                        }
                    }
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .task {
            do { user = try await t3k.getUser() } catch { self.error = error.message }
        }
    }
}

// MARK: - Shared

private struct GearPicker: View {
    @Binding var gear: Gear?

    var body: some View {
        Picker("Gear", selection: $gear) {
            Text("All gear").tag(Gear?.none)
            ForEach(Gear.allCases) { Text($0.label).tag(Gear?.some($0)) }
        }
    }
}

private struct ToneResults: View {
    let tones: [Tone]?
    let error: String?
    var empty = "No tones found."
    let open: (Tone) -> Void

    var body: some View {
        if let error {
            ErrorBanner(message: error)
        } else if let tones {
            if tones.isEmpty {
                Text(empty).foregroundStyle(.secondary)
            }
            ForEach(tones) { tone in
                Button { open(tone) } label: { ToneRow(tone: tone) }
                    .foregroundStyle(.primary)
            }
        } else {
            HStack { Spacer(); ProgressView(); Spacer() }
        }
    }
}
