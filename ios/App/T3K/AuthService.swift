import CryptoKit
import Foundation
import UIKit

/// TONE3000 OAuth 2.0 (authorization code + PKCE S256), mirroring the flow
/// helpers in web/src/tone3000-client.ts.
///
/// Uses a persistent in-app `WKWebView` (see `AuthBrowser.swift`) rather than
/// `ASWebAuthenticationSession`, which shows a system "Wants to Use … to Sign
/// In" prompt on every launch — wrong for a Select flow users open repeatedly.
/// Redirects to `T3KConfig.redirectURI` are intercepted by the web view, so no
/// URL-scheme handler is needed in Info.plist.

/// Catalog filters shared by the Select and Load Tone prompts.
struct CatalogOptions {
    /// Underscore-separated gear filter, e.g. `amp_amp-cab`.
    var gears: String?
    var format: Format?
    var architecture: Architecture? = T3KConfig.demoArchitecture
    /// Only show tones with at least one calibrated model.
    var calibrated = false
}

/// Options for any authorize request.
struct AuthorizeOptions {
    /// Show TONE3000's close menubar so users can back out of the flow.
    var menubar = true
    /// `zh-CN` for Simplified Chinese; nil for English.
    var locale: String?
    /// Prefill the sign-in email.
    var loginHint: String?
}

struct SelectOptions {
    var catalog = CatalogOptions()
    var auth = AuthorizeOptions()
    /// Show preview players inside the hosted catalog.
    var preview = true
}

struct OAuthOutcome {
    /// Selected (Select) or resolved (Load Tone) tone. May differ from the
    /// requested id when TONE3000 offers a replacement.
    let toneId: Int?
    /// The user closed TONE3000 after signing in, without choosing a tone.
    let canceled: Bool
}

enum OAuthError: LocalizedError {
    case notConfigured
    case canceled
    case stateMismatch
    case missingCode
    case server(String)
    case tokenExchangeFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Set T3K_PUBLISHABLE_KEY in ios/Config.local.xcconfig."
        case .canceled: return "TONE3000 was closed before signing in."
        case .stateMismatch: return "OAuth state mismatch."
        case .missingCode: return "OAuth callback is missing the authorization code."
        case .server(let error): return "TONE3000 sign-in failed: \(error)"
        case .tokenExchangeFailed(let error): return "Token exchange failed: \(error)"
        }
    }
}

@MainActor
final class AuthService {
    static let shared = AuthService()

    /// Standard OAuth — full API access. Silent if the user is already
    /// signed in to TONE3000 in the embedded browser.
    func startStandardFlow(_ auth: AuthorizeOptions = AuthorizeOptions()) async throws {
        _ = try await authorize(Self.authParams(auth))
    }

    /// `prompt=select_tone`: TONE3000 hosts browsing and returns `tone_id`.
    func startSelectFlow(_ options: SelectOptions) async throws -> OAuthOutcome {
        var params = Self.authParams(options.auth).merging(Self.catalogParams(options.catalog)) { $1 }
        params["prompt"] = "select_tone"
        if options.preview { params["preview"] = "true" }
        return try await authorize(params)
    }

    /// `prompt=load_tone`: TONE3000 checks access to `toneId` and, if it's
    /// private or deleted, lets the user pick a replacement.
    func startLoadToneFlow(toneId: Int, catalog: CatalogOptions = CatalogOptions(), auth: AuthorizeOptions = AuthorizeOptions()) async throws -> OAuthOutcome {
        var params = Self.authParams(auth).merging(Self.catalogParams(catalog)) { $1 }
        params["prompt"] = "load_tone"
        params["tone_id"] = String(toneId)
        return try await authorize(params)
    }

    // MARK: - Params

    private static func authParams(_ options: AuthorizeOptions) -> [String: String] {
        var params: [String: String] = [:]
        if options.menubar { params["menubar"] = "true" }
        if let locale = options.locale { params["locale"] = locale }
        if let hint = options.loginHint { params["login_hint"] = hint }
        return params
    }

    private static func catalogParams(_ options: CatalogOptions) -> [String: String] {
        var params: [String: String] = [:]
        if let gears = options.gears { params["gears"] = gears }
        if let format = options.format { params["format"] = format.rawValue }
        if let architecture = options.architecture { params["architecture"] = architecture.rawValue }
        if options.calibrated { params["calibrated"] = "true" }
        return params
    }

    // MARK: - PKCE

    private static func randomBase64url(_ count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes).base64urlEncoded()
    }

    private static func sha256Base64url(_ input: String) -> String {
        Data(SHA256.hash(data: Data(input.utf8))).base64urlEncoded()
    }

    // MARK: - Flow

    private func authorize(_ extraParams: [String: String]) async throws -> OAuthOutcome {
        guard !T3KConfig.publishableKey.isEmpty else { throw OAuthError.notConfigured }

        let codeVerifier = Self.randomBase64url(32)
        let codeChallenge = Self.sha256Base64url(codeVerifier)
        let state = Self.randomBase64url(16)

        var components = URLComponents(string: "\(T3KConfig.apiBase)/api/v1/oauth/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: T3KConfig.publishableKey),
            URLQueryItem(name: "redirect_uri", value: T3KConfig.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ] + extraParams.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }

        let callbackURL = try await presentBrowser(url: components.url!)
        let query = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func param(_ name: String) -> String? { query.first { $0.name == name }?.value }

        // Validate state before trusting anything else in the callback.
        guard param("state") == state else { throw OAuthError.stateMismatch }

        let canceled = param("canceled") == "true"
        if let error = param("error") {
            throw error == "access_denied" ? OAuthError.canceled : OAuthError.server(error)
        }
        guard let code = param("code") else {
            throw canceled ? OAuthError.canceled : OAuthError.missingCode
        }

        let tokens = try await exchangeCode(code, codeVerifier: codeVerifier)
        await t3k.setTokens(tokens)
        return OAuthOutcome(toneId: param("tone_id").flatMap(Int.init), canceled: canceled)
    }

    private func presentBrowser(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let browser = T3KAuthBrowserController(url: url, redirectScheme: T3KConfig.redirectScheme)
            browser.onCallback = { continuation.resume(with: $0) }
            let nav = UINavigationController(rootViewController: browser)
            nav.modalPresentationStyle = .pageSheet
            nav.presentationController?.delegate = browser
            nav.sheetPresentationController?.detents = [.large()]
            guard let presenter = Self.topViewController() else {
                continuation.resume(throwing: OAuthError.canceled)
                return
            }
            presenter.present(nav, animated: true)
        }
    }

    private static func topViewController() -> UIViewController? {
        let keyWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
        var controller = keyWindow?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller
    }

    private func exchangeCode(_ code: String, codeVerifier: String) async throws -> T3KTokens {
        var request = URLRequest(url: URL(string: "\(T3KConfig.apiBase)/api/v1/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formEncode([
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": codeVerifier,
            "redirect_uri": T3KConfig.redirectURI,
            "client_id": T3KConfig.publishableKey,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw OAuthError.tokenExchangeFailed(String(data: data, encoding: .utf8) ?? "")
        }
        return try T3KTokens(tokenResponse: data)
    }
}
