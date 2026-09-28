import Foundation

/// TONE3000 configuration, injected from Config.xcconfig via Info.plist.
enum T3KConfig {
    static let publishableKey: String = infoString("T3KPublishableKey")

    /// API origin, e.g. https://www.tone3000.com (no trailing slash).
    static let apiBase: String = "https://" + infoString("T3KAPIHost", fallback: "www.tone3000.com")

    /// Custom scheme registered as a redirect URI on the publishable key.
    static let redirectScheme = infoString("T3KRedirectScheme", fallback: "tone3000-example")
    static let redirectURI = "\(redirectScheme)://oauth/callback"

    /// A2 is the current NAM architecture; every demo requests it explicitly
    /// (omitting `architecture` falls back to A1 + Custom).
    static let demoArchitecture = Architecture.a2

    private static func infoString(_ key: String, fallback: String = "") -> String {
        let value = Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
        return value.isEmpty ? fallback : value
    }
}
