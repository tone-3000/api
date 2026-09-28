import CryptoKit
import Foundation

/// OAuth token set. `expiresAt` is absolute, computed from `expires_in`.
struct T3KTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date

    /// Parse a POST /oauth/token response body.
    init(tokenResponse data: Data) throws {
        struct Raw: Codable {
            let accessToken: String
            let refreshToken: String
            let expiresIn: Double
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let raw = try decoder.decode(Raw.self, from: data)
        accessToken = raw.accessToken
        refreshToken = raw.refreshToken
        expiresAt = Date().addingTimeInterval(raw.expiresIn)
    }
}

enum T3KError: LocalizedError {
    case notAuthenticated
    case http(status: Int, context: String)

    var status: Int? {
        if case .http(let status, _) = self { return status }
        return nil
    }

    var isNotFound: Bool { status == 404 }
    var isForbidden: Bool { status == 403 }
    var isRateLimit: Bool { status == 429 }

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not connected to TONE3000."
        case .http(429, _):
            return "Too many requests — wait a moment and try again."
        case .http(let status, let context):
            return "\(context) failed (HTTP \(status))."
        }
    }
}

/// Shared client instance used by every demo.
let t3k = T3KClient()

/// Authenticated TONE3000 API client, mirroring web/src/tone3000-client.ts:
/// - Tokens persist in the Keychain.
/// - Proactive refresh 60s before expiry.
/// - Single-flight refresh: concurrent callers share one refresh task.
/// - Retry once on 401 (expiry races between the check and the request).
/// - A 400/401 from the token endpoint (`invalid_grant`) ends the session and
///   clears tokens; other refresh failures are transient and keep them.
actor T3KClient {
    private static let keychainAccount = "t3k_tokens"

    private var cachedTokens: T3KTokens??
    private var refreshTask: Task<T3KTokens, Error>?

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    // MARK: - Token storage

    func setTokens(_ tokens: T3KTokens) {
        cachedTokens = tokens
        if let data = try? JSONEncoder().encode(tokens) {
            KeychainStore.save(data, account: Self.keychainAccount)
        }
    }

    func getTokens() -> T3KTokens? {
        if let cached = cachedTokens { return cached }
        let loaded = KeychainStore.load(account: Self.keychainAccount)
            .flatMap { try? JSONDecoder().decode(T3KTokens.self, from: $0) }
        cachedTokens = .some(loaded)
        return loaded
    }

    func clearTokens() {
        cachedTokens = .some(nil)
        KeychainStore.delete(account: Self.keychainAccount)
    }

    func isConnected() -> Bool {
        getTokens() != nil
    }

    // MARK: - Token refresh

    private func accessToken(forceRefresh: Bool = false) async throws -> String {
        guard let tokens = getTokens() else { throw T3KError.notAuthenticated }

        guard forceRefresh || Date() > tokens.expiresAt.addingTimeInterval(-60) else {
            return tokens.accessToken
        }

        if refreshTask == nil {
            let refreshToken = tokens.refreshToken
            refreshTask = Task {
                defer { self.refreshTask = nil }
                do {
                    let refreshed = try await Self.refreshTokens(refreshToken: refreshToken)
                    self.setTokens(refreshed)
                    return refreshed
                } catch let error as T3KError where error.status == 400 || error.status == 401 {
                    self.clearTokens()
                    throw T3KError.notAuthenticated
                }
            }
        }
        return try await refreshTask!.value.accessToken
    }

    private static func refreshTokens(refreshToken: String) async throws -> T3KTokens {
        var request = URLRequest(url: URL(string: "\(T3KConfig.apiBase)/api/v1/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formEncode([
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "client_id": T3KConfig.publishableKey,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw T3KError.http(status: status, context: "Token refresh") }
        return try T3KTokens(tokenResponse: data)
    }

    // MARK: - Authenticated requests

    /// Authenticated request returning the raw body. Retries once on 401.
    private func request(
        _ method: String = "GET",
        _ path: String,
        query: [URLQueryItem] = [],
        context: String
    ) async throws -> Data {
        func perform(token: String) async throws -> (Data, HTTPURLResponse?) {
            var components = URLComponents(string: "\(T3KConfig.apiBase)\(path)")!
            if !query.isEmpty { components.queryItems = query }
            var request = URLRequest(url: components.url!)
            request.httpMethod = method
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: request)
            return (data, response as? HTTPURLResponse)
        }

        var (data, response) = try await perform(token: accessToken())
        if response?.statusCode == 401 {
            (data, response) = try await perform(token: accessToken(forceRefresh: true))
        }
        if let deprecations = response?.value(forHTTPHeaderField: "X-Tone3000-Deprecations") {
            print("[TONE3000] \(method) \(path) uses deprecated params: \(deprecations)")
        }
        let status = response?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw T3KError.http(status: status, context: context) }
        return data
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], context: String) async throws -> T {
        try decoder.decode(T.self, from: await request("GET", path, query: query, context: context))
    }

    // MARK: - Users

    func getUser() async throws -> User {
        try await get("/api/v1/user", context: "Get user")
    }

    /// Public creators. Max page_size is 10.
    func listUsers(query text: String? = nil, sort: UsersSort = .tones, page: Int = 1, pageSize: Int = 10) async throws -> PaginatedResponse<PublicUser> {
        var query = pageQuery(page, pageSize)
        query.append(URLQueryItem(name: "sort", value: sort.rawValue))
        if let text, !text.isEmpty { query.append(URLQueryItem(name: "query", value: text)) }
        return try await get("/api/v1/users", query: query, context: "List users")
    }

    // MARK: - Tones

    func getTone(id: Int, architecture: Architecture? = T3KConfig.demoArchitecture) async throws -> Tone {
        var query: [URLQueryItem] = []
        if let architecture { query.append(URLQueryItem(name: "architecture", value: architecture.rawValue)) }
        return try await get("/api/v1/tones/\(id)", query: query, context: "Get tone")
    }

    /// Search the catalog. Heavily rate-limited — debounce user input.
    func searchTones(_ params: SearchTonesParams) async throws -> PaginatedResponse<Tone> {
        var query = pageQuery(params.page, params.pageSize)
        if let q = params.query, !q.isEmpty { query.append(URLQueryItem(name: "query", value: q)) }
        query.append(URLQueryItem(name: "sort", value: params.sort.rawValue))
        if !params.gears.isEmpty {
            query.append(URLQueryItem(name: "gears", value: params.gears.map(\.rawValue).joined(separator: "_")))
        }
        if let format = params.format { query.append(URLQueryItem(name: "format", value: format.rawValue)) }
        if let architecture = params.architecture {
            query.append(URLQueryItem(name: "architecture", value: architecture.rawValue))
        }
        if !params.tags.isEmpty { query.append(URLQueryItem(name: "tags", value: params.tags.joined(separator: "_"))) }
        if !params.makes.isEmpty { query.append(URLQueryItem(name: "makes", value: params.makes.joined(separator: "_"))) }
        if !params.creators.isEmpty {
            query.append(URLQueryItem(name: "creators", value: params.creators.joined(separator: ",")))
        }
        if params.calibrated { query.append(URLQueryItem(name: "calibrated", value: "true")) }
        if params.verified { query.append(URLQueryItem(name: "verified", value: "true")) }
        return try await get("/api/v1/tones/search", query: query, context: "Search")
    }

    /// The user's favorited / created / downloaded tones.
    func listLibrary(_ list: LibraryList, gear: Gear? = nil, query text: String? = nil, page: Int = 1, pageSize: Int = 12) async throws -> PaginatedResponse<Tone> {
        var query = pageQuery(page, pageSize)
        if let gear { query.append(URLQueryItem(name: "gear", value: gear.rawValue)) }
        if let text, !text.isEmpty { query.append(URLQueryItem(name: "query", value: text)) }
        return try await get("/api/v1/tones/\(list.rawValue)", query: query, context: "List \(list.label.lowercased())")
    }

    func listTrendingTones(gear: Gear? = nil) async throws -> ToneFeed {
        var query: [URLQueryItem] = []
        if let gear { query.append(URLQueryItem(name: "gear", value: gear.rawValue)) }
        return try await get("/api/v1/tones/trending", query: query, context: "Trending")
    }

    func listLatestTones() async throws -> ToneFeed {
        try await get("/api/v1/tones/latest", context: "Latest")
    }

    func favoriteTone(id: Int) async throws {
        _ = try await request("PUT", "/api/v1/tones/\(id)/favorite", context: "Favorite")
    }

    func unfavoriteTone(id: Int) async throws {
        _ = try await request("DELETE", "/api/v1/tones/\(id)/favorite", context: "Unfavorite")
    }

    /// Temporary zip URL for every model in a tone. Approved partners only (403 otherwise).
    func getToneDownload(id: Int) async throws -> ToneDownload {
        try await get("/api/v1/tones/\(id)/download", context: "Tone download")
    }

    // MARK: - Models

    func listModels(toneId: Int, architecture: Architecture? = nil, page: Int = 1, pageSize: Int = 100) async throws -> PaginatedResponse<Model> {
        var query = pageQuery(page, pageSize)
        query.append(URLQueryItem(name: "tone_id", value: String(toneId)))
        if let architecture { query.append(URLQueryItem(name: "architecture", value: architecture.rawValue)) }
        return try await get("/api/v1/models", query: query, context: "List models")
    }

    // MARK: - Makes & tags

    func listMakes(query text: String? = nil, sort: TaxonomySort = .tones, page: Int = 1, pageSize: Int = 25) async throws -> PaginatedResponse<TaxonomyItem> {
        try await get("/api/v1/makes", query: taxonomyQuery(text, sort, page, pageSize), context: "List makes")
    }

    func listTags(query text: String? = nil, sort: TaxonomySort = .tones, page: Int = 1, pageSize: Int = 25) async throws -> PaginatedResponse<TaxonomyItem> {
        try await get("/api/v1/tags", query: taxonomyQuery(text, sort, page, pageSize), context: "List tags")
    }

    // MARK: - Model files

    /// Download a model/IR file (Bearer auth) into the on-disk cache and return
    /// its local URL. Files are immutable per URL, so cache hits skip the network.
    func downloadModelFile(_ modelUrl: String, filename: String? = nil) async throws -> URL {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("t3k-models", isDirectory: true)
        let digest = SHA256.hash(data: Data(modelUrl.utf8)).map { String(format: "%02x", $0) }.joined()
        let dir = cacheDir.appendingPathComponent(digest, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let ext = URL(string: modelUrl)?.pathExtension ?? ""
        let base = filename.map(Self.sanitize) ?? "model"
        let destination = dir.appendingPathComponent(ext.isEmpty || base.hasSuffix(".\(ext)") ? base : "\(base).\(ext)")

        if FileManager.default.fileExists(atPath: destination.path) { return destination }

        // Strip the origin so the request goes through the authenticated path.
        let path = modelUrl.replacingOccurrences(of: T3KConfig.apiBase, with: "")
        let data = try await request("GET", path, context: "Download model")
        try data.write(to: destination, options: .atomic)
        return destination
    }

    // MARK: - Helpers

    private func pageQuery(_ page: Int, _ pageSize: Int) -> [URLQueryItem] {
        [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "page_size", value: String(pageSize))]
    }

    private func taxonomyQuery(_ text: String?, _ sort: TaxonomySort, _ page: Int, _ pageSize: Int) -> [URLQueryItem] {
        var query = pageQuery(page, pageSize)
        query.append(URLQueryItem(name: "sort", value: sort.rawValue))
        if let text, !text.isEmpty { query.append(URLQueryItem(name: "query", value: text)) }
        return query
    }

    private static func sanitize(_ name: String) -> String {
        let cleaned = name.components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>")).joined(separator: "-")
        return cleaned.isEmpty ? "model" : cleaned
    }
}

func formEncode(_ params: [String: String]) -> Data {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return params
        .map { key, value in
            let encoded = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
            return "\(key)=\(encoded)"
        }
        .joined(separator: "&")
        .data(using: .utf8)!
}

extension Data {
    func base64urlEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
