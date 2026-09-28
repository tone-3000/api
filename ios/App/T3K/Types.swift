import Foundation

// TONE3000 API v1 types (https://www.tone3000.com/api#types), mirroring
// web/src/types.ts. JSON keys are snake_case (see T3KClient's decoder).

// MARK: - Enums

enum Gear: String, Codable, CaseIterable, Identifiable {
    case amp
    case ampCab = "amp-cab"
    case pedal
    case outboard
    case cab
    case space
    case experimental

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        // `full-rig` is a deprecated alias for `amp-cab`.
        self = raw == "full-rig" ? .ampCab : Gear(rawValue: raw) ?? .experimental
    }

    var label: String {
        switch self {
        case .amp: return "Amp Head"
        case .ampCab: return "Amp + Cab"
        case .pedal: return "Pedal"
        case .outboard: return "Outboard"
        case .cab: return "Cabinet"
        case .space: return "Spaces"
        case .experimental: return "Experimental"
        }
    }
}

enum Format: String, Codable, CaseIterable, Identifiable {
    case nam
    case ir
    case aidaX = "aida-x"
    case aaSnapshot = "aa-snapshot"
    case proteus
    /// A format this client doesn't know yet. Never sent to the API.
    case unknown

    var id: String { rawValue }
    static var filterable: [Format] { allCases.filter { $0 != .unknown } }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Format(rawValue: raw) ?? .unknown
    }

    var label: String {
        switch self {
        case .nam: return "NAM"
        case .ir: return "IR"
        case .aidaX: return "AIDA-X"
        case .aaSnapshot: return "Snapshot"
        case .proteus: return "Proteus"
        case .unknown: return "Other"
        }
    }
}

/// NAM model architecture. Omitting `architecture` falls back to A1 + Custom.
enum Architecture: String, Codable {
    case a1 = "1"
    case a2 = "2"
    case custom

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let n = try? container.decode(Int.self) {
            self = n == 1 ? .a1 : .a2
        } else {
            self = Architecture(rawValue: try container.decode(String.self)) ?? .custom
        }
    }

    var label: String {
        switch self {
        case .a1: return "A1"
        case .a2: return "A2"
        case .custom: return "Custom"
        }
    }
}

enum TonesSort: String, CaseIterable, Identifiable {
    case trending
    case newest
    case oldest
    case downloadsAllTime = "downloads-all-time"
    case bestMatch = "best-match"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .trending: return "Trending"
        case .newest: return "Newest"
        case .oldest: return "Oldest"
        case .downloadsAllTime: return "Most downloaded"
        case .bestMatch: return "Best match"
        }
    }
}

enum UsersSort: String, CaseIterable, Identifiable {
    case tones, downloads, favorites, models
    var id: String { rawValue }
    var label: String { "Most \(rawValue)" }
}

enum TaxonomySort: String, CaseIterable, Identifiable {
    case tones, name
    var id: String { rawValue }
    var label: String { self == .tones ? "Most tones" : "A–Z" }
}

// MARK: - Resources

/// Numeric IDs that tolerate being serialized as strings.
struct FlexibleID: Codable, Hashable, CustomStringConvertible {
    let value: String
    var description: String { value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let n = try? container.decode(Int.self) {
            value = String(n)
        } else {
            value = try container.decode(String.self)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

/// Creator attribution fields shared by every user shape.
protocol CreatorInfo {
    var username: String { get }
    /// Only ever set for verified creators.
    var displayName: String? { get }
    var isVerified: Bool? { get }
    var avatarUrl: String? { get }
}

extension CreatorInfo {
    var creatorName: String { displayName ?? "@\(username)" }
}

struct EmbeddedUser: Codable, Hashable, CreatorInfo {
    let id: FlexibleID
    let username: String
    let displayName: String?
    let isVerified: Bool?
    let avatarUrl: String?
    let url: String?
}

/// The authenticated user, from GET /user.
struct User: Codable, Hashable, CreatorInfo {
    let id: FlexibleID
    let username: String
    let displayName: String?
    let isVerified: Bool?
    let avatarUrl: String?
    let url: String?
    let bio: String?
    let links: [String]?
    let createdAt: String?
}

/// A public user with content counts, from GET /users.
struct PublicUser: Codable, Hashable, Identifiable, CreatorInfo {
    let id: FlexibleID
    let username: String
    let displayName: String?
    let isVerified: Bool?
    let bio: String?
    let avatarUrl: String?
    let downloadsCount: Int?
    let favoritesCount: Int?
    let modelsCount: Int?
    let tonesCount: Int?
    let url: String?
}

struct Make: Codable, Hashable {
    let id: FlexibleID?
    let name: String
}

struct Tag: Codable, Hashable {
    let id: FlexibleID?
    let name: String
}

/// A make or tag with its public tone count, from GET /makes and GET /tags.
struct TaxonomyItem: Codable, Hashable, Identifiable {
    let id: FlexibleID
    let name: String
    let tonesCount: Int?
}

struct Tone: Codable, Hashable, Identifiable {
    let id: Int
    let user: EmbeddedUser
    let createdAt: String?
    let publishedAt: String?
    let title: String
    let description: String?
    let gear: Gear
    let images: [String]?
    let isPublic: Bool?
    let format: Format
    let license: String?
    let makes: [Make]?
    let tags: [Tag]?
    let modelsCount: Int?
    let a1ModelsCount: Int?
    let a2ModelsCount: Int?
    let irsCount: Int?
    let customModelsCount: Int?
    let downloadsCount: Int?
    let favoritesCount: Int?
    /// Whether the authenticated user has favorited this tone.
    var isFavorite: Bool?
    let url: String?
}

struct Model: Codable, Hashable, Identifiable {
    let id: Int
    /// Pre-built download URL. Fetch it with your Bearer token.
    let modelUrl: String
    let name: String
    let size: String?
    let toneId: Int?
    /// Architecture for NAM models; nil for non-NAM (e.g. IR).
    let architectureVersion: Architecture?
}

/// GET /tones/{id}/download (approved partners only).
struct ToneDownload: Codable {
    /// Temporary, unauthenticated zip URL. Expires in 1 hour.
    let url: String
    let expiresAt: String?
    let filename: String?
}

struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let page: Int
    let pageSize: Int
    let total: Int
    let totalPages: Int
}

/// Trending and latest feeds: capped at 10, not paginated.
struct ToneFeed: Codable {
    let data: [Tone]
}

// MARK: - Request params

struct SearchTonesParams: Equatable {
    var query: String?
    var page: Int = 1
    var pageSize: Int = 12
    var sort: TonesSort = .trending
    var gears: [Gear] = []
    /// Model format. Filtering IRs goes here, not through `gears`.
    var format: Format?
    var architecture: Architecture? = T3KConfig.demoArchitecture
    /// Exact names; values within one field are OR'd, fields are AND'd.
    var tags: [String] = []
    var makes: [String] = []
    var creators: [String] = []
    var calibrated = false
    var verified = false
}

enum LibraryList: String, CaseIterable, Identifiable {
    case favorited, created, downloaded
    var id: String { rawValue }
    var label: String {
        switch self {
        case .favorited: return "Favorites"
        case .created: return "Created"
        case .downloaded: return "Downloaded"
        }
    }
}
