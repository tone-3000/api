import UIKit
import WebKit

/// In-app TONE3000 browser used for OAuth and the hosted Select / Load Tone UI.
///
/// Uses the default `WKWebsiteDataStore`, so cookies and localStorage persist
/// across presentations and app launches. One web view instance is reused for
/// the life of the process, so an existing TONE3000 session is still there the
/// next time Select opens.
final class T3KAuthBrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIAdaptivePresentationControllerDelegate {
    var onCallback: ((Result<URL, Error>) -> Void)?

    private let initialURL: URL
    private let redirectScheme: String
    private var finished = false

    init(url: URL, redirectScheme: String) {
        self.initialURL = url
        self.redirectScheme = redirectScheme
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "TONE3000"
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .close,
            target: self,
            action: #selector(cancel)
        )

        let webView = T3KWebSession.shared.webView
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.removeFromSuperview()
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        webView.load(URLRequest(url: initialURL))
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || navigationController?.isBeingDismissed == true {
            finish(.failure(OAuthError.canceled))
        }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finish(.failure(OAuthError.canceled))
    }

    @objc private func cancel() {
        finish(.failure(OAuthError.canceled))
        dismiss(animated: true)
    }

    private func finish(_ result: Result<URL, Error>) {
        guard !finished else { return }
        finished = true
        let webView = T3KWebSession.shared.webView
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        onCallback?(result)
        onCallback = nil
    }

    private func handleRedirect(_ url: URL) -> Bool {
        guard url.scheme == redirectScheme else { return false }
        finish(.success(url))
        dismiss(animated: true)
        return true
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url, handleRedirect(url) {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    /// `target="_blank"` links load in place instead of spawning a window.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url, !handleRedirect(url) {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        if let url = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL {
            _ = handleRedirect(url)
        }
    }
}

/// Process-wide WebKit session: persistent cookies plus one reused `WKWebView`
/// so sessionStorage also survives for the rest of the launch.
enum T3KWebSession {
    static let shared = Holder()

    final class Holder {
        let webView: WKWebView

        init() {
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .default()
            config.allowsInlineMediaPlayback = true
            // The hosted catalog's preview players start on a user tap.
            config.mediaTypesRequiringUserActionForPlayback = []
            let view = WKWebView(frame: .zero, configuration: config)
            view.allowsBackForwardNavigationGestures = true
            webView = view
        }
    }
}
